/**
 * Hebrew translations (RTL)
 */

import type { Translations } from '../types';

export const he: Translations = {
  common: {
    // Actions
    save: 'שמור',
    cancel: 'בטל',
    delete: 'מחק',
    edit: 'ערוך',
    create: 'צור',
    search: 'חיפוש',
    filter: 'סנן',
    reset: 'איפוס',
    submit: 'שלח',
    confirm: 'אשר',
    close: 'סגור',
    back: 'חזור',
    next: 'הבא',
    previous: 'הקודם',
    loading: 'טוען...',
    retry: 'נסה שוב',
    refresh: 'רענן',
    download: 'הורד',
    upload: 'העלה',
    copy: 'העתק',
    share: 'שתף',

    // Status
    success: 'הצלחה',
    error: 'שגיאה',
    warning: 'אזהרה',
    info: 'מידע',
    pending: 'ממתין',
    processing: 'מעבד',
    completed: 'הושלם',
    failed: 'נכשל',

    // Common labels
    yes: 'כן',
    no: 'לא',
    all: 'הכל',
    none: 'ללא',
    select: 'בחר',
    selectAll: 'בחר הכל',
    clear: 'נקה',
    clearAll: 'נקה הכל',
    showMore: 'הצג עוד',
    showLess: 'הצג פחות',
    viewDetails: 'צפה בפרטים',
    learnMore: 'למד עוד',

    // Time-related
    today: 'היום',
    yesterday: 'אתמול',
    tomorrow: 'מחר',
    now: 'עכשיו',
    lastUpdated: 'עודכן לאחרונה',
    createdAt: 'נוצר',
    modifiedAt: 'שונה',
  },

  navigation: {
    // Main navigation
    home: 'דף הבית',
    dashboard: 'לוח בקרה',
    search: 'חיפוש',
    chat: "צ'אט",
    aiAssistant: 'עוזר AI',
    documents: 'מסמכים',
    collections: 'אוספים',
    researchCollections: 'אוספי מחקר',

    // Analysis section
    analysis: 'ניתוח',
    documentRelationships: 'קשרי מסמכים',

    // Advanced tools
    advancedTools: 'כלים מתקדמים',
    extract: 'חילוץ',
    extractStructureData: 'חילוץ ומבנה נתונים',
    dataSchemas: 'סכימות נתונים',
    aiSchemaBuilder: 'בונה סכימות AI',
    extractions: 'חילוצים',

    // Resources
    resources: 'משאבים',
    publications: 'פרסומים',
    researchBlog: 'בלוג מחקר',
    useCases: 'מקרי שימוש',
    settings: 'הגדרות',

    // Support
    support: 'תמיכה',
    helpCenter: 'מרכז עזרה',
    contact: 'יצירת קשר',

    // Chat specific
    recentChats: "צ'אטים אחרונים",
    newChat: "צ'אט חדש",
    quickSearch: 'חיפוש מהיר',

    // Public navigation
    navigation: 'ניווט',
    about: 'אודות',
    privacy: 'פרטיות',
    termsOfService: 'תנאי שימוש',
    features: 'תכונות',
    account: 'חשבון',
    signIn: 'התחבר',
    signUp: 'הרשם',
    signOut: 'התנתק',

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
    thinking: 'חושב...',
    analyzingQuestion: 'מנתח את השאלה שלך...',
    searchingDocuments: 'מחפש מסמכים משפטיים...',
    formulatingResponse: 'מנסח תשובה...',
    understandingQuestion: 'מבין את השאלה שלך...',
    retrievingDocuments: 'מאחזר מסמכים רלוונטיים...',
    analyzingPrecedents: 'מנתח תקדימים משפטיים...',
    preparingAnswer: 'מכין תשובה מקיפה...',

    // Context-specific messages
    readingContractClauses: 'קורא סעיפי חוזה...',
    searchingContractLaw: 'מחפש במאגר דיני חוזים...',
    analyzingProvisions: 'מנתח הוראות...',
    draftingInterpretation: 'מנסח פרשנות...',
    understandingLegalIssue: 'מבין את הסוגיה המשפטית...',
    searchingCaseLaw: 'מחפש פסיקה...',
    analyzingPrecedentsCase: 'מנתח תקדימים...',
    synthesizingFindings: 'מסכם ממצאים...',
    identifyingRegulations: 'מזהה תקנות...',
    crossReferencingRequirements: 'מצליב דרישות...',
    evaluatingCompliance: 'מעריך עמידה...',
    preparingGuidance: 'מכין הנחיות...',
    consultingKnowledgeBase: 'מתייעץ עם מאגר הידע המשפטי...',
    formulatingAnalysis: 'מנסח ניתוח משפטי...',
    craftingResponse: 'יוצר תשובה...',

    // Chat UI
    askQuestion: 'שאל שאלה',
    typeMessage: 'הקלד הודעה...',
    sendMessage: 'שלח הודעה',
    clearConversation: 'נקה שיחה',
    exportChat: "ייצא צ'אט",
    regenerateResponse: 'צור תשובה מחדש',
    stopGenerating: 'עצור יצירה',

    // Error states
    errorGenerating: 'שגיאה ביצירת תשובה',
    errorNetwork: 'שגיאת רשת. בדוק את החיבור שלך.',
    errorTimeout: 'הזמן הקצוב פג. נסה שוב.',
    tryAgain: 'נסה שוב',
  },

  search: {
    // Search UI
    searchPlaceholder: 'חפש מסמכים...',
    searchDocuments: 'חפש מסמכים',
    searchResults: 'תוצאות חיפוש',
    noResults: 'לא נמצאו תוצאות',
    noResultsDescription: 'נסה לשנות את מונחי החיפוש או המסננים',

    // Filters
    filters: 'מסננים',
    filterByType: 'סנן לפי סוג',
    filterByDate: 'סנן לפי תאריך',
    filterByLanguage: 'סנן לפי שפה',
    dateRange: 'טווח תאריכים',
    from: 'מ',
    to: 'עד',

    // Results
    resultsFound: 'נמצאו {{count}} תוצאות',
    showingResults: 'מציג {{from}}-{{to}} מתוך {{total}}',
    sortBy: 'מיין לפי',
    relevance: 'רלוונטיות',
    dateNewest: 'תאריך (החדש ביותר)',
    dateOldest: 'תאריך (הישן ביותר)',

    // Document types
    allDocuments: 'כל המסמכים',
    contracts: 'חוזים',
    caseLaw: 'פסיקה',
    regulations: 'תקנות',
    taxInterpretations: 'פרשנויות מס',
  },

  documents: {
    // Document details
    document: 'מסמך',
    documents: 'מסמכים',
    documentDetails: 'פרטי מסמך',
    documentNotFound: 'המסמך לא נמצא',

    // Metadata
    title: 'כותרת',
    type: 'סוג',
    date: 'תאריך',
    language: 'שפה',
    source: 'מקור',
    summary: 'תקציר',
    content: 'תוכן',

    // Actions
    openDocument: 'פתח מסמך',
    downloadDocument: 'הורד מסמך',
    shareDocument: 'שתף מסמך',
    addToCollection: 'הוסף לאוסף',
    removeFromCollection: 'הסר מאוסף',

    // Collections
    collection: 'אוסף',
    collections: 'אוספים',
    createCollection: 'צור אוסף',
    deleteCollection: 'מחק אוסף',
    renameCollection: 'שנה שם אוסף',
    emptyCollection: 'האוסף הזה ריק',
  },

  extraction: {
    // Extraction UI
    extraction: 'חילוץ',
    extractions: 'חילוצים',
    extractData: 'חלץ נתונים',
    selectDocuments: 'בחר מסמכים',
    selectSchema: 'בחר סכימה',
    startExtraction: 'התחל חילוץ',

    // Schema management
    schema: 'סכימה',
    schemas: 'סכימות',
    createSchema: 'צור סכימה',
    editSchema: 'ערוך סכימה',
    deleteSchema: 'מחק סכימה',
    schemaName: 'שם סכימה',
    schemaDescription: 'תיאור סכימה',
    fields: 'שדות',
    addField: 'הוסף שדה',

    // Status
    extractionInProgress: 'חילוץ בתהליך',
    extractionComplete: 'החילוץ הושלם',
    extractionFailed: 'החילוץ נכשל',

    // Results
    extractedData: 'נתונים מחולצים',
    exportToExcel: 'ייצא ל-Excel',
    exportToJson: 'ייצא ל-JSON',
  },

  auth: {
    // Forms
    email: 'אימייל',
    password: 'סיסמה',
    confirmPassword: 'אשר סיסמה',
    forgotPassword: 'שכחת סיסמה?',
    resetPassword: 'איפוס סיסמה',
    rememberMe: 'זכור אותי',

    // Actions
    login: 'התחבר',
    logout: 'התנתק',
    register: 'הרשם',
    createAccount: 'צור חשבון',

    // Messages
    welcomeBack: 'ברוך שובך',
    signInToContinue: 'התחבר כדי להמשיך',
    noAccount: 'אין לך חשבון?',
    haveAccount: 'כבר יש לך חשבון?',
    passwordsDoNotMatch: 'הסיסמאות אינן תואמות',
    invalidCredentials: 'אימייל או סיסמה שגויים',
    accountCreated: 'החשבון נוצר בהצלחה',
    passwordResetSent: 'נשלח אימייל לאיפוס סיסמה',

    // Profile
    profile: 'פרופיל',
    myAccount: 'החשבון שלי',
    accountSettings: 'הגדרות חשבון',
  },

  errors: {
    // Common errors
    somethingWentWrong: 'משהו השתבש',
    pageNotFound: 'הדף לא נמצא',
    unauthorized: 'לא מורשה',
    forbidden: 'הגישה נדחתה',
    serverError: 'שגיאת שרת',
    networkError: 'שגיאת רשת',
    timeout: 'הזמן הקצוב פג',

    // Validation errors
    required: 'שדה זה הוא חובה',
    invalidEmail: 'כתובת אימייל לא חוקית',
    invalidFormat: 'פורמט לא חוקי',
    tooShort: 'קצר מדי',
    tooLong: 'ארוך מדי',

    // Action errors
    failedToLoad: 'הטעינה נכשלה',
    failedToSave: 'השמירה נכשלה',
    failedToDelete: 'המחיקה נכשלה',
    failedToFetch: 'שליפת הנתונים נכשלה',
  },

  legal: {
    // Legal terms - using legally accurate Hebrew translations
    termsOfService: 'תנאי שימוש',
    privacyPolicy: 'מדיניות פרטיות',
    cookiePolicy: 'מדיניות עוגיות',
    dataProcessing: 'הסכם עיבוד נתונים',
    consent: 'הסכמה',

    // Document types
    judgment: 'פסק דין',
    ruling: 'החלטה',
    interpretation: 'פרשנות',
    regulation: 'תקנה',
    statute: 'חוק',
    amendment: 'תיקון',

    // Legal concepts
    precedent: 'תקדים',
    jurisdiction: 'סמכות שיפוט',
    compliance: 'עמידה',
    liability: 'אחריות',

    // Version control
    lastUpdated: 'עודכן לאחרונה',
    version: 'גרסה',
    effectiveDate: 'תאריך תחולה',
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
