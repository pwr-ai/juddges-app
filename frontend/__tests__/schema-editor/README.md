# Schema Editor Tests

This directory contains comprehensive tests for the Schema Studio visual editor feature.

## Test Files

### 1. `test-utils.ts`
**Test utilities and helper functions**

Provides:
- Mock data factories (`createMockField`, `createMockSchema`)
- Builder pattern for complex test data (`buildField()`)
- Supabase client mocking
- Real-time event payload creation
- Timing utilities (`wait`, `flushPromises`)
- Validation response mocks
- Fetch mocking utilities

**Usage:**
```typescript
import { createMockField, buildField } from './test-utils';

const field = buildField()
  .withName('email')
  .withType('string')
  .required()
  .withValidation({ pattern: '^[^@]+@[^@]+$' })
  .build();
```

### 2. `schema-editor.test.tsx`
**Component tests for FieldCard and SchemaCanvas**

Tests:
- FieldCard rendering and interactions
- Field type display (string, number, boolean, array, object)
- Required/optional badge display
- AI-created field highlighting
- SchemaCanvas CRUD operations (add, edit, delete)
- Field list rendering
- Real-time sync behavior
- Performance with 50+ fields
- Accessibility (keyboard navigation, ARIA labels)

**Coverage:**
- Component rendering: 90%+
- User interactions: 95%+
- Edge cases: 80%+

### 3. `useSchemaEditorStore.test.ts`
**Store tests for Zustand state management**

Tests:
- Initial state
- Session and schema ID management
- Field CRUD operations
- Field reordering
- Selected field state
- Dirty/clean state tracking
- Saving state
- Undo/redo functionality
- Optimistic updates
- Rollback scenarios
- Complex operation sequences

**Coverage:**
- State management: 95%+
- Actions: 100%
- Complex scenarios: 85%+

### 4. `schema-validation.test.ts`
**Validation logic tests**

Tests:
- Zod schema validation
  - Field name patterns
  - Field types
  - Descriptions
  - Validation rules
- JSON Schema compilation
  - Field to JSON Schema conversion
  - Validation rule transformation
  - Nested objects and arrays
- Backend Pydantic validation
  - API endpoint communication
  - Success/error handling
  - Compatibility checks
- Error message formatting
  - Field-level errors
  - Schema-level errors
  - Backend error extraction

**Coverage:**
- Validation logic: 100%
- Error handling: 95%+
- Edge cases: 85%+

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Specific Test File
```bash
npm test schema-editor.test.tsx
npm test useSchemaEditorStore.test.ts
npm test schema-validation.test.ts
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Coverage Targets

| Metric | Target | Current |
|--------|--------|---------|
| Statements | 80% | - |
| Branches | 75% | - |
| Functions | 80% | - |
| Lines | 80% | - |

## Test Patterns

### Component Testing
```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('should render component', () => {
  render(<Component />);
  expect(screen.getByText('text')).toBeInTheDocument();
});
```

### Store Testing
```typescript
import { renderHook, act } from '@testing-library/react';

test('should update state', () => {
  const { result } = renderHook(() => useStore());

  act(() => {
    result.current.action();
  });

  expect(result.current.state).toBe(expected);
});
```

### Validation Testing
```typescript
import { z } from 'zod';

test('should validate schema', () => {
  const result = schema.safeParse(data);
  expect(result.success).toBe(true);
});
```

## Best Practices

1. **Test Independence:** Each test should be independent and not rely on other tests
2. **AAA Pattern:** Arrange, Act, Assert
3. **Descriptive Names:** Test names should clearly describe what is being tested
4. **Mock External Dependencies:** Mock Supabase, fetch, etc.
5. **Avoid Fixed Timeouts:** Use `waitFor` instead of `setTimeout`
6. **Test Edge Cases:** Empty states, errors, boundary conditions
7. **Accessibility:** Include keyboard navigation and ARIA tests

## Debugging

### View Test Output
```bash
npm test -- --verbose
```

### Debug Specific Test
```bash
npm test -- -t "test name"
```

### Generate Coverage HTML
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

### Common Issues

**Issue:** Tests are flaky
- Use `waitFor` for async operations
- Avoid race conditions
- Check for proper cleanup

**Issue:** Low coverage
- Check coverage report: `coverage/lcov-report/index.html`
- Identify untested branches
- Add tests for edge cases

**Issue:** Slow tests
- Use `jest.mock()` for heavy dependencies
- Avoid real network calls
- Optimize test setup

## Related Documentation

- [Testing Strategy](/docs/reference/schema-editor-testing-strategy.md)
- [Implementation Plan](/docs/reference/unified-schema-editor-implementation-plan.md)
- [E2E Tests](../ /schema-editor.spec.ts)

## Contributing

When adding new tests:

1. Follow existing patterns
2. Use test utilities from `test-utils.ts`
3. Update this README if adding new test files
4. Ensure coverage targets are met
5. Run all tests before committing

## Questions?

See the [Testing Strategy](../../docs/reference/schema-editor-testing-strategy.md) for comprehensive documentation.
