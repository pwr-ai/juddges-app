#!/bin/bash
cd "$(dirname "$0")/backend"
uv run uvicorn app.server:app --reload --port 8004 --host 0.0.0.0
