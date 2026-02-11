# Prompt Audit Report: Juddges Branding and Context

**Date**: 2026-02-11
**Purpose**: Ensure all prompts properly identify the system as Juddges and reference legal judgments analysis

## Executive Summary

The codebase contains **3 critical issues** and **several minor issues** where prompts and metadata still reference "AI Tax Assistant" or focus exclusively on tax law, rather than properly representing Juddges as a legal judgments analysis platform supporting both tax law and criminal law domains.

## Critical Issues (Must Fix)

### 1. Legacy Chat Prompt - Wrong Identity ❌
**File**: `backend/packages/juddges_search/juddges_search/prompts/chat.py:7`

```python
GENERAL_CHAT_PROMPT = """Act as an AI Tax Assistant developed by Wroclaw University of Science and Technology, specializing in Polish judgements..."""
```

**Problem**:
- Identifies as "AI Tax Assistant" instead of Juddges
- This is a legacy prompt that appears to be unused (modern code uses `prompts/legal/system.py`)
- However, it's still in the codebase and could be confusing

**Recommendation**:
- **OPTION A (Preferred)**: Delete this file entirely if unused
- **OPTION B**: Update to match the modern legal system prompt that mentions both AI-Tax and JuDDGES projects

---

### 2. QA Prompt - Wrong Identity ❌
**File**: `backend/packages/juddges_search/juddges_search/prompts/qa.py:1`

```python
SIMPLE_QA = """You are AI Tax Assistant, an expert assistant dedicated to answering questions based on user-uploaded documents..."""
```

**Problem**:
- Identifies as "AI Tax Assistant"
- Used in the QA chain (`backend/packages/juddges_search/juddges_search/chains/qa.py`)
- This is an active prompt that needs updating

**Recommendation**:
```python
SIMPLE_QA = """You are Juddges Legal Assistant, an expert AI assistant developed by Wrocław University of Science and Technology (WUST) for analyzing legal documents, court judgments, and judicial decisions.

Your expertise covers:
- Polish tax law and tax court judgments
- Criminal law judicial decisions (Poland & England/Wales)
- Legal document analysis and information extraction

Your main responsibility is to respond accurately and concisely using information from the provided legal documents.

- **Primary Goal**: Focus on answering questions strictly from the content within the uploaded legal documents.
...(rest of prompt)
```

---

### 3. Chat Chain Metadata - Tax-Focused ❌
**File**: `backend/packages/juddges_search/juddges_search/chains/chat.py`

**Problems**:
- **Line 25**: Comment says "Build the complete legal tax chat prompt" → should be "legal chat prompt"
- **Line 264**: Metadata says `"purpose": "Polish tax law consultation with chat history..."`
- **Line 267**: Domain says `"domain": "legal-tax-polish"` → too narrow
- **Line 261**: Tags include `"tax-assistant"` and `"tax-expert"` → misleading

**Current Code**:
```python
# Line 23-25
def _build_legal_prompt(response_format: str = "adaptive") -> str:
    """
    Build the complete legal tax chat prompt based on response format.
```

```python
# Lines 258-277
.with_config(
    run_name="legal_chat_assistant",
    callbacks=callbacks,
    tags=["legal-ai", "tax-assistant", "chat-with-history", "wust-project"],
    metadata={
        "version": __version__,
        "purpose": "Polish tax law consultation with chat history and intelligent retrieval routing",
        "project": "AI-Tax & JuDDGES - WUST",
        "domain": "legal-tax-polish",
        ...
    }
)
```

**Recommendations**:
```python
# Line 23-25
def _build_legal_prompt(response_format: str = "adaptive") -> str:
    """
    Build the complete legal chat prompt based on response format.
```

```python
# Lines 258-277
.with_config(
    run_name="legal_chat_assistant",
    callbacks=callbacks,
    tags=["legal-ai", "juddges", "chat-with-history", "wust-project", "legal-judgments"],
    metadata={
        "version": __version__,
        "purpose": "Legal judgments analysis for Polish tax law and criminal law with chat history and intelligent retrieval routing",
        "project": "AI-Tax & JuDDGES - WUST",
        "domain": "legal-judgments-multi-domain",  # or "legal-pl-uk"
        ...
    }
)
```

---

## Good Examples (No Changes Needed) ✅

### 1. Legal System Prompt - CORRECT ✅
**File**: `backend/packages/juddges_search/juddges_search/prompts/legal/system.py`

