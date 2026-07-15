#!/usr/bin/env python3
"""Live search-quality benchmark for the /documents/search endpoint.

Runs a set of corpus-grounded Polish/English legal queries against a running
backend and reports recall (hit counts) and latency. When an LLM judge is
enabled it also reports precision@K — the fraction of the top-K returned
excerpts an LLM judges topically relevant to the query intent.

This is the harness referenced by the `bench-search` poe task and by
tests/fixtures/search_queries.yaml. It is a *diagnostic* tool (not a CI gate):
CI required checks do not run SQL / hit live services.

Usage
-----
    # backend must be running (default http://localhost:8004)
    poetry run poe bench-search
    # or
    JUDDGES_BENCHMARK_API_URL=http://127.0.0.1:8005 \
        BACKEND_API_KEY=... poetry run python scripts/search_benchmark.py

    # add LLM-judged precision@K (needs a real OPENAI_API_KEY):
    SEARCH_LLM_JUDGE=1 JUDGE_MODEL=gpt-4.1-mini ... poetry run python scripts/search_benchmark.py

Env
---
    JUDDGES_BENCHMARK_API_URL / BENCHMARK_API_URL  default http://localhost:8004
    BACKEND_API_KEY                                required
    BENCH_TOPK                                     default 5
    SEARCH_LLM_JUDGE=1                             enable LLM precision@K
    JUDGE_MODEL                                    default gpt-4.1-mini
    BENCH_OUT                                      optional JSON output path

Context (issue #318): the current endpoint ranks whole judgments on
`title||summary`, which for this corpus are boilerplate `LEFT(full_text,500)`
headers, so precision@5 measures ~0.34-0.38. The chunk-level RPC
`search_chunks_by_embedding` (fixed in migration 20260715000002) ranks the real
329k chunk embeddings and measures ~1.00 on the same queries — see the issue for
the A/B. Rewiring this endpoint onto chunk ranking is the recommended follow-up.
"""

from __future__ import annotations

import asyncio
import json
import os
import statistics
import sys
import time
from typing import Any

import httpx

# Corpus-grounded queries: this corpus is criminal-appellate dominant
# (PL Sąd Apelacyjny + UK Crown Court). Each carries an `intent` used by the
# optional LLM judge. `min_hits` is a recall floor for the non-judge run.
QUERIES: list[dict[str, Any]] = [
    {"id": "Q01_nietrzezwosc", "query": "jazda w stanie nietrzeźwości prowadzenie pojazdu",
     "intent": "Prowadzenie pojazdu w stanie nietrzeźwości; kara, zakaz prowadzenia.", "min_hits": 5},
    {"id": "Q02_narkotyki", "query": "posiadanie i obrót środkami odurzającymi narkotyki",
     "intent": "Przestępstwa narkotykowe — posiadanie, udzielanie, obrót środkami odurzającymi.", "min_hits": 5},
    {"id": "Q03_kradziez", "query": "kradzież z włamaniem rozbój",
     "intent": "Przestępstwa przeciwko mieniu — kradzież z włamaniem, rozbój.", "min_hits": 5},
    {"id": "Q04_znecanie", "query": "znęcanie się nad członkiem rodziny przemoc domowa",
     "intent": "Znęcanie się nad osobą najbliższą (art. 207 k.k.), przemoc domowa.", "min_hits": 5},
    {"id": "Q05_wymiar_kary", "query": "wymiar kary okoliczności łagodzące i obciążające",
     "intent": "Sądowy wymiar kary, okoliczności łagodzące i obciążające.", "min_hits": 5},
    {"id": "Q06_uszczerbek", "query": "spowodowanie ciężkiego uszczerbku na zdrowiu pobicie",
     "intent": "Przestępstwa przeciwko zdrowiu — uszczerbek na zdrowiu, pobicie.", "min_hits": 5},
    {"id": "Q07_odszkodowanie", "query": "odszkodowanie i zadośćuczynienie za doznaną szkodę i krzywdę",
     "intent": "Odszkodowanie za szkodę majątkową i zadośćuczynienie za krzywdę.", "min_hits": 5},
    {"id": "Q08_apelacja_karna", "query": "apelacja obrońcy od wyroku skazującego błąd w ustaleniach faktycznych",
     "intent": "Apelacja w sprawie karnej — zarzuty apelacyjne, błąd w ustaleniach faktycznych.", "min_hits": 5},
    {"id": "Q09_gbh", "query": "sentencing for causing grievous bodily harm with intent",
     "intent": "Sentencing for GBH / wounding with intent (s.18 OAPA); aggravating/mitigating factors.", "min_hits": 5},
    {"id": "Q10_appeal_conviction", "query": "appeal against conviction unsafe verdict fresh evidence",
     "intent": "Appeal against a criminal conviction — safety of the verdict, fresh evidence.", "min_hits": 5},
]

API_URL = (os.getenv("JUDDGES_BENCHMARK_API_URL") or os.getenv("BENCHMARK_API_URL")
           or "http://localhost:8004")
