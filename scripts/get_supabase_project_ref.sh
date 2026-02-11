#!/bin/bash
# Extract Supabase project reference from SUPABASE_URL

set -e

# Load .env file
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "Please create .env from .env.example and add your Supabase credentials"
    exit 1
fi

# Source the .env file
export $(grep -v '^#' .env | xargs)

# Extract project ref from URL
if [ -z "$SUPABASE_URL" ]; then
    echo "❌ Error: SUPABASE_URL not set in .env"
    exit 1
fi

# Project ref is the subdomain: https://PROJECT_REF.supabase.co
PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's|https?://([^.]+)\.supabase\.co.*|\1|')

if [ -z "$PROJECT_REF" ] || [ "$PROJECT_REF" = "$SUPABASE_URL" ]; then
    echo "❌ Error: Could not extract project reference from SUPABASE_URL"
    echo "Current SUPABASE_URL: $SUPABASE_URL"
    echo ""
    echo "Expected format: https://PROJECT_REF.supabase.co"
    echo ""
    echo "Please find your Project Reference ID in Supabase Dashboard:"
    echo "  Settings → General → Project Settings → Reference ID"
    exit 1
fi

echo "✅ Project Reference ID: $PROJECT_REF"
echo ""
echo "Your Supabase URL: $SUPABASE_URL"
echo ""
echo "To link your project, run:"
echo "  supabase link --project-ref $PROJECT_REF"
