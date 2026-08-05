const productionContractFiles = [
  '__tests__/app/chat/[id]/page-next-server.integration.test.ts',
  'tests/integration/collections/detail-production.test.ts',
  'tests/unit/api/graphql/route-contract.test.ts',
  'tests/unit/app/documents/http-status-contract.test.ts',
  'tests/unit/app/extractions/http-status-contract.test.ts',
  'tests/unit/app/schemas/http-status-contract.test.ts',
]

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

module.exports = {
  testMatch: productionContractFiles.map((file) => `<rootDir>/${file}`),
  testPathIgnorePatterns: productionContractFiles.map(
    (file) => `/${escapeRegExp(file)}$`
  ),
}
