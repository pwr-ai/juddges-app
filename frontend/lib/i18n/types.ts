/**
 * Type definitions for internationalization (i18n)
 *
 * This file contains all type definitions for the i18n system.
 * Keep types separate to avoid circular dependencies.
 */

/**
 * Supported locale codes
 * - 'en' - English (LTR)
 * - 'pl' - Polish (LTR)
 * - 'ar' - Arabic (RTL) - for RTL support
 * - 'he' - Hebrew (RTL) - for RTL support
 */
export type LocaleCode = 'en' | 'pl';

/**
 * Text direction
 */
export type TextDirection = 'ltr' | 'rtl';

/**
 * Locale configuration
 */
export interface LocaleConfig {
  /** Locale code */
  code: LocaleCode;
  /** Display name in native language */
  nativeName: string;
  /** Display name in English */
  englishName: string;
  /** Text direction */
  direction: TextDirection;
  /** Date format pattern */
  dateFormat: string;
  /** Number decimal separator */
  decimalSeparator: string;
  /** Number thousands separator */
  thousandsSeparator: string;
  /** Currency code (ISO 4217) */
  defaultCurrency: string;
  /** Flag emoji for visual representation */
  flag: string;
}

/**
 * Translation namespace for common UI elements
 */
export interface CommonTranslations {
  // Actions
  save: string;
  cancel: string;
  delete: string;
  edit: string;
  create: string;
  search: string;
  filter: string;
  reset: string;
  submit: string;
  confirm: string;
  close: string;
  back: string;
  next: string;
  previous: string;
  loading: string;
  retry: string;
  refresh: string;
  download: string;
  upload: string;
  copy: string;
  share: string;

  // Status
  success: string;
  error: string;
  warning: string;
  info: string;
  pending: string;
  processing: string;
  completed: string;
  failed: string;

  // Common labels
  yes: string;
  no: string;
  all: string;
  none: string;
  select: string;
  selectAll: string;
  clear: string;
  clearAll: string;
  showMore: string;
  showLess: string;
  viewDetails: string;
  learnMore: string;

  // Time-related
  today: string;
  yesterday: string;
  tomorrow: string;
  now: string;
  lastUpdated: string;
  createdAt: string;
  modifiedAt: string;
}

/**
 * Translation namespace for navigation
 */
export interface NavigationTranslations {
  // Main navigation
  home: string;
  dashboard: string;
  search: string;
  chat: string;
  aiAssistant: string;
  documents: string;
  collections: string;
  researchCollections: string;

  // Analysis section
  analysis: string;
  documentRelationships: string;

  // Advanced tools
  advancedTools: string;
  extract: string;
  extractStructureData: string;
  dataSchemas: string;
  aiSchemaBuilder: string;
  extractions: string;

  // Resources
  resources: string;
  publications: string;
  researchBlog: string;
  useCases: string;
  settings: string;

  // Support
  support: string;
  helpCenter: string;
  contact: string;

  // Chat specific
  newChat: string;
  quickSearch: string;

  // Public navigation
  navigation: string;
  about: string;
  privacy: string;
  termsOfService: string;
  features: string;
  account: string;
  signIn: string;
  signUp: string;
  signOut: string;

  // Legal domain navigation
  searchJudgments: string;
  savedSearches: string;
  dataExtraction: string;
  extractionResults: string;
  baseTemplate: string;
  compareDatasets: string;
}

/**
 * Translation namespace for chat/AI assistant
 */
export interface ChatTranslations {
  // Loading states
  thinking: string;
  analyzingQuestion: string;
  searchingDocuments: string;
  formulatingResponse: string;
  understandingQuestion: string;
  retrievingDocuments: string;
  analyzingPrecedents: string;
  preparingAnswer: string;

  // Context-specific messages
  readingContractClauses: string;
  searchingContractLaw: string;
  analyzingProvisions: string;
  draftingInterpretation: string;
  understandingLegalIssue: string;
  searchingCaseLaw: string;
  analyzingPrecedentsCase: string;
  synthesizingFindings: string;
  identifyingRegulations: string;
  crossReferencingRequirements: string;
  evaluatingCompliance: string;
  preparingGuidance: string;
  consultingKnowledgeBase: string;
  formulatingAnalysis: string;
  craftingResponse: string;

  // Chat UI
  askQuestion: string;
  typeMessage: string;
  sendMessage: string;
  clearConversation: string;
  exportChat: string;
  regenerateResponse: string;
  stopGenerating: string;

  // Error states
  errorGenerating: string;
  errorNetwork: string;
  errorTimeout: string;
  tryAgain: string;
}

/**
 * Translation namespace for search
 */
export interface SearchTranslations {
  // Search UI
  searchPlaceholder: string;
  searchDocuments: string;
  searchResults: string;
  noResults: string;
  noResultsDescription: string;

  // Filters
  filters: string;
  filterByType: string;
  filterByDate: string;
  filterByLanguage: string;
  dateRange: string;
  from: string;
  to: string;

