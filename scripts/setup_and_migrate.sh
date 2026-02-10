#!/bin/bash
# =============================================================================
# Setup and Migration Script for Enhanced Filtering
# =============================================================================
# This script:
# 1. Checks for required environment variables
# 2. Applies the database migration
# 3. Runs verification tests
# =============================================================================

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Enhanced Filtering Setup & Migration${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# =============================================================================
# Step 1: Check Environment Variables
# =============================================================================

echo -e "${YELLOW}Step 1: Checking environment variables...${NC}"

if [ ! -f .env ]; then
    echo -e "${RED}✗ .env file not found${NC}"
    echo ""
    echo -e "${YELLOW}Please create a .env file with your Supabase credentials:${NC}"
    echo ""
    echo "  cp .env.example .env"
    echo ""
    echo "Then edit .env and set:"
    echo "  - SUPABASE_URL=https://your-project.supabase.co"
    echo "  - SUPABASE_SERVICE_ROLE_KEY=your-service-role-key"
    echo "  - DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres"
    echo ""
    echo -e "${YELLOW}Get your credentials from:${NC}"
    echo "  https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api"
    echo ""
    exit 1
fi

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Check required variables
MISSING_VARS=()

if [ -z "$SUPABASE_URL" ]; then
    MISSING_VARS+=("SUPABASE_URL")
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    MISSING_VARS+=("SUPABASE_SERVICE_ROLE_KEY")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}✗ Missing required environment variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    echo ""
    echo "Please set these in your .env file"
    exit 1
fi

echo -e "${GREEN}✓ Environment variables configured${NC}"
echo "  SUPABASE_URL: ${SUPABASE_URL:0:40}..."
echo ""

# =============================================================================
# Step 2: Check Database Connection
# =============================================================================

echo -e "${YELLOW}Step 2: Checking database connection...${NC}"

# Option A: Using psql if DATABASE_URL is set
if [ -n "$DATABASE_URL" ] && command -v psql &> /dev/null; then
    echo "Testing connection with psql..."
    if psql "$DATABASE_URL" -c "SELECT 1" &> /dev/null; then
        echo -e "${GREEN}✓ Database connection successful (psql)${NC}"
        USE_PSQL=true
    else
        echo -e "${YELLOW}⚠ psql connection failed, will try Supabase CLI${NC}"
        USE_PSQL=false
    fi
else
    USE_PSQL=false
fi

# Option B: Using Supabase CLI
if [ "$USE_PSQL" = false ]; then
    if command -v npx &> /dev/null; then
        echo "Checking Supabase CLI availability..."
        if npx supabase --version &> /dev/null; then
            echo -e "${GREEN}✓ Supabase CLI available${NC}"
            USE_SUPABASE_CLI=true
        else
            echo -e "${YELLOW}⚠ Supabase CLI not available${NC}"
            USE_SUPABASE_CLI=false
        fi
    else
        USE_SUPABASE_CLI=false
    fi
fi

if [ "$USE_PSQL" = false ] && [ "$USE_SUPABASE_CLI" = false ]; then
    echo -e "${RED}✗ No database connection method available${NC}"
    echo ""
    echo "Please install one of:"
    echo "  - PostgreSQL client: sudo apt install postgresql-client"
    echo "  - Supabase CLI: npm install -g supabase"
    echo ""
    echo "And set DATABASE_URL in your .env file"
    exit 1
fi

echo ""

# =============================================================================
# Step 3: Apply Migration
# =============================================================================

echo -e "${YELLOW}Step 3: Applying database migration...${NC}"
echo ""

MIGRATION_FILE="supabase/migrations/20260209000002_extend_judgments_filtering.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}✗ Migration file not found: $MIGRATION_FILE${NC}"
    exit 1
fi

echo "Migration file: $MIGRATION_FILE"
echo "File size: $(wc -l < $MIGRATION_FILE) lines"
echo ""

read -p "Apply this migration to your database? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Migration cancelled by user"
    exit 0
fi

echo ""
echo "Applying migration..."

if [ "$USE_PSQL" = true ]; then
    # Apply using psql
    if psql "$DATABASE_URL" -f "$MIGRATION_FILE" 2>&1; then
        echo -e "${GREEN}✓ Migration applied successfully${NC}"
    else
        echo -e "${RED}✗ Migration failed${NC}"
        exit 1
    fi
else
    # Apply using Supabase CLI
    cd supabase
    if npx supabase db push 2>&1; then
        echo -e "${GREEN}✓ Migration applied successfully${NC}"
    else
        echo -e "${RED}✗ Migration failed${NC}"
        exit 1
    fi
    cd ..
fi

echo ""

# =============================================================================
# Step 4: Verify Migration
# =============================================================================

echo -e "${YELLOW}Step 4: Verifying migration...${NC}"
echo ""

if [ "$USE_PSQL" = true ]; then
    echo "Checking for new indexes..."
    psql "$DATABASE_URL" -c "
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'judgments'
          AND schemaname = 'public'
          AND indexname LIKE 'idx_judgments_%'
        ORDER BY indexname;
    "

    echo ""
    echo "Checking for new functions..."
    psql "$DATABASE_URL" -c "
        SELECT proname, pg_get_function_identity_arguments(oid) as args
        FROM pg_proc
        WHERE proname IN ('search_judgments_hybrid', 'get_judgment_facets')
          AND pronamespace = 'public'::regnamespace;
    "
fi

echo ""

# =============================================================================
# Step 5: Run Verification Script
# =============================================================================

echo -e "${YELLOW}Step 5: Running verification tests...${NC}"
echo ""

if command -v python3 &> /dev/null; then
    # Check if required Python packages are installed
    if python3 -c "import supabase, loguru" 2>/dev/null; then
        echo "Running verification script..."
        python3 scripts/verify_filtering_implementation.py
    else
        echo -e "${YELLOW}⚠ Required Python packages not installed${NC}"
        echo ""
        echo "Install with:"
        echo "  pip install supabase loguru requests"
        echo ""
        echo "Then run:"
        echo "  python3 scripts/verify_filtering_implementation.py"
    fi
else
    echo -e "${YELLOW}⚠ Python3 not found${NC}"
    echo "Please install Python3 to run verification tests"
fi

echo ""

# =============================================================================
# Summary
# =============================================================================

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Migration Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Test the new search endpoint:"
echo "     curl -X POST http://localhost:8004/documents/search \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"query\": \"test\", \"jurisdictions\": [\"PL\"]}'"
echo ""
echo "  2. Test the facets endpoint:"
echo "     curl http://localhost:8004/documents/facets"
echo ""
echo "  3. Review documentation:"
echo "     - FILTERING_IMPLEMENTATION_SUMMARY.md"
echo "     - MIGRATION_CHECKLIST.md"
echo ""
echo -e "${GREEN}✓ Setup complete!${NC}"
