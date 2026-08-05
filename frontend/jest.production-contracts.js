const productionContracts = [
  {
    file: '__tests__/app/chat/[id]/page-next-server.integration.test.ts',
    buildDirectory: '.next-contract-chat-detail',
    tsconfigPath: 'tsconfig.contract-chat-detail.json',
  },
  {
    file: 'tests/integration/collections/detail-production.test.ts',
    buildDirectory: '.next-contract-collections-detail',
    tsconfigPath: 'tsconfig.contract-collections-detail.json',
  },
  {
    file: 'tests/unit/api/graphql/route-contract.test.ts',
    buildDirectory: '.next-contract-graphql-route',
    tsconfigPath: 'tsconfig.contract-graphql-route.json',
  },
  {
    file: 'tests/unit/app/documents/http-status-contract.test.ts',
    buildDirectory: '.next-contract-documents-detail',
    tsconfigPath: 'tsconfig.contract-documents-detail.json',
  },
  {
    file: 'tests/unit/app/extractions/http-status-contract.test.ts',
    buildDirectory: '.next-contract-extractions-detail',
    tsconfigPath: 'tsconfig.contract-extractions-detail.json',
  },
  {
    file: 'tests/unit/app/schemas/http-status-contract.test.ts',
    buildDirectory: '.next-contract-schemas-detail',
    tsconfigPath: 'tsconfig.contract-schemas-detail.json',
  },
]

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

module.exports = {
  productionContracts,
  testMatch: productionContracts.map(
    (contract) => `<rootDir>/${contract.file}`
  ),
  testPathIgnorePatterns: productionContracts.map(
    (contract) => `^<rootDir>/${escapeRegExp(contract.file)}$`
  ),
}