```python
LEGAL_SYSTEM_PROMPT = """<system_identity>
You are an AI Legal Assistant developed by Wrocław University of Science and Technology (WUST) as part of two innovative legal AI research initiatives: AI-Tax and JuDDGES.
</system_identity>
```

**Why This is Good**:
- Properly identifies both research projects
- Explains AI-Tax (tax law focus)
- Explains JuDDGES (judicial decisions focus)
- Clear separation of capabilities by domain

---

### 2. Legal Instructions Prompt - CORRECT ✅
**File**: `backend/packages/juddges_search/juddges_search/prompts/legal/instructions.py`

**Why This is Good**:
- Domain-neutral instructions
- Supports both tax law and criminal law
- Clear domain detection logic
- Proper cross-jurisdictional support

---

### 3. Summarization Prompts - CORRECT ✅
**File**: `backend/packages/juddges_search/juddges_search/prompts/summarization.py`

```python
SUMMARIZATION_SYSTEM_PROMPT = """You are an expert legal document summarizer developed by Wrocław University of Science and Technology (WUST). You specialize in analyzing Polish tax law documents, court judgments, tax interpretations, and criminal law judicial decisions.
```

**Why This is Good**:
- Mentions multiple document types
- Includes both tax and criminal law
- Clear scope definition

---

## Minor Issues (Nice to Fix)

### 4. Query Enhancement Examples
**File**: `backend/packages/juddges_search/juddges_search/chains/query_enhancement.py:24`

**Current**:
```python
Examples:
- Input: "contract disputes"
  Output: "contract disputes breach of contract..."

- Input: "tax evasion cases"
  Output: "tax evasion tax fraud..."

- Input: "employment discrimination"
  Output: "employment discrimination workplace discrimination..."
```

**Recommendation**: Add a criminal law example to balance the examples:
```python
Examples:
- Input: "contract disputes"
  Output: "contract disputes breach of contract..."

- Input: "sentencing factors theft"
  Output: "sentencing factors theft sentencing guidelines larceny property offenses sentencing rationale mitigating circumstances aggravating factors"

- Input: "tax evasion cases"
  Output: "tax evasion tax fraud..."
```

---

## Files That Reference Juddges (No Issues) ✅

These files properly reference Juddges/judgments and need no changes:
- `backend/packages/juddges_search/juddges_search/models.py`
- `backend/packages/juddges_search/juddges_search/retrieval/*.py`
- `backend/packages/juddges_search/juddges_search/db/supabase_db.py`
- Most configuration and schema files

---

## Implementation Priority

### High Priority (Block User-Facing Features)
1. ✅ Fix `prompts/qa.py` - Update SIMPLE_QA prompt identity
2. ✅ Fix `chains/chat.py` - Update metadata and tags

### Medium Priority (Internal/Legacy Code)
3. ✅ Delete or update `prompts/chat.py` - Legacy prompt file

### Low Priority (Nice to Have)
4. ⚪ Add criminal law example to query enhancement

---

## Testing Recommendations

After implementing fixes, test:

1. **QA Chain**: Verify responses identify as Juddges Legal Assistant
   ```bash
   # Test the QA chain
   poetry run pytest tests/packages/juddges_search/test_qa_chain.py -v
   ```

2. **Chat Chain Metadata**: Verify LangSmith/Langfuse traces show correct metadata
   - Check tags include "juddges" and "legal-judgments"
   - Check purpose mentions judgments analysis
   - Check domain is updated

3. **User-Facing Messages**: Test actual chat responses
   - Ask a question in the UI
   - Verify the response doesn't mention "AI Tax Assistant"
   - Verify it properly handles both tax and criminal law queries

---

## Summary of Changes Needed

| File | Issue | Action | Priority |
|------|-------|--------|----------|
| `prompts/chat.py` | Legacy "AI Tax Assistant" | Delete or update | Medium |
| `prompts/qa.py` | "AI Tax Assistant" identity | Update prompt | **High** |
| `chains/chat.py` | Tax-focused metadata | Update metadata & tags | **High** |
| `chains/query_enhancement.py` | Imbalanced examples | Add criminal law example | Low |

---

## Next Steps

1. Review this audit report
2. Decide on priority of fixes (recommend: High priority items first)
3. Implement changes to `prompts/qa.py` and `chains/chat.py`
4. Run tests to verify changes
5. Update any documentation that references these prompts