  // Results
  resultsFound: string;
  showingResults: string;
  sortBy: string;
  relevance: string;
  dateNewest: string;
  dateOldest: string;

  // Document types
  allDocuments: string;
  contracts: string;
  caseLaw: string;
  regulations: string;
  taxInterpretations: string;
}

/**
 * Translation namespace for documents
 */
export interface DocumentTranslations {
  // Document details
  document: string;
  documents: string;
  documentDetails: string;
  documentNotFound: string;

  // Metadata
  title: string;
  type: string;
  date: string;
  language: string;
  source: string;
  summary: string;
  content: string;

  // Actions
  openDocument: string;
  downloadDocument: string;
  shareDocument: string;
  addToCollection: string;
  removeFromCollection: string;

  // Collections
  collection: string;
  collections: string;
  createCollection: string;
  deleteCollection: string;
  renameCollection: string;
  emptyCollection: string;
}

/**
 * Translation namespace for extraction/schemas
 */
export interface ExtractionTranslations {
  // Extraction UI
  extraction: string;
  extractions: string;
  extractData: string;
  selectDocuments: string;
  selectSchema: string;
  startExtraction: string;

  // Schema management
  schema: string;
  schemas: string;
  createSchema: string;
  editSchema: string;
  deleteSchema: string;
  schemaName: string;
  schemaDescription: string;
  fields: string;
  addField: string;

  // Status
  extractionInProgress: string;
  extractionComplete: string;
  extractionFailed: string;

  // Results
  extractedData: string;
  exportToExcel: string;
  exportToJson: string;
}

/**
 * Translation namespace for authentication
 */
export interface AuthTranslations {
  // Forms
  email: string;
  password: string;
  confirmPassword: string;
  forgotPassword: string;
  resetPassword: string;
  rememberMe: string;

  // Actions
  login: string;
  logout: string;
  register: string;
  createAccount: string;

  // Messages
  welcomeBack: string;
  signInToContinue: string;
  noAccount: string;
  haveAccount: string;
  passwordsDoNotMatch: string;
  invalidCredentials: string;
  accountCreated: string;
  passwordResetSent: string;

  // Profile
  profile: string;
  myAccount: string;
  accountSettings: string;
}

/**
 * Translation namespace for errors
 */
export interface ErrorTranslations {
  // Common errors
  somethingWentWrong: string;
  pageNotFound: string;
  unauthorized: string;
  forbidden: string;
  serverError: string;
  networkError: string;
  timeout: string;

  // Validation errors
  required: string;
  invalidEmail: string;
  invalidFormat: string;
  tooShort: string;
  tooLong: string;

  // Action errors
  failedToLoad: string;
  failedToSave: string;
  failedToDelete: string;
  failedToFetch: string;
}

/**
 * Translation namespace for dashboard
 */
export interface DashboardTranslations {
  title: string;
  databaseOverview: string;
  extractionTemplates: string;
  recentJudgments: string;
  popularLegalTopics: string;
  researchCollections: string;
  recentExtractions: string;
  viewAll: string;
  startChat: string;
  generateTemplate: string;
  startExtraction: string;
  noSchemas: string;
  noExtractions: string;
  noTrending: string;
  failedToLoadStats: string;
  dataCompleteness: string;
  legalInsights: string;
  complexityAnalysis: string;
}

/**
 * Translation namespace for legal terminology
 */
export interface LegalTranslations {
  // Legal terms
  termsOfService: string;
  privacyPolicy: string;
  cookiePolicy: string;
  dataProcessing: string;
  consent: string;

  // Document types
  judgment: string;
  ruling: string;
  interpretation: string;
  regulation: string;
  statute: string;
  amendment: string;

  // Legal concepts
  precedent: string;
  jurisdiction: string;
  compliance: string;
  liability: string;

  // Version control
  lastUpdated: string;
  version: string;
  effectiveDate: string;
}

/**
 * Complete translations structure
 */
export interface Translations {
  common: CommonTranslations;
  navigation: NavigationTranslations;
  chat: ChatTranslations;
  search: SearchTranslations;
  documents: DocumentTranslations;
  extraction: ExtractionTranslations;
  auth: AuthTranslations;
  errors: ErrorTranslations;
  legal: LegalTranslations;
  dashboard: DashboardTranslations;
}

/**
 * Translation key path type
 * Generates union type of all possible translation key paths
 */
export type TranslationKey =
  | `common.${keyof CommonTranslations}`
  | `navigation.${keyof NavigationTranslations}`
  | `chat.${keyof ChatTranslations}`
  | `search.${keyof SearchTranslations}`
  | `documents.${keyof DocumentTranslations}`
  | `extraction.${keyof ExtractionTranslations}`
  | `auth.${keyof AuthTranslations}`
  | `errors.${keyof ErrorTranslations}`
  | `legal.${keyof LegalTranslations}`
  | `dashboard.${keyof DashboardTranslations}`;

/**
 * Interpolation values for dynamic translations
 */
export type InterpolationValues = Record<string, string | number>;
