import sys
import time
from pprint import pprint

import requests
from dotenv import dotenv_values


SUBMIT_URL = "{api_url}/extractions/submit"
RESULTS_URL = "{api_url}/extractions/results/{task_id}"

LLM_NAME = "gemini-2.5-flash"
BACKEND_API_KEY = dotenv_values()["BACKEND_API_KEY"]


def main() -> None:
    api_base_url = dotenv_values().get("API_URL", "http://localhost:8004")
    submit_url = SUBMIT_URL.format(api_url=api_base_url)

    payload = {
        "collection_id": "none",
        "schema_id": "swiss_franc_loans",
        "prompt_id": "info_extraction",
        "language": "pl",
        "extraction_context": "The task is to extract information from court judgments related to personal rights.",
        "additional_instructions": "Think twice before extracting information.",
        "document_ids": [
            "151500000001006_II_AKa_000101_1999_Uz_1999-06-01_001",
        ],
        "llm_name": LLM_NAME,
        "llm_kwargs": {
            "extra_body": {
                "thinking": {
                    "budget_tokens": 0,
                },
            },
        },
    }

    headers = {
        "X-API-Key": BACKEND_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        submit_resp = requests.post(
            submit_url,
            headers=headers,
            json=payload,
        )
        submit_resp.raise_for_status()
    except Exception as e:
        print(f"Submission failed: {e}", file=sys.stderr)
        if "submit_resp" in locals():
            print(f"Response body: {submit_resp.text}", file=sys.stderr)
        sys.exit(1)

    submission_data = submit_resp.json()
    task_id = submission_data.get("task_id")
    status = submission_data.get("status")
    print(f"Task accepted: task_id={task_id} status={status}")

    if not task_id:
        print("No task_id returned by the server.", file=sys.stderr)
        sys.exit(1)

    results_url = RESULTS_URL.format(api_url=api_base_url, task_id=task_id)

    for attempt in range(1, 20):
        try:
            resp = requests.get(results_url, headers=headers)
            resp.raise_for_status()
        except Exception as e:
            print(
                f"Polling error (attempt {attempt}/10): {e}",
                file=sys.stderr,
            )
        else:
            status = resp.json().get("status")
            if status != "SUCCESS":
                print(f"Task is {status}, waiting for 1 second...")
                time.sleep(1)
                continue
            else:
                if status == "SUCCESS":
                    print("\nExtraction results:")
                    pprint(resp.json())
                    break


if __name__ == "__main__":
    main()
