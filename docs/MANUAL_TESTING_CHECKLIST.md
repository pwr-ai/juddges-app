# Manual Testing Checklist - Post-Implementation

After completing all automated tasks, perform these manual tests to verify production readiness.

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

## ✅ Feature 1: Chat Functionality

### Test 1.1: Create New Chat
- [ ] Navigate to `/chat`
- [ ] Click "Start Chat" or enter a message
- [ ] Verify chat interface loads
- [ ] Verify input field is focused

### Test 1.2: Send Message with Streaming
- [ ] Type: "What is a legal judgment?"
- [ ] Click Send (or press Enter)
- [ ] **Verify:** Message appears in chat history
- [ ] **Verify:** Streaming response displays token-by-token
- [ ] **Verify:** Response completes without errors
- [ ] **Verify:** Response is relevant to the question

### Test 1.3: Source Documents
- [ ] Type: "Find cases about contract law"
- [ ] Send message
- [ ] **Verify:** Response includes source documents section
- [ ] **Verify:** Source documents are clickable
- [ ] **Verify:** Clicking source opens document detail

### Test 1.4: Chat History
- [ ] Open sidebar (if not visible)
- [ ] **Verify:** Previous chats are listed
- [ ] **Verify:** Chat preview shows first message
- [ ] Click on a previous chat
- [ ] **Verify:** Chat loads with full history

### Test 1.5: Chat Management
- [ ] Hover over a chat in history
- [ ] Click rename icon
- [ ] Rename to "Test Chat Rename"
- [ ] **Verify:** Name updates in sidebar
- [ ] Click delete icon
- [ ] Confirm deletion
- [ ] **Verify:** Chat removed from list

### Test 1.6: Export Chat
- [ ] Open a chat with multiple messages
- [ ] Click export button
- [ ] Select "Download JSON"
- [ ] **Verify:** JSON file downloads
- [ ] **Verify:** File contains messages and metadata

**Expected Results:** All chat operations work smoothly, streaming displays correctly, sources are accessible.

---

## ✅ Feature 2: Search Functionality

### Test 2.1: Rabbit Mode (Fast Search)
- [ ] Navigate to `/search`
- [ ] Select "Rabbit" mode (fast)
- [ ] Enter query: "employment discrimination"
- [ ] Click Search
- [ ] **Verify:** Results appear quickly (< 3 seconds)
- [ ] **Verify:** Results are relevant
- [ ] **Verify:** No enhanced query shown in response

### Test 2.2: Thinking Mode (AI-Enhanced Search)
- [ ] Switch to "Thinking" mode
- [ ] Enter same query: "employment discrimination"
- [ ] Click Search
- [ ] **Verify:** Query takes slightly longer (AI enhancement)
- [ ] **Verify:** Results appear with "Enhanced query" badge or indicator
- [ ] **Verify:** Enhanced query shows expanded terms
- [ ] **Verify:** Results are semantically relevant

### Test 2.3: Search Filters
- [ ] Apply jurisdiction filter: "PL" (Polish)
- [ ] **Verify:** Only Polish judgments in results
- [ ] Apply court level filter: "Supreme Court"
- [ ] **Verify:** Results filtered correctly
- [ ] Apply date range: Last 6 months
- [ ] **Verify:** All results within date range

### Test 2.4: Search Metadata
- [ ] Open browser DevTools → Network tab
- [ ] Perform a search
- [ ] Inspect search API response
- [ ] **Verify:** Response includes `chunk_text`, `chunk_type`, `chunk_metadata`
- [ ] **Verify:** Response includes `vector_score`, `text_score`, `combined_score`
- [ ] **Verify:** Metadata contains court name, case number, scores

### Test 2.5: Infinite Scroll
- [ ] Perform search with many results
- [ ] Scroll to bottom of results
- [ ] **Verify:** "Load More" appears or auto-loads
- [ ] **Verify:** New results append without duplicates

**Expected Results:** Both search modes work, thinking mode enhances queries, metadata is complete.

---

## ✅ Feature 3: Schema Generation

