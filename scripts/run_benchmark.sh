#!/bin/bash
# Docker wrapper for search benchmark script.
#
# Runs the search performance benchmark in a clean Python container environment
# following the project's containerization guidelines.
#
# Usage:
#     ./scripts/run_benchmark.sh                              # defaults
#     ./scripts/run_benchmark.sh --backend-url http://localhost:8002
#     ./scripts/run_benchmark.sh --iterations 5 --output data/results.json

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
BACKEND_URL="${BACKEND_URL:-http://localhost:8004}"
BACKEND_API_KEY="${BACKEND_API_KEY:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_usage() {
    echo "Docker wrapper for Juddges search performance benchmark"
    echo ""
    echo "Usage:"
    echo "  $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --backend-url URL     Backend base URL (default: \$BACKEND_URL or http://localhost:8004)"
    echo "  --api-key KEY        Backend API key (default: \$BACKEND_API_KEY)"
    echo "  --iterations N       Number of iterations per query (default: 3)"
    echo "  --warmup N          Number of warmup queries (default: 2)"
    echo "  --queries-file FILE  Load custom queries from JSON file"
    echo "  --output FILE        Save detailed results to JSON file"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0"
    echo "  $0 --backend-url http://localhost:8002"
    echo "  $0 --iterations 5 --output data/benchmark_results.json"
    echo "  $0 --queries-file data/custom_queries.json"
    echo ""
    echo "Note: This script runs the benchmark in a Docker container for reproducibility."
}

# Parse command line arguments
DOCKER_ARGS=()
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            print_usage
            exit 0
            ;;
        --backend-url)
            BACKEND_URL="$2"
            DOCKER_ARGS+=("--backend-url" "$2")
            shift 2
            ;;
        --api-key)
            BACKEND_API_KEY="$2"
            DOCKER_ARGS+=("--api-key" "$2")
            shift 2
            ;;
        --iterations|--warmup|--queries-file|--output)
            DOCKER_ARGS+=("$1" "$2")
            shift 2
            ;;
        *)
            echo -e "${RED}Error: Unknown argument '$1'${NC}" >&2
            print_usage >&2
            exit 1
            ;;
    esac
done

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed or not in PATH${NC}" >&2
    echo "Please install Docker to use this script." >&2
    exit 1
fi

# Check if project files exist
if [[ ! -f "$PROJECT_ROOT/scripts/benchmark_search.py" ]]; then
    echo -e "${RED}Error: benchmark_search.py not found at $PROJECT_ROOT/scripts/benchmark_search.py${NC}" >&2
    exit 1
fi

# Create data directory if it doesn't exist
mkdir -p "$PROJECT_ROOT/data"

echo -e "${BLUE}Juddges Search Performance Benchmark${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Backend URL: $BACKEND_URL"
echo "  Project root: $PROJECT_ROOT"
echo "  Docker args: ${DOCKER_ARGS[*]}"
echo ""

# Check backend connectivity before running Docker
echo -e "${YELLOW}Checking backend connectivity...${NC}"
if curl -f -s "$BACKEND_URL/health" > /dev/null; then
    echo -e "${GREEN}✓ Backend is reachable${NC}"
else
    echo -e "${RED}✗ Backend is not reachable at $BACKEND_URL${NC}" >&2
    echo "Please ensure the backend is running and accessible." >&2
    echo ""
    echo "For development:"
    echo "  cd backend && poetry run uvicorn app.server:app --reload --port 8004"
    echo ""
    echo "With Docker:"
    echo "  docker compose -f docker-compose.dev.yml up backend"
    echo ""
    exit 1
fi

# Run the benchmark in Docker container
echo -e "${YELLOW}Starting benchmark in Docker container...${NC}"
echo ""

# Build Docker run command
DOCKER_CMD=(
    docker run --rm
    # Mount the entire project directory
    -v "$PROJECT_ROOT:/workspace"
    # Set working directory
    -w /workspace
    # Pass environment variables
    -e "BACKEND_URL=$BACKEND_URL"
    -e "BACKEND_API_KEY=$BACKEND_API_KEY"
    # Use network host for localhost connectivity
    --network host
    # Use Python slim image
    python:3.12-slim
    # Install dependencies and run script
    bash -c "
        set -e
        echo 'Installing dependencies...'
        pip install -q requests loguru rich python-dotenv
        echo 'Running benchmark...'
        python scripts/benchmark_search.py ${DOCKER_ARGS[*]}
    "
)

# Execute Docker command
if "${DOCKER_CMD[@]}"; then
    echo ""
    echo -e "${GREEN}✓ Benchmark completed successfully${NC}"

    # Check if output file was specified and exists
    if [[ "${DOCKER_ARGS[*]}" == *"--output"* ]]; then
        # Find the output filename from args
        for i in "${!DOCKER_ARGS[@]}"; do
            if [[ "${DOCKER_ARGS[$i]}" == "--output" ]]; then
                OUTPUT_FILE="${DOCKER_ARGS[$((i+1))]}"
                break
            fi
        done

        if [[ -n "$OUTPUT_FILE" && -f "$PROJECT_ROOT/$OUTPUT_FILE" ]]; then
            echo -e "${GREEN}📁 Results saved to: $OUTPUT_FILE${NC}"
            echo "   View with: cat $OUTPUT_FILE | jq ."
        fi
    fi

    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "• Analyze results for performance regressions"
    echo "• Compare with previous benchmark runs"
    echo "• Check P95 latencies against targets (keyword<150ms, vector<200ms, hybrid<300ms)"
    echo "• Run with --iterations 5 for production validation"

else
    echo ""
    echo -e "${RED}✗ Benchmark failed${NC}"
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "• Verify backend is running: curl $BACKEND_URL/health"
    echo "• Check API key: echo \$BACKEND_API_KEY"
    echo "• Review Docker logs above for specific error details"
    echo "• Try running directly: python scripts/benchmark_search.py --help"
    exit 1
fi