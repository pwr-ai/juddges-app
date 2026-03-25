/**
 * Arabic translations (RTL)
 */

import type { Translations } from '../types';

export const ar: Translations = {
  common: {
    // Actions
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    create: 'إنشاء',
    search: 'بحث',
    filter: 'تصفية',
    reset: 'إعادة تعيين',
    submit: 'إرسال',
    confirm: 'تأكيد',
    close: 'إغلاق',
    back: 'رجوع',
    next: 'التالي',
    previous: 'السابق',
    loading: 'جارٍ التحميل...',
    retry: 'إعادة المحاولة',
    refresh: 'تحديث',
    download: 'تحميل',
    upload: 'رفع',
    copy: 'نسخ',
    share: 'مشاركة',

    // Status
    success: 'نجاح',
    error: 'خطأ',
    warning: 'تحذير',
    info: 'معلومات',
    pending: 'قيد الانتظار',
    processing: 'جارٍ المعالجة',
    completed: 'مكتمل',
    failed: 'فشل',

    // Common labels
    yes: 'نعم',
    no: 'لا',
    all: 'الكل',
    none: 'لا شيء',
    select: 'اختيار',
    selectAll: 'تحديد الكل',
    clear: 'مسح',
    clearAll: 'مسح الكل',
    showMore: 'عرض المزيد',
    showLess: 'عرض أقل',
    viewDetails: 'عرض التفاصيل',
    learnMore: 'معرفة المزيد',

    // Time-related
    today: 'اليوم',
    yesterday: 'أمس',
    tomorrow: 'غداً',
    now: 'الآن',
    lastUpdated: 'آخر تحديث',
    createdAt: 'تاريخ الإنشاء',
    modifiedAt: 'تاريخ التعديل',
  },

  navigation: {
    // Main navigation
    home: 'الرئيسية',
    dashboard: 'لوحة التحكم',
    search: 'بحث',
    chat: 'محادثة',
    aiAssistant: 'مساعد الذكاء الاصطناعي',
    documents: 'المستندات',
    collections: 'المجموعات',
    researchCollections: 'مجموعات البحث',

    // Analysis section
    analysis: 'تحليل',
    documentRelationships: 'علاقات المستندات',

    // Advanced tools
    advancedTools: 'أدوات متقدمة',
    extract: 'استخراج',
    extractStructureData: 'استخراج وهيكلة البيانات',
    dataSchemas: 'مخططات البيانات',
    aiSchemaBuilder: 'منشئ المخططات بالذكاء الاصطناعي',
    extractions: 'الاستخراجات',

    // Resources
    resources: 'الموارد',
    publications: 'المنشورات',
    researchBlog: 'مدونة البحث',
    useCases: 'حالات الاستخدام',
    settings: 'الإعدادات',

    // Support
    support: 'الدعم',
    helpCenter: 'مركز المساعدة',
    contact: 'اتصل بنا',

    // Chat specific
    recentChats: 'المحادثات الأخيرة',
    newChat: 'محادثة جديدة',
    quickSearch: 'بحث سريع',

    // Public navigation
    navigation: 'التنقل',
    about: 'حول',
    privacy: 'الخصوصية',
    termsOfService: 'شروط الخدمة',
    features: 'الميزات',
    account: 'الحساب',
    signIn: 'تسجيل الدخول',
    signUp: 'إنشاء حساب',
    signOut: 'تسجيل الخروج',

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
    thinking: 'جارٍ التفكير...',
    analyzingQuestion: 'جارٍ تحليل سؤالك...',
    searchingDocuments: 'جارٍ البحث في المستندات القانونية...',
    formulatingResponse: 'جارٍ صياغة الرد...',
    understandingQuestion: 'جارٍ فهم سؤالك...',
    retrievingDocuments: 'جارٍ استرجاع المستندات ذات الصلة...',
    analyzingPrecedents: 'جارٍ تحليل السوابق القانونية...',
    preparingAnswer: 'جارٍ إعداد إجابة شاملة...',

    // Context-specific messages
    readingContractClauses: 'جارٍ قراءة بنود العقد...',
    searchingContractLaw: 'جارٍ البحث في قاعدة بيانات قانون العقود...',
    analyzingProvisions: 'جارٍ تحليل الأحكام...',
    draftingInterpretation: 'جارٍ صياغة التفسير...',
    understandingLegalIssue: 'جارٍ فهم المسألة القانونية...',
    searchingCaseLaw: 'جارٍ البحث في السوابق القضائية...',
    analyzingPrecedentsCase: 'جارٍ تحليل السوابق...',
    synthesizingFindings: 'جارٍ تجميع النتائج...',
    identifyingRegulations: 'جارٍ تحديد اللوائح...',
    crossReferencingRequirements: 'جارٍ مقارنة المتطلبات...',
    evaluatingCompliance: 'جارٍ تقييم الامتثال...',
    preparingGuidance: 'جارٍ إعداد التوجيهات...',
    consultingKnowledgeBase: 'جارٍ استشارة قاعدة المعرفة القانونية...',
    formulatingAnalysis: 'جارٍ صياغة التحليل القانوني...',
    craftingResponse: 'جارٍ صياغة الرد...',

    // Chat UI
    askQuestion: 'اطرح سؤالاً',
    typeMessage: 'اكتب رسالتك...',
    sendMessage: 'إرسال الرسالة',
    clearConversation: 'مسح المحادثة',
    exportChat: 'تصدير المحادثة',
    regenerateResponse: 'إعادة توليد الرد',
    stopGenerating: 'إيقاف التوليد',

    // Error states
    errorGenerating: 'خطأ في توليد الرد',
    errorNetwork: 'خطأ في الشبكة. يرجى التحقق من اتصالك.',
    errorTimeout: 'انتهت مهلة الطلب. يرجى المحاولة مرة أخرى.',
    tryAgain: 'حاول مرة أخرى',
  },

  search: {
    // Search UI
    searchPlaceholder: 'البحث في المستندات...',
    searchDocuments: 'بحث في المستندات',
    searchResults: 'نتائج البحث',
    noResults: 'لا توجد نتائج',
    noResultsDescription: 'حاول تعديل معايير البحث أو الفلاتر',

    // Filters
    filters: 'الفلاتر',
    filterByType: 'تصفية حسب النوع',
    filterByDate: 'تصفية حسب التاريخ',
    filterByLanguage: 'تصفية حسب اللغة',
    dateRange: 'نطاق التاريخ',
    from: 'من',
    to: 'إلى',

    // Results
    resultsFound: 'تم العثور على {{count}} نتيجة',
    showingResults: 'عرض {{from}}-{{to}} من {{total}}',
    sortBy: 'ترتيب حسب',
    relevance: 'الصلة',
    dateNewest: 'التاريخ (الأحدث)',
    dateOldest: 'التاريخ (الأقدم)',

    // Document types
    allDocuments: 'جميع المستندات',
    contracts: 'العقود',
    caseLaw: 'السوابق القضائية',
    regulations: 'اللوائح',
    taxInterpretations: 'التفسيرات الضريبية',
  },

  documents: {
    // Document details
    document: 'مستند',
    documents: 'المستندات',
    documentDetails: 'تفاصيل المستند',
    documentNotFound: 'المستند غير موجود',

    // Metadata
    title: 'العنوان',
    type: 'النوع',
    date: 'التاريخ',
    language: 'اللغة',
    source: 'المصدر',
    summary: 'الملخص',
    content: 'المحتوى',

    // Actions
    openDocument: 'فتح المستند',
    downloadDocument: 'تحميل المستند',
    shareDocument: 'مشاركة المستند',
    addToCollection: 'إضافة إلى المجموعة',
    removeFromCollection: 'إزالة من المجموعة',

    // Collections
    collection: 'مجموعة',
    collections: 'المجموعات',
    createCollection: 'إنشاء مجموعة',
    deleteCollection: 'حذف المجموعة',
    renameCollection: 'إعادة تسمية المجموعة',
    emptyCollection: 'هذه المجموعة فارغة',
  },

  extraction: {
    // Extraction UI
    extraction: 'استخراج',
    extractions: 'الاستخراجات',
    extractData: 'استخراج البيانات',
    selectDocuments: 'اختيار المستندات',
    selectSchema: 'اختيار المخطط',
    startExtraction: 'بدء الاستخراج',

    // Schema management
    schema: 'مخطط',
    schemas: 'المخططات',
    createSchema: 'إنشاء مخطط',
    editSchema: 'تعديل المخطط',
    deleteSchema: 'حذف المخطط',
    schemaName: 'اسم المخطط',
    schemaDescription: 'وصف المخطط',
    fields: 'الحقول',
    addField: 'إضافة حقل',

    // Status
    extractionInProgress: 'الاستخراج قيد التنفيذ',
    extractionComplete: 'اكتمل الاستخراج',
    extractionFailed: 'فشل الاستخراج',

    // Results
    extractedData: 'البيانات المستخرجة',
    exportToExcel: 'تصدير إلى Excel',
    exportToJson: 'تصدير إلى JSON',
  },

  auth: {
    // Forms
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    confirmPassword: 'تأكيد كلمة المرور',
    forgotPassword: 'نسيت كلمة المرور؟',
    resetPassword: 'إعادة تعيين كلمة المرور',
    rememberMe: 'تذكرني',

    // Actions
    login: 'تسجيل الدخول',
    logout: 'تسجيل الخروج',
    register: 'التسجيل',
    createAccount: 'إنشاء حساب',

    // Messages
    welcomeBack: 'مرحباً بعودتك',
    signInToContinue: 'سجل الدخول للمتابعة',
    noAccount: 'ليس لديك حساب؟',
    haveAccount: 'لديك حساب بالفعل؟',
    passwordsDoNotMatch: 'كلمات المرور غير متطابقة',
    invalidCredentials: 'بريد إلكتروني أو كلمة مرور غير صحيحة',
    accountCreated: 'تم إنشاء الحساب بنجاح',
    passwordResetSent: 'تم إرسال بريد إعادة تعيين كلمة المرور',

    // Profile
    profile: 'الملف الشخصي',
    myAccount: 'حسابي',
    accountSettings: 'إعدادات الحساب',
  },

  errors: {
    // Common errors
    somethingWentWrong: 'حدث خطأ ما',
    pageNotFound: 'الصفحة غير موجودة',
    unauthorized: 'غير مصرح',
    forbidden: 'الوصول مرفوض',
    serverError: 'خطأ في الخادم',
    networkError: 'خطأ في الشبكة',
    timeout: 'انتهت مهلة الطلب',

    // Validation errors
    required: 'هذا الحقل مطلوب',
    invalidEmail: 'عنوان بريد إلكتروني غير صالح',
    invalidFormat: 'تنسيق غير صالح',
    tooShort: 'قصير جداً',
    tooLong: 'طويل جداً',

    // Action errors
    failedToLoad: 'فشل في التحميل',
    failedToSave: 'فشل في الحفظ',
    failedToDelete: 'فشل في الحذف',
    failedToFetch: 'فشل في جلب البيانات',
  },

  legal: {
    // Legal terms - using legally accurate Arabic translations
    termsOfService: 'شروط الخدمة',
    privacyPolicy: 'سياسة الخصوصية',
    cookiePolicy: 'سياسة ملفات تعريف الارتباط',
    dataProcessing: 'اتفاقية معالجة البيانات',
    consent: 'الموافقة',

    // Document types
    judgment: 'حكم',
    ruling: 'قرار',
    interpretation: 'تفسير',
    regulation: 'لائحة',
    statute: 'قانون',
    amendment: 'تعديل',

    // Legal concepts
    precedent: 'سابقة',
    jurisdiction: 'اختصاص قضائي',
    compliance: 'امتثال',
    liability: 'مسؤولية',

    // Version control
    lastUpdated: 'آخر تحديث',
    version: 'الإصدار',
    effectiveDate: 'تاريخ السريان',
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
