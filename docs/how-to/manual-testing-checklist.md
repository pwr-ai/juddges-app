# Manual Testing Checklist

Pre-release manual testing guide for verifying production readiness.

---

## Pre-Testing Setup

1. **Start Backend Server**
   ```bash
   cd backend
   poetry run uvicorn app.server:app --reload --port 8004
   ```

2. **Start Frontend Dev Server**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Open Browser**
   - Navigate to: http://localhost:3007
   - Open DevTools (F12) for console monitoring

---

## Feature 1: Chat Functionality

### 1.1: Create New Chat
- Navigate to `/chat`
- Click "Start Chat" or enter a message
- Verify chat interface loads and input field is focused

### 1.2: Send Message with Streaming
- Type: "What is a legal judgment?"
- Send message
- Verify: message appears in chat history
- Verify: streaming response displays token-by-token
- Verify: response completes without errors

### 1.3: Source Documents
- Type: "Find cases about contract law"
- Send message
- Verify: response includes source documents section
- Verify: source documents are clickable and open document detail

### 1.4: Chat History
- Verify: previous chats are listed in sidebar
- Click on a previous chat
- Verify: chat loads with full history

### 1.5: Chat Management
- Rename a chat and verify name updates in sidebar
- Delete a chat and verify it is removed from list

### 1.6: Export Chat
- Open a chat with multiple messages
- Click export → "Download JSON"
- Verify: JSON file downloads with messages and metadata

---

## Feature 2: Search Functionality

### 2.1: Rabbit Mode (Fast Search)
- Navigate to `/search`
- Select "Rabbit" mode
- Enter query: "employment discrimination"
- Verify: results appear quickly (< 3 seconds), results are relevant

### 2.2: Thinking Mode (AI-Enhanced Search)
- Switch to "Thinking" mode, same query
- Verify: enhanced query badge/indicator is shown
- Verify: results are semantically relevant

### 2.3: Search Filters
- Apply jurisdiction filter: "PL" (Polish) → verify only Polish judgments
- Apply court level filter → verify results filtered correctly
- Apply date range → verify all results within range

### 2.4: Search Metadata
- Open DevTools → Network tab
- Perform a search and inspect API response
- Verify: response includes `chunk_text`, `chunk_type`, `chunk_metadata`
- Verify: response includes `vector_score`, `text_score`, `combined_score`

### 2.5: Infinite Scroll / Pagination
- Perform search with many results
- Scroll to bottom
- Verify: new results load without duplicates

---

## Feature 3: Schema Generation

### 3.1: Generate Schema via Chat
- Navigate to `/schema-chat`
- Enter: "Extract party names, contract dates, and monetary amounts"
- Verify: multi-agent workflow runs with progress indicators
- Verify: schema preview appears with proper JSON Schema format

### 3.2: Refine Schema
- Provide feedback: "Add a field for contract status"
- Verify: schema updates preserving existing fields

### 3.3: Test Schema on Documents
- Click "Test Schema", select sample documents, run test
- Verify: results show extraction accuracy per field

### 3.4: Save Schema
- Save with name and description
- Navigate to `/schemas`
- Verify: saved schema appears in library

---

## Feature 4: Information Extraction

### 4.1: Run Extraction Job
- Navigate to `/extract`
- Select collection, documents, and extraction schema
- Click "Extract"
- Verify: job submission succeeds

### 4.2: Monitor Extraction Progress
- Navigate to `/extractions`
- Verify: job appears with "IN_PROGRESS" status
- Verify: status changes to "COMPLETED" when done

### 4.3: View Results - Document View
- Click completed job → "Results" tab → "Document View"
- Verify: extracted data displays with readable field names
- Verify: values formatted correctly (dates, booleans, arrays)

### 4.4: View Results - Table View
- Click "Table View" tab
- Verify: all extracted fields appear as columns
- Verify: table is scrollable

### 4.5: Export Results
- Export to CSV → verify headers match field names, data properly escaped
- Export to JSON → verify valid structure

---

## Feature 5: Authentication

### 5.1: Login Flow
- Clear cookies, navigate to `/auth/login`
- Sign in with valid credentials
- Verify: redirected to dashboard, session persists on refresh

### 5.2: Protected Routes
- Logout, try accessing `/chat` directly
- Verify: redirected to `/auth/login`

### 5.3: SSO (if configured)
- Enter SSO-domain email
- Complete SSO flow
- Verify: redirected back and authenticated

---

## Feature 6: Backend Health

### 6.1: Health Endpoints
- Visit: http://localhost:8004/health → verify 200 OK
- Visit: http://localhost:8004/health/status → verify detailed service health
- Verify: shows Supabase, Redis, PostgreSQL status

### 6.2: API Documentation
- Visit: http://localhost:8004/docs → verify Swagger UI loads
- Verify: endpoints documented correctly

### 6.3: Error Handling
- Try invalid API request (wrong auth, bad data)
- Verify: proper error messages (not 500)

---

## Performance Checks

### 7.1: Search Performance
- 5 searches in rabbit mode → average response < 3 seconds
- 5 searches in thinking mode → average response < 8 seconds

### 7.2: Chat Streaming
- Send complex question → streaming starts within 2 seconds
- Tokens stream smoothly (no long pauses)

### 7.3: Extraction Job
- Run extraction on 10 documents
- Verify: completes without timeout errors

---

## Data Quality Checks

### 8.1: Search Results Quality
- Search: "tax evasion criminal cases"
- Verify: top 5 results are relevant (exact + semantic matches)

### 8.2: AI Query Enhancement Quality
- Thinking mode with query: "contract breach"
- Verify: enhanced query includes related terms without changing intent

### 8.3: Extraction Accuracy
- Review extracted data in table view
- Compare with source documents
- Verify: extracted fields match document content

---

## Console Monitoring

Throughout all tests, monitor browser console for:
- No JavaScript errors
- No failed API calls (check Network tab)
- Proper error handling for expected failures

---

## Final Verification

1. **Run automated tests**
   ```bash
   cd backend && poetry run pytest --cov=app
   cd frontend && npm run test:coverage
   ```

2. **Check service health**
   ```bash
   curl http://localhost:8004/health/healthz
   ```

---

## Sign-Off

| Field | Value |
|-------|-------|
| Tested By | |
| Date | |
| Environment | Development / Staging / Production |
| Status | Pass / Fail |
| Notes | |
| Blockers | |
