# Jest TypeScript Setup - Installation Guide

## Current Status

The Jest configuration has been updated to support TypeScript test files. However, **dependencies need to be installed** before tests will run successfully.

## Required Dependencies (Missing)

The following packages are required but not yet installed:

```json
{
  "@testing-library/dom": "^10.4.0",
  "@testing-library/user-event": "^14.5.2"
}
```

These have been added to `package.json` but need to be installed.

## Installation Instructions

### Option 1: Using Docker (Recommended)

Per project guidelines, use Docker for npm operations:

```bash
# Navigate to frontend directory
cd /home/laugustyniak/github/legal-ai/juddges-app/frontend

# Install dependencies using Docker
docker compose run --rm frontend npm install
```

### Option 2: Direct npm Install

If you have proper permissions:

```bash
cd /home/laugustyniak/github/legal-ai/juddges-app/frontend
npm install
```

### Option 3: Fix Permissions First

If you encounter permission errors:

```bash
# Fix node_modules ownership
sudo chown -R $USER:$USER node_modules

# Then install
npm install
```

## What Has Been Fixed

### 1. Updated jest.config.js

Added configuration for better TypeScript support:
- Module file extensions handling
- Test path ignore patterns
- Coverage path ignore patterns

### 2. Updated package.json

Added missing dependencies:
- `@testing-library/dom@^10.4.0`
- `@testing-library/user-event@^14.5.2`

### 3. Existing Configuration (Already Working)

- `next/jest` preset handles TypeScript transformation
- Module name mapper for `@/` imports
- Test environment set to jsdom
- Setup file configured at `tests/setup.ts`

## Verification Steps

After installing dependencies, verify the setup:

### 1. Run All Tests

```bash
npm test
```

Expected: Tests should run without "Cannot find module" errors.

### 2. Run Specific Test File

```bash
npm test -- __tests__/schema-editor/schema-editor.test.tsx
```

Expected: Test file should parse without "Unexpected token" errors.

### 3. Check TypeScript Compilation

```bash
npx tsc --noEmit
```

Expected: TypeScript should compile without errors (separate from Jest).

### 4. Run Tests with Coverage

```bash
npm run test:coverage
```

Expected: Coverage report should generate successfully.

## What Works Now

After installation, these features will work:

✅ TypeScript test files (`.test.ts`, `.test.tsx`)
✅ Type imports (`import type { ... }`)
✅ Interface definitions in tests
✅ `jest.Mock` type annotations
✅ Module path aliases (`@/` imports)
✅ Testing Library utilities
✅ User event simulation

## Configuration Files

### jest.config.js
Location: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/jest.config.js`

Key features:
- Uses `next/jest` for TypeScript transformation
- Module name mapper for `@/` aliases
- Test environment: jsdom
- Setup file: `tests/setup.ts`

### tests/setup.ts
Location: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/tests/setup.ts`

Provides:
- Testing Library jest-dom matchers
- TextEncoder/TextDecoder polyfills
- crypto.randomUUID polyfill
- Next.js router mocks
- Environment variable setup

### package.json
Location: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/package.json`

Test scripts:
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

## Common Commands

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- path/to/test.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should render"

# Run tests with verbose output
npm test -- --verbose

# List all test files (without running)
npm test -- --listTests
```

## Troubleshooting

### Issue: "Cannot find module '@testing-library/dom'"

**Solution:** Dependencies not installed. Run:
```bash
npm install
# or
docker compose run --rm frontend npm install
```

### Issue: "Permission denied" when installing

**Solution:** Use Docker:
```bash
docker compose run --rm frontend npm install
```

### Issue: Tests still show "Unexpected token"

**Verification:**
1. Check jest.config.js uses `next/jest`
2. Verify test file matches pattern in `testMatch`
3. Ensure file has `.test.ts` or `.test.tsx` extension

### Issue: "Module '@/' not found"

**Verification:**
1. Check moduleNameMapper in jest.config.js
2. Verify tsconfig.json has matching paths
3. Ensure using `@/` prefix consistently

## Next Steps

1. **Install dependencies** (see Installation Instructions above)
2. **Run tests** to verify everything works
3. **Check test coverage** to ensure adequate testing
4. **Refer to documentation** for writing new tests

## Documentation

Comprehensive guides have been created:

- **Reference Guide**: `/home/laugustyniak/github/legal-ai/juddges-app/docs/reference/jest-typescript-configuration.md`
  - Detailed explanation of configuration
  - TypeScript support features
  - Test patterns and examples
  - Best practices

- **How-To Guide**: `/home/laugustyniak/github/legal-ai/juddges-app/docs/how-to/fix-jest-typescript-errors.md`
  - Common error solutions
  - Step-by-step fixes
  - Installation troubleshooting
  - Quick reference

## Summary

The Jest configuration is now properly set up for TypeScript. The only remaining step is to **install the missing dependencies**. Use Docker for installation as per project guidelines:

```bash
docker compose run --rm frontend npm install
```

After installation, all TypeScript test files should work without errors.
