// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// ESM-only packages that need to be transformed by Jest.
// Grouped by prefix where possible to keep the list manageable.
const esmPackages = [
  'uuid',
  'geist',
  'react-markdown',
  'remark-.*',
  'rehype-.*',
  'unified',
  'bail',
  'devlop',
  'is-plain-obj',
  'trough',
  'vfile',
  'vfile-message',
  'unist-util-.*',
  'mdast-util-.*',
  'micromark.*',
  'decode-named-character-reference',
  'character-entities.*',
  'property-information',
  'hast-util-.*',
  'space-separated-tokens',
  'comma-separated-tokens',
  'estree-util-.*',
  'trim-lines',
  'zwitch',
  'html-url-attributes',
  'longest-streak',
  'stringify-entities',
  'parse-entities',
  'parse5',
  'is-alphabetical',
  'is-alphanumerical',
  'is-decimal',
  'is-hexadecimal',
  'ccount',
  'lowlight',
  'react-day-picker',
  'date-fns',
  'nanoid',
  'zod',
].join('|')

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you based on your tsconfig.json paths)
    '^@/(.*)$': '<rootDir>/$1',
  },
  testEnvironment: 'jest-environment-jsdom',
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/tests/integration/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/__tests__/**/*.test.{js,jsx,ts,tsx}'
  ],
  testEnvironmentOptions: {
    customExportConditions: [''],
  },
  collectCoverageFrom: [
    'components/**/*.{js,jsx,ts,tsx}',
    'app/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    'hooks/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  // TypeScript transformation is handled by next/jest automatically
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/out/',
    '/coverage/',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/.next/',
  ],
  // Coverage configuration
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/coverage/',
    '/tests/',
    '/__tests__/',
  ],
  // Coverage thresholds — set above current levels to prevent regression
  coverageThreshold: {
    global: {
      statements: 6,
      branches: 4,
      functions: 5,
      lines: 6,
    },
  },
}

// Wrap the resolved config to override transformIgnorePatterns from next/jest.
// next/jest adds its own patterns that block ESM packages; we replace them
// with patterns that include negative lookaheads for all ESM-only dependencies.
const jestConfig = createJestConfig(customJestConfig)
module.exports = async () => {
  const resolvedConfig = await jestConfig()
  resolvedConfig.transformIgnorePatterns = [
    `/node_modules/(?!.pnpm)(?!(${esmPackages})/)`,
    `/node_modules/.pnpm/(?!(${esmPackages})@)`,
    '^.+\\.module\\.(css|sass|scss)$',
  ]
  return resolvedConfig
}
