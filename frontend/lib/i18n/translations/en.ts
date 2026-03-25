/**
 * English translations
 */

import type { Translations } from '../types';

export const en: Translations = {
  common: {
    // Actions
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    search: 'Search',
    filter: 'Filter',
    reset: 'Reset',
    submit: 'Submit',
    confirm: 'Confirm',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    loading: 'Loading...',
    retry: 'Retry',
    refresh: 'Refresh',
    download: 'Download',
    upload: 'Upload',
    copy: 'Copy',
    share: 'Share',

    // Status
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Info',
    pending: 'Pending',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',

    // Common labels
    yes: 'Yes',
    no: 'No',
    all: 'All',
    none: 'None',
    select: 'Select',
    selectAll: 'Select all',
    clear: 'Clear',
    clearAll: 'Clear all',
    showMore: 'Show more',
    showLess: 'Show less',
    viewDetails: 'View details',
    learnMore: 'Learn more',

    // Time-related
    today: 'Today',
    yesterday: 'Yesterday',
    tomorrow: 'Tomorrow',
    now: 'Now',
    lastUpdated: 'Last updated',
    createdAt: 'Created',
    modifiedAt: 'Modified',
  },

  navigation: {
    // Main navigation
    home: 'Home',
    dashboard: 'Dashboard',
    search: 'Search',
    chat: 'Chat',
    aiAssistant: 'AI Assistant',
    documents: 'Documents',
    collections: 'Collections',
    researchCollections: 'Research Collections',

    // Analysis section
    analysis: 'Analysis',
    documentRelationships: 'Document Relationships',

    // Advanced tools
    advancedTools: 'Advanced Tools',
    extract: 'Extract',
    extractStructureData: 'Extract & Structure Data',
    dataSchemas: 'Data Schemas',
    aiSchemaBuilder: 'AI Schema Builder',
    extractions: 'Extractions',

    // Resources
    resources: 'Resources',
    publications: 'Publications',
    researchBlog: 'Research Blog',
    useCases: 'Use Cases',
    settings: 'Settings',

    // Support
    support: 'Support',
    helpCenter: 'Help Center',
    contact: 'Contact',

    // Chat specific
    recentChats: 'Recent Chats',
    newChat: 'New Chat',
    quickSearch: 'Quick search',

    // Public navigation
    navigation: 'Navigation',
    about: 'About',
    privacy: 'Privacy',
    termsOfService: 'Terms of Service',
    features: 'Features',
    account: 'Account',
    signIn: 'Sign In',
    signUp: 'Sign Up',
    signOut: 'Sign Out',

    // Legal domain navigation
    searchJudgments: 'Search Judgments',
    savedSearches: 'Saved Searches',
    dataExtraction: 'Data Extraction',
    extractionResults: 'Extraction Results',
    baseTemplate: 'Base Template',
    compareDatasets: 'Compare Datasets',
  },

  chat: {
    // Loading states
    thinking: 'Thinking...',
    analyzingQuestion: 'Analyzing your question...',
    searchingDocuments: 'Searching legal documents...',
    formulatingResponse: 'Formulating response...',
    understandingQuestion: 'Understanding your question...',
    retrievingDocuments: 'Retrieving relevant documents...',
    analyzingPrecedents: 'Analyzing legal precedents...',
    preparingAnswer: 'Preparing comprehensive answer...',

    // Context-specific messages
    readingContractClauses: 'Reading contract clauses...',
    searchingContractLaw: 'Searching contract law database...',
    analyzingProvisions: 'Analyzing provisions...',
    draftingInterpretation: 'Drafting interpretation...',
    understandingLegalIssue: 'Understanding legal issue...',
    searchingCaseLaw: 'Searching case law...',
    analyzingPrecedentsCase: 'Analyzing precedents...',
    synthesizingFindings: 'Synthesizing findings...',
    identifyingRegulations: 'Identifying regulations...',
    crossReferencingRequirements: 'Cross-referencing requirements...',
    evaluatingCompliance: 'Evaluating compliance...',
    preparingGuidance: 'Preparing guidance...',
    consultingKnowledgeBase: 'Consulting legal knowledge base...',
    formulatingAnalysis: 'Formulating legal analysis...',
    craftingResponse: 'Crafting response...',

    // Chat UI
    askQuestion: 'Ask a question',
    typeMessage: 'Type your message...',
    sendMessage: 'Send message',
    clearConversation: 'Clear conversation',
    exportChat: 'Export chat',
    regenerateResponse: 'Regenerate response',
    stopGenerating: 'Stop generating',

    // Error states
    errorGenerating: 'Error generating response',
    errorNetwork: 'Network error. Please check your connection.',
    errorTimeout: 'Request timed out. Please try again.',
    tryAgain: 'Try again',
  },

  search: {
    // Search UI
    searchPlaceholder: 'Search documents...',
    searchDocuments: 'Search documents',
    searchResults: 'Search results',
    noResults: 'No results found',
    noResultsDescription: 'Try adjusting your search terms or filters',

    // Filters
    filters: 'Filters',
    filterByType: 'Filter by type',
    filterByDate: 'Filter by date',
    filterByLanguage: 'Filter by language',
    dateRange: 'Date range',
    from: 'From',
    to: 'To',

    // Results
    resultsFound: '{{count}} results found',
    showingResults: 'Showing {{from}}-{{to}} of {{total}}',
    sortBy: 'Sort by',
    relevance: 'Relevance',
    dateNewest: 'Date (newest)',
    dateOldest: 'Date (oldest)',

    // Document types
    allDocuments: 'All documents',
    contracts: 'Contracts',
    caseLaw: 'Case law',
    regulations: 'Regulations',
    taxInterpretations: 'Tax interpretations',
  },

  documents: {
    // Document details
    document: 'Document',
    documents: 'Documents',
    documentDetails: 'Document details',
    documentNotFound: 'Document not found',

    // Metadata
    title: 'Title',
    type: 'Type',
    date: 'Date',
    language: 'Language',
    source: 'Source',
    summary: 'Summary',
    content: 'Content',

    // Actions
    openDocument: 'Open document',
    downloadDocument: 'Download document',
    shareDocument: 'Share document',
    addToCollection: 'Add to collection',
    removeFromCollection: 'Remove from collection',

    // Collections
    collection: 'Collection',
    collections: 'Collections',
    createCollection: 'Create collection',
    deleteCollection: 'Delete collection',
    renameCollection: 'Rename collection',
    emptyCollection: 'This collection is empty',
  },

  extraction: {
    // Extraction UI
    extraction: 'Extraction',
    extractions: 'Extractions',
    extractData: 'Extract data',
    selectDocuments: 'Select documents',
    selectSchema: 'Select schema',
    startExtraction: 'Start extraction',

    // Schema management
    schema: 'Schema',
    schemas: 'Schemas',
    createSchema: 'Create schema',
    editSchema: 'Edit schema',
    deleteSchema: 'Delete schema',
    schemaName: 'Schema name',
    schemaDescription: 'Schema description',
    fields: 'Fields',
    addField: 'Add field',

    // Status
    extractionInProgress: 'Extraction in progress',
    extractionComplete: 'Extraction complete',
    extractionFailed: 'Extraction failed',

    // Results
    extractedData: 'Extracted data',
    exportToExcel: 'Export to Excel',
    exportToJson: 'Export to JSON',
  },

  auth: {
    // Forms
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm password',
    forgotPassword: 'Forgot password?',
    resetPassword: 'Reset password',
    rememberMe: 'Remember me',

    // Actions
    login: 'Log in',
    logout: 'Log out',
    register: 'Register',
    createAccount: 'Create account',

    // Messages
    welcomeBack: 'Welcome back',
    signInToContinue: 'Sign in to continue',
    noAccount: "Don't have an account? ",
    haveAccount: 'Already have an account?',
    passwordsDoNotMatch: 'Passwords do not match',
    invalidCredentials: 'Invalid email or password',
    accountCreated: 'Account created successfully',
    passwordResetSent: 'Password reset email sent',

    // Profile
    profile: 'Profile',
    myAccount: 'My account',
    accountSettings: 'Account settings',
  },

  errors: {
    // Common errors
    somethingWentWrong: 'Something went wrong',
    pageNotFound: 'Page not found',
    unauthorized: 'Unauthorized',
    forbidden: 'Access denied',
    serverError: 'Server error',
    networkError: 'Network error',
    timeout: 'Request timed out',

    // Validation errors
    required: 'This field is required',
    invalidEmail: 'Invalid email address',
    invalidFormat: 'Invalid format',
    tooShort: 'Too short',
    tooLong: 'Too long',

    // Action errors
    failedToLoad: 'Failed to load',
    failedToSave: 'Failed to save',
    failedToDelete: 'Failed to delete',
    failedToFetch: 'Failed to fetch data',
  },

  legal: {
    // Legal terms
    termsOfService: 'Terms of Service',
    privacyPolicy: 'Privacy Policy',
    cookiePolicy: 'Cookie Policy',
    dataProcessing: 'Data Processing Agreement',
    consent: 'Consent',

    // Document types
    judgment: 'Judgment',
    ruling: 'Ruling',
    interpretation: 'Interpretation',
    regulation: 'Regulation',
    statute: 'Statute',
    amendment: 'Amendment',

    // Legal concepts
    precedent: 'Precedent',
    jurisdiction: 'Jurisdiction',
    compliance: 'Compliance',
    liability: 'Liability',

    // Version control
    lastUpdated: 'Last updated',
    version: 'Version',
    effectiveDate: 'Effective date',
  },

  dashboard: {
    title: 'Dashboard',
    databaseOverview: 'Database Overview',
    recentConversations: 'Recent Conversations',
    extractionTemplates: 'Extraction Templates',
    recentJudgments: 'Recent Judgments',
    popularLegalTopics: 'Popular Legal Topics',
    researchCollections: 'Research Collections',
    recentExtractions: 'Recent Extractions',
    viewAll: 'View all',
    startChat: 'Start Chat',
    generateTemplate: 'Generate Template',
    browseJudgments: 'Browse Judgments',
    startExtraction: 'Start Extraction',
    noChats: 'No conversations yet. Ask Juddges a legal question to get started.',
    noSchemas: 'No templates yet. Let Juddges generate your first extraction template.',
    noDocuments: 'No judgments found yet. Browse the database to discover court decisions.',
    noExtractions: 'No extractions yet. Use Juddges to extract structured data from judgments.',
    noTrending: 'No trending topics available',
    failedToLoadStats: 'Failed to load statistics',
    dataCompleteness: 'Data Completeness',
    legalInsights: 'Legal Insights',
    complexityAnalysis: 'Complexity Analysis',
  },
};
