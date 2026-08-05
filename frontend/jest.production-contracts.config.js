// eslint-disable-next-line @typescript-eslint/no-require-imports
const createBaseConfig = require('./jest.config')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const productionContracts = require('./jest.production-contracts')

module.exports = async () => {
  const config = await createBaseConfig()

  return {
    ...config,
    displayName: 'production-contracts',
    testMatch: productionContracts.testMatch,
    testPathIgnorePatterns: [
      '/node_modules/',
      '/.next/',
      '/out/',
      '/coverage/',
    ],
    collectCoverage: false,
    coverageThreshold: undefined,
    maxWorkers: 1,
  }
}