### Test 3.1: Generate Schema via Chat
- [ ] Navigate to `/schema-chat`
- [ ] Enter: "Extract party names, contract dates, and monetary amounts from legal agreements"
- [ ] Click Generate
- [ ] **Verify:** Multi-agent workflow runs (see progress indicators)
- [ ] **Verify:** Schema preview appears
- [ ] **Verify:** Schema includes fields for party_names, contract_date, amount
- [ ] **Verify:** Schema has proper JSON Schema format

### Test 3.2: Refine Schema
- [ ] In schema editor, provide feedback: "Add a field for contract status"
- [ ] Click Refine
- [ ] **Verify:** Schema updates with new field
- [ ] **Verify:** Refinement preserves existing fields
- [ ] **Verify:** Quality score improves or stays high

### Test 3.3: Test Schema on Documents
- [ ] Click "Test Schema" button
- [ ] Select sample documents
- [ ] Run test
- [ ] **Verify:** Test results show extraction accuracy
- [ ] **Verify:** Results indicate which fields extracted successfully

### Test 3.4: Save Schema
- [ ] Click "Save Schema"
- [ ] Enter schema name and description
- [ ] Save
- [ ] Navigate to `/schemas`
- [ ] **Verify:** Saved schema appears in library

**Expected Results:** Schema generation workflow completes, refinement works, schemas can be saved.

---

## ✅ Feature 4: Information Extraction

### Test 4.1: Run Extraction Job
- [ ] Navigate to `/extract`
- [ ] Select a collection
- [ ] Select documents (or choose "All")
- [ ] Select an extraction schema
- [ ] Click "Extract"
- [ ] **Verify:** Job submission succeeds
- [ ] **Verify:** Redirected to job detail page or jobs list

### Test 4.2: Monitor Extraction Progress
- [ ] Navigate to `/extractions`
- [ ] **Verify:** New job appears with "IN_PROGRESS" status
- [ ] Refresh page periodically
- [ ] **Verify:** Progress updates
- [ ] **Verify:** Status changes to "COMPLETED" when done

### Test 4.3: View Results - Document View
- [ ] Click on completed job
- [ ] **Verify:** Overview tab shows job summary
- [ ] Click "Results" tab
- [ ] Select "Document View"
- [ ] **Verify:** Each document's extracted data displays
- [ ] **Verify:** Field names are readable (not snake_case)
- [ ] **Verify:** Values are formatted correctly (dates, booleans, arrays)

### Test 4.4: View Results - Table View **[NEW]**
- [ ] Click "Table View" tab
- [ ] **Verify:** Results display in table format
- [ ] **Verify:** All extracted fields appear as columns
- [ ] **Verify:** Document ID and status columns present
- [ ] **Verify:** Table is scrollable if many fields

### Test 4.5: Export Results **[NEW]**
- [ ] In table view, click "Export to CSV"
- [ ] **Verify:** CSV file downloads
- [ ] Open CSV in Excel/LibreOffice
- [ ] **Verify:** Headers match field names
- [ ] **Verify:** Data is properly escaped (no broken rows)
- [ ] Test JSON export
- [ ] **Verify:** JSON structure is valid

### Test 4.6: Copy to Clipboard
- [ ] In document view, click copy button for a document
- [ ] Paste into text editor
- [ ] **Verify:** JSON formatted correctly
- [ ] **Verify:** All fields present

**Expected Results:** Extraction jobs complete, table view displays correctly, exports work.

---

## ✅ Feature 5: Authentication

### Test 5.1: Login Flow
- [ ] Clear cookies/logout
- [ ] Navigate to `/auth/login`
- [ ] Enter valid credentials
- [ ] Click "Sign In"
- [ ] **Verify:** Redirected to dashboard or chat
- [ ] **Verify:** User session persists on refresh

### Test 5.2: Protected Routes
- [ ] Logout
- [ ] Try accessing `/chat` directly
- [ ] **Verify:** Redirected to `/auth/login`
- [ ] Try accessing `/extract`
- [ ] **Verify:** Redirected to login

