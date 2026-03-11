#!/bin/bash
# Deployment Verification Script
# Run this after completing all implementation tasks

set -e

echo "🔍 Juddges App - Deployment Verification"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Change to project root
cd "$(dirname "$0")/.."

echo "📁 Project root: $(pwd)"
echo ""

# Resolve Poetry runner robustly (broken PATH shims are common after venv moves)
POETRY_CMD=()
POETRY_DISPLAY=""
if command -v poetry >/dev/null 2>&1 && poetry --version >/dev/null 2>&1; then
    POETRY_CMD=(poetry)
    POETRY_DISPLAY="poetry"
elif command -v python3 >/dev/null 2>&1 && python3 -m poetry --version >/dev/null 2>&1; then
    POETRY_CMD=(python3 -m poetry)
    POETRY_DISPLAY="python3 -m poetry"
elif command -v python >/dev/null 2>&1 && python -m poetry --version >/dev/null 2>&1; then
    POETRY_CMD=(python -m poetry)
    POETRY_DISPLAY="python -m poetry"
else
    echo -e "${RED}✗ Poetry not found (tried: poetry, python3 -m poetry, python -m poetry)${NC}"
    exit 1
fi

poetry_exec() {
    "${POETRY_CMD[@]}" "$@"
}

echo -e "${GREEN}✓${NC} Using Poetry runner: ${POETRY_DISPLAY}"
echo ""

# 1. Check environment variables
echo "1️⃣  Checking environment variables..."
if [ ! -f .env ]; then
    echo -e "${RED}✗ .env file not found${NC}"
    exit 1
fi

# Check required vars
REQUIRED_VARS=("SUPABASE_URL" "SUPABASE_SERVICE_ROLE_KEY" "SUPABASE_ANON_KEY" "OPENAI_API_KEY" "DATABASE_URL")
for var in "${REQUIRED_VARS[@]}"; do
    if grep -q "^${var}=" .env; then
        echo -e "${GREEN}✓${NC} $var is set"
    else
        echo -e "${RED}✗${NC} $var is missing"
        exit 1
    fi
done

# Check deprecated vars
DEPRECATED_VARS=("WEAVIATE_URL" "WEAVIATE_API_KEY" "WEAVIATE_USE_POOL")
for var in "${DEPRECATED_VARS[@]}"; do
    if grep -q "^${var}=" .env; then
        echo -e "${YELLOW}⚠${NC}  $var should be removed (Weaviate deprecated)"
    fi
done

echo ""

# 2. Check Poetry dependencies
echo "2️⃣  Checking backend dependencies..."
cd backend
if poetry_exec show weaviate-client 2>/dev/null; then
    echo -e "${RED}✗ weaviate-client still in dependencies${NC}"
    exit 1
else
    echo -e "${GREEN}✓${NC} weaviate-client removed"
fi

if poetry_exec show supabase | grep -q "supabase"; then
    echo -e "${GREEN}✓${NC} supabase package installed"
else
    echo -e "${RED}✗ supabase package missing${NC}"
    exit 1
fi
cd ..

echo ""

# 3. Check migrations
echo "3️⃣  Checking Supabase migrations..."
if [ -f "supabase/migrations/20260211000003_add_chunk_metadata_to_search.sql" ]; then
    echo -e "${GREEN}✓${NC} Search metadata migration exists"
else
    echo -e "${RED}✗ Search metadata migration missing${NC}"
    exit 1
fi

echo ""

# 4. Check test files
echo "4️⃣  Checking test files..."
TEST_FILES=(
    "frontend/tests/e2e/chat/chat-flow.spec.ts"
    "frontend/tests/e2e/chat/chat-history.spec.ts"
    "backend/tests/app/test_search_metadata.py"
    "backend/tests/test_query_enhancement.py"
    "backend/tests/packages/schema_generator_agent/test_workflow.py"
)

for file in "${TEST_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file exists"
    else
        echo -e "${RED}✗${NC} $file missing"
    fi
done

echo ""

# 5. Check removed files
echo "5️⃣  Checking Weaviate cleanup..."
REMOVED_FILES=(
    "backend/packages/juddges_search/juddges_search/db/weaviate_db.py"
    "backend/packages/juddges_search/juddges_search/db/weaviate_pool.py"
    "backend/tests/test_weaviate_search.py"
)

for file in "${REMOVED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${RED}✗${NC} $file should be removed"
        exit 1
    else
        echo -e "${GREEN}✓${NC} $file removed"
    fi
done

echo ""

# 6. Run quick backend syntax check
echo "6️⃣  Running backend syntax check..."
cd backend
if BACKEND_IMPORT_ERR="$(poetry_exec run python -c "import app.server" 2>&1)"; then
    echo -e "${GREEN}✓${NC} Backend imports successful"
else
    echo -e "${RED}✗${NC} Backend has import errors"
    echo "${BACKEND_IMPORT_ERR}"
    exit 1
fi
cd ..

echo ""

# 7. Check frontend components
echo "7️⃣  Checking frontend components..."
COMPONENTS=(
    "frontend/lib/styles/components/extraction/ExtractionTableView.tsx"
    "frontend/app/utils/document_fetcher.py:backend/app/utils/document_fetcher.py"
)

if [ -f "frontend/lib/styles/components/extraction/ExtractionTableView.tsx" ]; then
    echo -e "${GREEN}✓${NC} ExtractionTableView component exists"
else
    echo -e "${RED}✗${NC} ExtractionTableView component missing"
fi

if [ -f "backend/app/utils/document_fetcher.py" ]; then
    echo -e "${GREEN}✓${NC} Supabase document fetcher exists"
else
    echo -e "${RED}✗${NC} Document fetcher missing"
fi

echo ""
echo "========================================"
echo -e "${GREEN}✅ All checks passed!${NC}"
echo ""
echo "Next steps:"
echo "1. Run: cd backend && ${POETRY_DISPLAY} run pytest tests/ -v"
echo "2. Run: cd frontend && npm run test"
echo "3. Run: cd frontend && npm run test:e2e"
echo "4. Start dev servers and test manually"
echo ""
