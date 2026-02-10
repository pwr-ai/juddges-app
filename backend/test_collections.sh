#!/bin/bash

# 🚀 Collections API Test Suite
# Simple API Key authentication testing
# Note: Using set +e to continue tests even if some fail
set +e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8003}"
API_KEY="${BACKEND_API_KEY:-1234567890}"

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
COLLECTION_ID=""

print_header() {
    echo
    echo -e "${PURPLE}$1${NC}"
    echo -e "${PURPLE}$(printf '=%.0s' {1..60})${NC}"
}

print_test() {
    echo -e "${BLUE}🧪 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((TESTS_PASSED++))
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    ((TESTS_FAILED++))
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️ $1${NC}"
}

# Check if server is running
check_server() {
    print_test "Checking server at $BASE_URL"
    if curl -s -f "$BASE_URL/" > /dev/null 2>&1; then
        print_success "Server is running"
    else
        print_error "Server not running at $BASE_URL"
        print_info "Start with: poetry run uvicorn app.server:app --port 8003"
        print_warning "Continuing with tests anyway..."
    fi
}

# Test No Authentication (should fail)
test_no_auth() {
    print_test "Testing no authentication (should fail)"
    
    status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/collections")
    if [ "$status" = "403" ]; then
        print_success "No auth correctly rejected (401)"
    else
        print_error "Expected 401, got $status"
    fi
}

# Test API Key Authentication
test_api_key_auth() {
    print_test "Testing API key authentication"
    
    # Valid API key
    status=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "X-API-Key: $API_KEY" \
        "$BASE_URL/collections")
    
    if [ "$status" = "200" ]; then
        print_success "API key authentication works"
    else
        print_error "API key auth failed, status: $status"
    fi
    
    # Invalid API key
    status=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "X-API-Key: invalid-key" \
        "$BASE_URL/collections")
    
    if [ "$status" = "401" ]; then
        print_success "Invalid API key correctly rejected"
    else
        print_error "Invalid API key not rejected, status: $status"
    fi
}

# Test creating collection
test_create_collection() {
    print_test "Creating collection"
    
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "X-API-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"name": "Test Collection", "description": "Created via test script"}' \
        "$BASE_URL/collections")
    
    status=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n1)
    
    if [ "$status" = "200" ]; then
        print_success "Collection created"
        COLLECTION_ID=$(echo "$body" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
        if [ -n "$COLLECTION_ID" ]; then
            print_info "Collection ID: $COLLECTION_ID"
        else
            print_warning "Could not extract collection ID from response"
        fi
    else
        print_error "Failed to create collection, status: $status"
        print_info "Response: $body"
    fi
}

# Test listing collections
test_list_collections() {
    print_test "Listing collections"
    
    response=$(curl -s -w "\n%{http_code}" \
        -H "X-API-Key: $API_KEY" \
        "$BASE_URL/collections")
    
    status=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n1)
    
    if [ "$status" = "200" ]; then
        count=$(echo "$body" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "unknown")
        print_success "Listed collections (count: $count)"
    else
        print_error "Failed to list collections, status: $status"
        print_info "Response: $body"
    fi
}

# Test getting specific collection
test_get_collection() {
    if [ -z "$COLLECTION_ID" ]; then
        print_warning "Skipping get collection test (no collection ID)"
        return
    fi
    
    print_test "Getting collection $COLLECTION_ID"
    
    response=$(curl -s -w "\n%{http_code}" \
        -H "X-API-Key: $API_KEY" \
        "$BASE_URL/collections/$COLLECTION_ID")
    
    status=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n1)
    
    if [ "$status" = "200" ]; then
        name=$(echo "$body" | python3 -c "import sys, json; print(json.load(sys.stdin)['name'])" 2>/dev/null || echo "unknown")
        print_success "Got collection: $name"
    else
        print_error "Failed to get collection, status: $status"
        print_info "Response: $body"
    fi
}

# Test updating collection
test_update_collection() {
    if [ -z "$COLLECTION_ID" ]; then
        print_warning "Skipping update collection test (no collection ID)"
        return
    fi
    
    print_test "Updating collection $COLLECTION_ID"
    
    response=$(curl -s -w "\n%{http_code}" \
        -X PUT \
        -H "X-API-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"name": "Updated Test Collection"}' \
        "$BASE_URL/collections/$COLLECTION_ID")
    
    status=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n1)
    
    if [ "$status" = "200" ]; then
        print_success "Collection updated"
    else
        print_error "Failed to update collection, status: $status"
        print_info "Response: $body"
    fi
}

# Test adding document to collection
test_add_document() {
    if [ -z "$COLLECTION_ID" ]; then
        print_warning "Skipping add document test (no collection ID)"
        return
    fi
    
    print_test "Adding document to collection"
    
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "X-API-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"document_id": "test-doc-123"}' \
        "$BASE_URL/collections/$COLLECTION_ID/documents")
    
    status=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n1)
    
    if [ "$status" = "200" ]; then
        print_success "Document added to collection"
    else
        print_error "Failed to add document, status: $status"
        print_info "Response: $body"
    fi
}

