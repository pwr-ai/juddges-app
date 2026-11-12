"""Gunicorn worker-count resolution in the production entrypoint (#547).

The previous Dockerfile CMD defaulted to ``$(nproc) * 2 + 1``. ``nproc``
ignores the compose ``cpus:`` limit, so a fresh 48-core host with no
``GUNICORN_WORKERS`` in ``.env`` booted 97 workers into an 8-CPU container.
These tests run the real script against a fake cgroup tree.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "backend/docker/start-gunicorn.sh"

SH = shutil.which("sh")

pytestmark = [
    pytest.mark.unit,
    pytest.mark.skipif(SH is None, reason="needs a POSIX sh"),
]


def _host_nproc() -> int:
    # `nproc` reports the CPUs in this process's affinity mask.
    return len(os.sched_getaffinity(0))


def _resolve(tmp_path: Path, env: dict[str, str] | None = None) -> int:
    run_env = {k: v for k, v in os.environ.items() if not k.startswith("GUNICORN_")}
    run_env["CGROUP_ROOT"] = str(tmp_path)
    run_env.update(env or {})
    result = subprocess.run(  # noqa: S603 - fixed argv, repo script
        [str(SH), str(SCRIPT), "--print-workers"],
        capture_output=True,
        text=True,
        env=run_env,
        check=True,
    )
    return int(result.stdout.strip())


def test_cgroup_v2_quota_is_used_instead_of_host_cores_and_capped(
    tmp_path: Path,
) -> None:
    """compose ``cpus: '8'`` → cpu.max ``800000 100000`` → 17, capped at 8."""
    (tmp_path / "cpu.max").write_text("800000 100000\n")
    assert _resolve(tmp_path) == 8


def test_fractional_quota_rounds_up(tmp_path: Path) -> None:
    (tmp_path / "cpu.max").write_text("150000 100000\n")  # 1.5 CPUs → 2
    assert _resolve(tmp_path) == 5


def test_cgroup_v1_quota_is_honoured(tmp_path: Path) -> None:
    cpu = tmp_path / "cpu"
    cpu.mkdir()
    (cpu / "cpu.cfs_quota_us").write_text("200000\n")
    (cpu / "cpu.cfs_period_us").write_text("100000\n")
    assert _resolve(tmp_path) == 5


def test_unlimited_quota_falls_back_to_nproc_but_stays_capped(tmp_path: Path) -> None:
    (tmp_path / "cpu.max").write_text("max 100000\n")
    assert _resolve(tmp_path) == min(_host_nproc() * 2 + 1, 8)


def test_no_cgroup_files_falls_back_to_nproc(tmp_path: Path) -> None:
    assert _resolve(tmp_path, {"GUNICORN_MAX_WORKERS": "1000"}) == _host_nproc() * 2 + 1


def test_explicit_pin_wins_and_is_not_capped(tmp_path: Path) -> None:
    (tmp_path / "cpu.max").write_text("800000 100000\n")
    assert _resolve(tmp_path, {"GUNICORN_WORKERS": "12"}) == 12


def test_empty_pin_from_compose_uses_the_default(tmp_path: Path) -> None:
    """docker-compose passes ``GUNICORN_WORKERS=`` (empty) when .env omits it."""
    (tmp_path / "cpu.max").write_text("200000 100000\n")
    assert _resolve(tmp_path, {"GUNICORN_WORKERS": ""}) == 5


@pytest.mark.parametrize("bad", ["0", "-3", "eight", "4.5"])
def test_invalid_pin_is_ignored(tmp_path: Path, bad: str) -> None:
    (tmp_path / "cpu.max").write_text("100000 100000\n")
    assert _resolve(tmp_path, {"GUNICORN_WORKERS": bad}) == 3


def test_max_workers_is_configurable(tmp_path: Path) -> None:
    (tmp_path / "cpu.max").write_text("800000 100000\n")
    assert _resolve(tmp_path, {"GUNICORN_MAX_WORKERS": "17"}) == 17
    assert _resolve(tmp_path, {"GUNICORN_MAX_WORKERS": "bogus"}) == 8


def test_production_image_uses_the_entrypoint() -> None:
    dockerfile = (REPO_ROOT / "backend/Dockerfile").read_text()
    production = dockerfile.split("FROM python:3.12.10-slim AS production", 1)[1]
    instructions = [
        ln for ln in production.splitlines() if not ln.lstrip().startswith("#")
    ]
    assert 'CMD ["/usr/local/bin/start-gunicorn.sh"]' in instructions
    assert not any("nproc" in ln for ln in instructions)
