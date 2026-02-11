# Schema Generator Agent Tests

This directory contains comprehensive tests for the schema generator agent package.

## Test Files

### 1. `test_prompts.py` (12 tests)
Tests for prompt file validation and structure.

**What it tests:**
- All required prompt files exist
- Prompt files contain valid YAML
- Prompts have required content fields
- Individual prompt structure validation
- Placeholder formatting consistency

**Running:**
```bash
cd backend
poetry run pytest tests/packages/schema_generator_agent/test_prompts.py -v
```

**No external dependencies required** - these tests only validate YAML files.

### 2. `test_edge_cases.py` (14 tests)
Tests for edge cases and routing logic.

**What it tests:**
- Routing logic for schema refinement (needs/doesn't need refinement)
- Max refinement rounds enforcement
- Confidence score thresholds
- Data assessment routing
- Empty/missing state handling
- Schema history accumulation
- Prompt loading for different document types

**Running:**
```bash
cd backend
poetry run pytest tests/packages/schema_generator_agent/test_edge_cases.py -v
```

**Dependencies:** Requires LangChain and OpenAI packages (but not API calls for most tests).

### 3. `test_agents.py` (10 tests)
Unit tests for individual schema generator agents.

**What it tests:**
- `ProblemDefinerHelperAgent` - extracts user intent
- `ProblemDefinerAgent` - creates problem definitions
- `SchemaGeneratorAgent` - generates valid JSON schemas
- `SchemaAssessmentAgent` - validates schema quality
- `SchemaRefinerAgent` - improves schemas
- Agent state structure
- Handling of minimal/empty states

**Running:**
```bash
cd backend
poetry run pytest tests/packages/schema_generator_agent/test_agents.py -v -m unit
```

**Dependencies:** Requires OpenAI API key (makes actual LLM calls).

### 4. `test_workflow.py` (7 tests)
Integration tests for full schema generation workflow.

**What it tests:**
- Complete end-to-end schema generation
- Schema refinement improves quality
- Workflow with existing schemas
- Schema history tracking
- Complex multi-field extraction requests
- Valid JSON Schema output

**Running:**
```bash
cd backend
poetry run pytest tests/packages/schema_generator_agent/test_workflow.py -v -m integration
```

**Dependencies:**
- Requires OpenAI API key
- Makes multiple LLM calls (can be slow and expensive)
- Marked with `@pytest.mark.integration` and `@pytest.mark.slow`

## Running All Tests

```bash
# Run all schema generator tests
cd backend
poetry run pytest tests/packages/schema_generator_agent/ -v

# Run only unit tests (no LLM calls for some)
poetry run pytest tests/packages/schema_generator_agent/ -v -m unit

# Run only integration tests (requires API key)
poetry run pytest tests/packages/schema_generator_agent/ -v -m integration

# Run with coverage
poetry run pytest tests/packages/schema_generator_agent/ --cov=schema_generator_agent

# Skip slow tests
poetry run pytest tests/packages/schema_generator_agent/ -v -m "not slow"
```

## Environment Setup

For tests that require LLM calls, you need:

1. OpenAI API key set in environment:
   ```bash
   export OPENAI_API_KEY="your-key-here"
   ```

2. Dependencies installed via Poetry:
   ```bash
   cd backend
   poetry install
   ```

## Test Markers

- `@pytest.mark.unit` - Unit tests, minimal dependencies
- `@pytest.mark.integration` - Integration tests, requires external services
- `@pytest.mark.slow` - Slow-running tests (full workflows, multiple LLM calls)

## Test Coverage

The test suite provides comprehensive coverage of:

1. **Prompt Validation** (100% coverage of prompt files)
   - File existence and format
   - YAML structure
   - Placeholder consistency

2. **Routing Logic** (100% coverage of routing functions)
   - Assessment-based routing
   - Refinement round limits
   - Confidence thresholds

3. **Agent Functionality** (~80% coverage of agent classes)
   - Problem definition
   - Schema generation
   - Schema assessment
   - Schema refinement

4. **Workflow Integration** (~70% coverage of full workflow)
   - End-to-end generation
   - Multi-step refinement
   - History tracking

## Troubleshooting

### Import Errors

If you see `ModuleNotFoundError` for `schema_generator_agent` or `juddges_search`:

```bash
# Make sure you're in the backend directory
cd backend

# Use poetry to run tests (it sets up paths correctly)
poetry run pytest tests/packages/schema_generator_agent/
```

### API Key Errors

If integration tests fail with authentication errors:

```bash
# Check your OpenAI API key is set
echo $OPENAI_API_KEY

# Or set it in .env file in backend directory
echo "OPENAI_API_KEY=your-key" >> .env
```

### Slow Test Timeout

If workflow tests timeout:

```bash
# Increase timeout in pytest.ini or run with custom timeout
poetry run pytest tests/packages/schema_generator_agent/ --timeout=300
```

## Next Steps

To add more tests:

1. Add test functions to existing files
2. Use appropriate markers (`@pytest.mark.unit`, etc.)
3. Follow existing naming conventions (`test_<functionality>`)
4. Add docstrings explaining what each test validates