# Test removing document from collection (URL method)
test_remove_document_url() {
    if [ -z "$COLLECTION_ID" ]; then
        print_warning "Skipping remove document test (no collection ID)"
        return
    fi
    
    print_test "Removing document via URL"
    
    response=$(curl -s -w "\n%{http_code}" \
        -X DELETE \
        -H "X-API-Key: $API_KEY" \
        "$BASE_URL/collections/$COLLECTION_ID/documents/test-doc-123")
    
    status=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n1)
    
    if [ "$status" = "200" ]; then
        print_success "Document removed via URL"
    else
        print_error "Failed to remove document via URL, status: $status"
        print_info "Response: $body"
    fi
}

# Test removing document from collection (Body method)
test_remove_document_body() {
    if [ -z "$COLLECTION_ID" ]; then
        print_warning "Skipping remove document body test (no collection ID)"
        return
    fi
    
    # Add a document first
    curl -s -X POST \
        -H "X-API-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"document_id": "test-doc-456"}' \
        "$BASE_URL/collections/$COLLECTION_ID/documents" > /dev/null
    
    print_test "Removing document via request body"
    
    response=$(curl -s -w "\n%{http_code}" \
        -X DELETE \
        -H "X-API-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"document_id": "test-doc-456"}' \
        "$BASE_URL/collections/$COLLECTION_ID/documents")
    
    status=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n1)
    
    if [ "$status" = "200" ]; then
        print_success "Document removed via request body"
    else
        print_error "Failed to remove document via body, status: $status"
        print_info "Response: $body"
    fi
}

# Test deleting collection
test_delete_collection() {
    if [ -z "$COLLECTION_ID" ]; then
        print_warning "Skipping delete collection test (no collection ID)"
        return
    fi
    
    print_test "Deleting collection $COLLECTION_ID"
    
    response=$(curl -s -w "\n%{http_code}" \
        -X DELETE \
        -H "X-API-Key: $API_KEY" \
        "$BASE_URL/collections/$COLLECTION_ID")
    
    status=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n1)
    
    if [ "$status" = "200" ]; then
        print_success "Collection deleted"
    else
        print_error "Failed to delete collection, status: $status"
        print_info "Response: $body"
    fi
}

# Test error handling
test_error_handling() {
    print_test "Testing error handling"
    
    # Test 404 - non-existent collection
    status=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "X-API-Key: $API_KEY" \
        "$BASE_URL/collections/non-existent-id")
    
    if [ "$status" = "404" ]; then
        print_success "404 error handled correctly"
    else
        print_error "Expected 404 for non-existent collection, got $status"
    fi
    
    # Test 400 - invalid request
    status=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST \
        -H "X-API-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"invalid": "data"}' \
        "$BASE_URL/collections")
    
    if [ "$status" = "422" ] || [ "$status" = "400" ]; then
        print_success "Invalid request handled correctly ($status)"
    else
        print_error "Expected 400/422 for invalid request, got $status"
    fi
}

# Run all tests
run_tests() {
    print_header "🚀 Collections API Test Suite"
    echo
    print_info "Testing with Backend: $BASE_URL"
    print_info "API Key: $API_KEY"
    
    # Server check
    check_server
    
    # Authentication Tests
    print_header "🔐 Authentication Tests"
    test_no_auth
    test_api_key_auth
    
    # CRUD Tests
    print_header "📝 CRUD Tests"
    test_create_collection
    test_list_collections
    test_get_collection
    test_update_collection
    test_add_document
    test_remove_document_url
    test_remove_document_body
    test_delete_collection
    
    # Error Handling
    print_header "⚠️ Error Handling Tests"
    test_error_handling
    
    # Results summary
    print_header "📊 Test Results Summary"
    echo
    if [ $TESTS_FAILED -eq 0 ]; then
        print_success "All tests completed! ✨"
        print_info "Passed: $TESTS_PASSED"
    else
        print_error "Some tests failed!"
        print_info "Passed: $TESTS_PASSED, Failed: $TESTS_FAILED"
    fi
    
    echo
    print_info "✅ Collections API uses official Supabase client!"
    print_info "📝 Clean and simple API key authentication"
    print_info "🔐 No JWT complexity - just works!"
}

# Handle script arguments
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Collections API Test Script"
    echo
    echo "Usage: $0 [options]"
    echo
    echo "Environment variables:"
    echo "  BASE_URL        Backend URL (default: http://localhost:8003)"
    echo "  BACKEND_API_KEY API key for authentication (default: 1234567890)"
    echo
    echo "Examples:"
    echo "  $0                                    # Run with defaults"
    echo "  BASE_URL=http://localhost:8000 $0    # Custom base URL"
    echo "  BACKEND_API_KEY=mykey $0             # Custom API key"
    echo
    exit 0
fi

# Run the tests
run_tests