API_KEY = os.getenv("BACKEND_API_KEY", "")
TOPK = int(os.getenv("BENCH_TOPK", "5"))
USE_JUDGE = os.getenv("SEARCH_LLM_JUDGE") == "1"
JUDGE_MODEL = os.getenv("JUDGE_MODEL", "gpt-4.1-mini")

JUDGE_SYS = (
    "You are a bilingual (Polish/English) legal search-quality judge. Given a "
    "search INTENT and a retrieved judgment excerpt, decide whether the excerpt is "
    "topically relevant to the intent (same legal issue, not merely a shared word or "
    "generic court boilerplate). Respond ONLY as JSON {\"is_valid\": <bool>}."
)


async def _search(client: httpx.AsyncClient, query: str) -> dict[str, Any]:
    t0 = time.perf_counter()
    r = await client.post("/documents/search",
                          json={"query": query, "limit_docs": TOPK, "limit": TOPK,
                                "result_view": "full"},
                          headers={"X-API-Key": API_KEY})
    latency_ms = (time.perf_counter() - t0) * 1000
    r.raise_for_status()
    return {"data": r.json(), "latency_ms": latency_ms}


async def _judge(oai, intent: str, text: str) -> bool | None:
    """True/False = judged relevant/not; None = judge errored (excluded from P@K)."""
    if not text.strip():
        return False
    try:
        c = await oai.chat.completions.create(
            model=JUDGE_MODEL, response_format={"type": "json_object"}, temperature=0,
            messages=[{"role": "system", "content": JUDGE_SYS},
                      {"role": "user", "content": f"INTENT:\n{intent}\n\nEXCERPT:\n{text[:1800]}"}])
        return bool(json.loads(c.choices[0].message.content or "{}").get("is_valid", False))
    except Exception as e:  # noqa: BLE001 — don't let a judge API failure look like a bad result
        print(f"  judge error (excluded): {type(e).__name__}: {e}", file=sys.stderr)
        return None


async def main() -> int:
    if not API_KEY:
        print("BACKEND_API_KEY not set", file=sys.stderr)
        return 2

    oai = None
    if USE_JUDGE:
        try:
            from openai import AsyncOpenAI
            oai = AsyncOpenAI()
        except Exception as e:  # noqa: BLE001
            print(f"LLM judge requested but unavailable ({e}); reporting recall only")

    results: list[dict[str, Any]] = []
    async with httpx.AsyncClient(base_url=API_URL, timeout=90.0) as client:
        for q in QUERIES:
            try:
                res = await _search(client, q["query"])
            except Exception as e:  # noqa: BLE001 — diagnostic tool: don't abort the run
                print(f"{q['id']}: request failed ({type(e).__name__}: {e})", file=sys.stderr)
                results.append({"id": q["id"], "hits": 0, "latency_ms": 0.0,
                                "query_type": None, "min_hits_ok": False, "error": str(e)})
                continue
            data = res["data"]
            chunks = (data.get("chunks") or [])[:TOPK]
            tb = data.get("timing_breakdown") or {}
            row: dict[str, Any] = {
                "id": q["id"], "hits": len(data.get("chunks") or []),
                "latency_ms": round(res["latency_ms"], 1),
                "query_type": tb.get("query_type"),
                "min_hits_ok": len(data.get("chunks") or []) >= q.get("min_hits", 0),
            }
            if oai is not None:
                verdicts = await asyncio.gather(
                    *[_judge(oai, q["intent"], c.get("chunk_text", "") or "") for c in chunks])
                judged = [v for v in verdicts if v is not None]  # drop judge errors
                row["precision_at_k"] = round(sum(judged) / len(judged), 3) if judged else 0.0
                row["judged_n"] = len(judged)
            results.append(row)

    print(f"\n=== SEARCH BENCHMARK ({API_URL}) ===")
    header = f"{'id':<24}{'hits':>5}{'lat_ms':>9}  qtype"
    if oai is not None:
        header = f"{'id':<24}{'hits':>5}{'P@K':>7}{'lat_ms':>9}  qtype"
    print(header)
    for r in results:
        line = f"{r['id']:<24}{r['hits']:>5}"
        if oai is not None:
            line += f"{r.get('precision_at_k', 0.0):>7.2f}"
        line += f"{r['latency_ms']:>9.0f}  {r['query_type']}"
        print(line)

    lats = [r["latency_ms"] for r in results if "error" not in r]  # exclude failed requests
    n_err = sum(1 for r in results if "error" in r)
    print("\n--- aggregate ---")
    print(f"queries: {len(results)}  failed: {n_err}  "
          f"min_hits_ok: {sum(r['min_hits_ok'] for r in results)}/{len(results)}")
    if lats:
        print(f"latency mean/max ms: {statistics.mean(lats):.0f} / {max(lats):.0f}")
    if oai is not None:
        precs = [r["precision_at_k"] for r in results if "precision_at_k" in r]
        if precs:
            print(f"mean precision@{TOPK}: {statistics.mean(precs):.3f}  (judge={JUDGE_MODEL})")

    out = os.getenv("BENCH_OUT")
    if out:
        with open(out, "w") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