### Test 5.3: SSO (if configured)
- [ ] Enter email with SSO domain
- [ ] **Verify:** SSO button appears
- [ ] Click SSO button
- [ ] **Verify:** Redirected to identity provider
- [ ] Complete SSO flow
- [ ] **Verify:** Redirected back and authenticated

**Expected Results:** Auth protects routes, SSO works if configured, sessions persist.

---

## ✅ Feature 6: Backend Health

### Test 6.1: Health Endpoints
- [ ] Visit: http://localhost:8004/health
- [ ] **Verify:** Returns 200 OK
- [ ] Visit: http://localhost:8004/health/status
- [ ] **Verify:** Returns detailed service health
- [ ] **Verify:** Shows Supabase, Redis, PostgreSQL status
- [ ] **Verify:** NO Weaviate in dependency list

### Test 6.2: API Documentation
- [ ] Visit: http://localhost:8004/docs
- [ ] **Verify:** Swagger UI loads
- [ ] Check "deprecated" tag
- [ ] **Verify:** Old schema generation endpoints marked deprecated
- [ ] **Verify:** New endpoints documented correctly

### Test 6.3: Error Handling
- [ ] Try invalid API request (wrong auth, bad data)
- [ ] **Verify:** Proper error messages (not 500)
- [ ] **Verify:** No Weaviate-specific errors

**Expected Results:** Health checks show all services up, no Weaviate references.

---

## ✅ Performance Checks

### Test 7.1: Search Performance
- [ ] Perform 5 searches in rabbit mode
- [ ] **Verify:** Average response time < 3 seconds
- [ ] Perform 5 searches in thinking mode
- [ ] **Verify:** Average response time < 8 seconds (includes AI enhancement)

### Test 7.2: Chat Streaming
- [ ] Send complex question requiring long response
- [ ] **Verify:** Streaming starts within 2 seconds
- [ ] **Verify:** Tokens stream smoothly (no long pauses)

### Test 7.3: Extraction Job
- [ ] Run extraction on 10 documents
- [ ] **Verify:** Job completes within reasonable time
- [ ] **Verify:** No timeout errors

---

## ✅ Data Quality Checks

### Test 8.1: Search Results Quality
- [ ] Search: "tax evasion criminal cases"
- [ ] **Verify:** Top 5 results are relevant
- [ ] **Verify:** Results include both exact matches and semantic matches

### Test 8.2: AI Query Enhancement Quality
- [ ] Use thinking mode with query: "contract breach"
- [ ] Check enhanced query in response
- [ ] **Verify:** Enhanced query includes terms like "contractual", "violation", "breach of agreement"
- [ ] **Verify:** Enhanced query doesn't completely change intent

### Test 8.3: Extraction Accuracy
- [ ] Review extracted data in table view
- [ ] Compare with source documents
- [ ] **Verify:** Extracted fields match document content
- [ ] **Verify:** No hallucinated data

---

## 🔍 Console Monitoring

Throughout all tests, monitor browser console for:
- [ ] No JavaScript errors
- [ ] No failed API calls (check Network tab)
- [ ] No Weaviate-related errors
- [ ] Proper error handling for expected failures

---

## 📊 Final Verification

After completing all tests:

1. **Check Git Status**
   ```bash
   git status
   git log --oneline -5
   ```
   - [ ] All changes committed
   - [ ] Commit messages follow convention

2. **Run Verification Script**
   ```bash
   ./scripts/verify-deployment.sh
   ```
   - [ ] All checks pass

3. **Review Test Coverage**
   ```bash
   cd backend && poetry run pytest --cov=app --cov-report=html
   cd frontend && npm run test:coverage
   ```
   - [ ] Coverage meets targets (>70% recommended)

---

## ✅ Sign-Off

**Tested By:** _________________
**Date:** _________________
**Environment:** [ ] Development [ ] Staging [ ] Production
**Status:** [ ] Pass [ ] Fail

**Notes:**
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________

**Blockers/Issues Found:**
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
