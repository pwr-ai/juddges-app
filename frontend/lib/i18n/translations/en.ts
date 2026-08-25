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
    searchExtractedData: 'Search Extracted Data',
    topicTrends: 'Topic Trends',
    topicModeling: 'Topic Modeling',
    savedSearches: 'Saved Searches',
    dataExtraction: 'Data Extraction',
    extractionResults: 'Extraction Results',
    baseTemplate: 'Base Coding Schema',
    compareDatasets: 'Compare Datasets',
    precedentSearch: 'Precedent Search',
    argumentationAnalysis: 'Argumentation Analysis',
    judgeFingerprint: 'Judge Fingerprint',

    // Administration (admin-only surfaces)
    administration: 'Administration',
    adminPanel: 'Admin Panel',

    // Accessible names
    homeLinkLabel: 'JuDDGES — go to the home page',

    // Workflow phase labels
    phasePlan: '1. Plan',
    phaseSearch: '2. Search',
    phaseAnalyze: '3. Analyze',
    phaseExport: '4. Export',
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
    recentJudgments: 'Recent Judgments',
    popularLegalTopics: 'Popular Legal Topics',
    researchCollections: 'Research Collections',
    viewAll: 'View all',
    noTrending: 'No trending topics available',
    failedToLoadStats: 'Failed to load statistics',
  },

  judgeFingerprint: {
    pageTitle: 'Judge reasoning profile',
    pageSubtitle: 'Analyze and compare judges’ legal reasoning styles based on their judgments',
    searchLabel: 'Search for a judge',
    searchPlaceholder: 'Search for a judge by surname...',
    searchMaxReached: 'Up to {{max}} judges',
    searchHint: 'Search for up to {{max}} judges to view their reasoning profile. Select 2–3 to compare.',
    searching: 'Searching...',
    noResults: 'No judges found matching “{{query}}”',
    caseCount: '{{count}} cases',
    removeJudge: 'Remove {{name}}',
    dominantStyle: 'Dominant style',
    statCases: 'Cases',
    statAnalyzed: 'Analyzed',
    periodTo: 'to',
    sampleCases: 'Sample cases',
    loadingProfile: 'Loading judge profile...',
    loadingSubtitle: 'Analyzing reasoning style from judgments',
    errorLoadingTitle: 'Failed to load profile',
    errorToastTitle: 'Could not load judge profile',
    comparisonHeading: 'Judge comparison',
    comparisonDescription: 'Overlaid radar chart highlights differences in reasoning styles',
    profilesHeading: 'Judge profiles',
    emptyTitle: 'Judge reasoning profile',
    emptyDescription: 'Search for a judge to view their legal reasoning style. Select 2–3 judges to compare their approaches.',
    howItWorks: 'How it works',
    reasoningTextual: 'Textual',
    reasoningTextualDescription: 'Strict interpretation of statutory text; literal analysis of provisions.',
    reasoningDeductive: 'Deductive',
    reasoningDeductiveDescription: 'Applying general legal principles to specific factual scenarios.',
    reasoningAnalogical: 'Analogical',
    reasoningAnalogicalDescription: 'Comparing with similar cases and prior judgments.',
    reasoningPurposive: 'Purposive',
    reasoningPurposiveDescription: 'Interpretation grounded in legal-policy aims or legislative intent.',
    reasoningTeleological: 'Teleological',
    reasoningTeleologicalDescription: 'Purpose-driven interpretation referring to the goal and function of a provision.',
  },

  reasoningLines: {
    // Page header
    pageTitle: 'Reasoning lines',
    pageSubtitle: 'Discover clusters of judgments that answer the same legal question',

    // Tabs
    tabDiscover: 'Discover',
    tabSaved: 'Saved lines',
    tabDag: 'DAG graph',

    // Discovery controls
    paramsHeading: 'Discovery parameters',
    paramSampleSize: 'Sample size',
    paramNumClusters: 'Number of clusters',
    paramLegalDomain: 'Legal domain (optional)',
    paramLegalDomainPlaceholder: 'e.g. tax law, employment law...',
    discoverButton: 'Discover lines',
    discoverButtonPending: 'Discovering...',

    // Discovery states
    discoverLoadingTitle: 'Discovering reasoning lines...',
    discoverLoadingSubtitle: 'Clustering judgments by semantic similarity — larger samples take longer',
    discoverErrorTitle: 'Discovery could not be completed',
    discoverErrorMessage: 'The clustering service did not return a result, so no lines were discovered. Nothing was saved. Try again, or lower the sample size and the number of clusters to make the request lighter.',
    discoverEmptyTitle: 'No discovery run yet',
    discoverEmptyDescription: 'Nothing has been clustered so far. Set the sample size, the number of clusters and — optionally — a legal domain above, then select “Discover lines” to group judgments that address the same legal question.',
    discoveredHeading: 'Discovered reasoning lines ({{count}})',

    // Discovery statistics
    statDocuments: 'Documents',
    statClusters: 'Clusters',
    statCoherence: 'Coherence',
    statTime: 'Time',

    // How discovery works
    howItWorks: 'How it works',
    howSemanticTitle: 'Semantic clustering',
    howSemanticDescription: 'Judgments are grouped by the meaning of their content and reasoning, not by keyword overlap.',
    howSharedBasesTitle: 'Shared legal bases',
    howSharedBasesDescription: 'Clusters are held together by common references to the same provisions and legal acts.',
    howCoherenceTitle: 'Coherence analysis',
    howCoherenceDescription: 'Every cluster gets a coherence score — the higher it is, the more uniform the reasoning line.',
    howKeywordsTitle: 'Keywords',
    howKeywordsDescription: 'The most characteristic terms of each cluster are extracted automatically.',

    // Cluster / line cards
    clusterCaseCount: 'Cases: {{count}}',
    coherenceLabel: 'Coherence',
    coherenceValue: 'Coherence: {{percent}}%',
    legalBasesLabel: 'Legal bases',
    showCases: 'Show cases ({{count}})',
    hideCases: 'Hide cases',
    saveCluster: 'Save as line',
    saveClusterPending: 'Saving...',
    saveClusterDone: 'Saved',
    caseCount: '{{count}} cases',
    similarityMatch: '{{percent}}% match',

    // Status labels
    statusActive: 'Active',
    statusArchived: 'Archived',
    statusDeleted: 'Deleted',

    // Saved lines tab
    searchPlaceholder: 'Search reasoning lines...',
    searchAriaLabel: 'Search reasoning lines',
    searchErrorTitle: 'Search is unavailable',
    searchErrorMessage: 'The reasoning-line search service could not be reached, so no results could be loaded. Try again in a moment, or clear the search box to browse every saved line.',
    searchEmptyTitle: 'No reasoning lines match your search',
    searchEmptyDescription: 'Nothing in the saved catalogue matches “{{query}}”. Search covers labels, legal questions and keywords — try broader wording, or clear the box to browse every saved line.',
    searchResultsHeading: 'Search results ({{count}})',
    savedLoading: 'Loading saved reasoning lines...',
    savedErrorTitle: 'Saved lines could not be loaded',
    savedErrorMessage: 'The saved reasoning lines could not be fetched from the server. Nothing was lost — try again, or reload the page if the problem persists.',
    savedEmptyTitle: 'No saved reasoning lines yet',
    savedEmptyDescription: 'Nothing has been added to the catalogue so far. Open the Discover tab, run a discovery over the case corpus, and save the clusters worth tracking — they will show up here.',
    savedHeading: 'Saved reasoning lines ({{count}})',

    // Automated pipeline card
    pipelineHeading: 'Automated pipeline',
    pipelineWeekly: 'Weekly',
    pipelineAssignTitle: 'Auto-assignment',
    pipelineAssignDescription: 'New judgments are assigned to existing reasoning lines automatically',
    pipelineDiscoverTitle: 'Auto-discovery',
    pipelineDiscoverDescription: 'Unassigned judgments are grouped into new reasoning lines',
    pipelineEventsTitle: 'Event detection',
    pipelineEventsDescription: 'Branches and merges between lines are detected automatically',

    // DAG tab
    dagHeading: 'Reasoning line DAG',
    detectEvents: 'Detect events',
    detectEventsPending: 'Detecting...',
    detectEventsError: 'Event detection failed. Nothing was changed — try again in a moment.',
    eventBranches: 'Branches: {{count}}',
    eventMerges: 'Merges: {{count}}',
    eventInfluences: 'Influences: {{count}}',
    eventLinesAnalyzed: 'Lines analysed: {{count}}',
    eventProcessingTime: 'Time: {{seconds}}s',
    dagLoading: 'Loading the DAG graph...',
    dagErrorTitle: 'Graph could not be loaded',
    dagErrorMessage: 'The reasoning-line graph could not be fetched from the server. Try again; if it keeps failing, the graph may still be rebuilding after the last pipeline run.',
    dagEmptyTitle: 'Nothing to plot yet',
    dagEmptyDescriptionAdmin: 'The graph is empty because no branch, merge or influence events have been recorded. Save at least two reasoning lines, then select “Detect events” to build the graph.',
    dagEmptyDescription: 'The graph is empty because no reasoning lines or relationships between them have been recorded yet. The graph is built by an administrator — check back once lines have been saved and analysed.',
    statNodes: 'Nodes',
    statEdges: 'Edges',
    statBranches: 'Branches',
    statMerges: 'Merges',

    // Detail page — shell states
    backToList: 'Back to reasoning lines',
    detailLoading: 'Loading reasoning line details...',
    detailErrorTitle: 'Reasoning line could not be loaded',
    detailErrorMessage: 'The details of this reasoning line could not be fetched from the server. Try again, or go back to the list and open it once more.',
    detailNotFoundTitle: 'Reasoning line not found',
    detailNotFoundDescription: 'This reasoning line does not exist or has been deleted. Go back to the list to browse the lines that are still available.',
    createdLabel: 'Created: {{date}}',

    // Detail page — delete flow
    deleteLine: 'Delete line',
    deleteConfirmQuestion: 'Delete this reasoning line for everyone?',
    deleteConfirm: 'Yes, delete',
    deletePending: 'Deleting...',
    deleteError: 'The reasoning line could not be deleted. Nothing was removed — try again in a moment.',

    // Detail page — member judgments
    membersHeading: 'Judgments in this line ({{count}})',
    membersEmptyTitle: 'No judgments in this line yet',
    membersEmptyDescription: 'No judgments have been assigned to this reasoning line. The weekly auto-assignment job adds newly ingested judgments that match — check back after the next run.',

    // Detail page — outcome timeline
    outcomeHeading: 'How outcomes evolved over time',
    classify: 'Classify judgments',
    classifyPending: 'Classifying...',
    classifyError: 'Classification failed. No outcomes were changed — try again in a moment.',
    classifyClassified: 'Classified: {{count}}',
    classifySkipped: 'Skipped: {{count}}',
    classifyErrors: 'Errors: {{count}}',
    timelineLoading: 'Loading the outcome timeline...',
    timelineErrorAdmin: 'No timeline available. The outcomes of this line have not been classified yet — select “Classify judgments” above to generate it.',
    timelineError: 'No timeline available. The outcomes of this line have not been classified yet, so there is nothing to plot.',
    timelineEmptyAdmin: 'No judgments have been classified yet. Select “Classify judgments” above to label the outcomes and build the timeline.',
    timelineEmpty: 'No judgments have been classified yet, so the outcome timeline is empty.',
    timelineTotalClassified: 'Classified: {{count}}',
    timelineTotalUnclassified: 'Unclassified: {{count}}',

    // Detail page — language drift
    driftHeading: 'Language drift',
    driftAnalyze: 'Analyse drift',
    driftPending: 'Analysing...',
    driftError: 'Drift analysis failed. Nothing was changed — try again in a moment.',
    driftLoading: 'Analysing language drift...',
    driftIdleAdmin: 'Language drift has not been analysed yet. Select “Analyse drift” to measure how the wording of the judgments in this line changed over time.',
    driftIdle: 'Language drift has not been analysed for this line yet, so there is nothing to display.',

    // Detail page — related lines
    relatedHeading: 'Related reasoning lines',
    relatedLoading: 'Loading related reasoning lines...',
    relatedError: 'Related reasoning lines could not be loaded. Reload the page to try again.',
    relatedEmpty: 'No related reasoning lines found. Relatedness is based on shared legal bases and keywords — links appear as the catalogue grows.',
  },
};
