# Test Fixes Proposed

## Issues Identified

### Issue 1: OpenAI API Key Required at Import Time (3 test failures)
**Location:** `backend/packages/juddges_search/juddges_search/chains/schema_generation.py:101`

**Problem:**
```python
# Line 101 - Module-level LLM initialization
model = get_default_llm(use_mini_model=False)
```

This initializes the LLM when the module is imported, requiring `OPENAI_API_KEY` to be set. Tests can't even import the module without the API key.

**Impact:** Blocks 3 tests:
- `tests/app/test_models.py`
- `tests/app/test_search_metadata.py`
- `tests/app/test_thinking_mode.py`

**Fix:** Lazy-load the model in a function instead of at module level.

---

### Issue 2: Incorrect Python Path Setup (2 test failures)
**Location:** `backend/tests/conftest.py:13-14`

**Problem:**
```python
# Lines 13-14 - INCORRECT paths
sys.path.insert(0, str(packages_dir / "juddges_search"))
sys.path.insert(0, str(packages_dir / "schema_generator_agent"))
```

This adds the package directories themselves, but imports need the parent `packages` directory.

**Impact:** Blocks 2 tests:
- `tests/packages/schema_generator_agent/test_agents.py`
- `tests/packages/schema_generator_agent/test_edge_cases.py`

**Fix:** Add `packages` directory to path instead of individual package dirs.

---

## Proposed Fixes

### Fix 1: Lazy-Load LLM in schema_generation.py

**File:** `backend/packages/juddges_search/juddges_search/chains/schema_generation.py`

**Change lines 100-101 from:**
```python
# Get default LLM (uses GPT-4o by default)
model = get_default_llm(use_mini_model=False)
```

**To:**
```python
# Lazy-load LLM to avoid requiring API key at import time
def _get_model():
    """Get or create the default LLM model."""
    return get_default_llm(use_mini_model=False)
```

**Then update all usages of `model` to call `_get_model()` instead:**
- Line ~150: In `create_schema_generation_chain()` function
- Any other references to `model` variable

---

### Fix 2: Correct Python Path in conftest.py

**File:** `backend/tests/conftest.py`

**Change lines 10-14 from:**
```python
# Add backend packages to Python path for tests
backend_dir = Path(__file__).parent.parent
packages_dir = backend_dir / "packages"
sys.path.insert(0, str(packages_dir / "juddges_search"))
sys.path.insert(0, str(packages_dir / "schema_generator_agent"))
```

**To:**
```python
# Add backend and packages to Python path for tests
backend_dir = Path(__file__).parent.parent
packages_dir = backend_dir / "packages"

# Add packages directory to path (not individual package dirs)
sys.path.insert(0, str(packages_dir))

# Add backend app directory for imports like "from app.models import..."
sys.path.insert(0, str(backend_dir))
```

---

## Implementation Priority

1. **Fix 2 (conftest.py)** - Quick fix, affects 2 tests
2. **Fix 1 (schema_generation.py)** - More complex, affects 3 tests

Both fixes are non-breaking and improve test reliability.

---

## Expected Results After Fixes

- ✅ Tests will run without requiring OPENAI_API_KEY for imports
- ✅ Integration tests that actually call LLMs can still be marked to skip if no API key
- ✅ Schema generator agent tests will find the module correctly
- ✅ All import errors resolved
- ✅ Remaining test failures (if any) will be actual test logic issues, not import problems

---

## Alternative: Run Tests with API Key

**Quick workaround** (not recommended for CI/CD):
```bash
export OPENAI_API_KEY="your-key-here"
cd backend
python3 -m poetry run pytest tests/ -v
```

This allows tests to run but doesn't fix the underlying architectural issue of module-level LLM initialization.
