/**
 * Ukrainian translations
 */

import type { Translations } from '../types';

export const uk: Translations = {
  common: {
    // Actions
    save: 'Зберегти',
    cancel: 'Скасувати',
    delete: 'Видалити',
    edit: 'Редагувати',
    create: 'Створити',
    search: 'Пошук',
    filter: 'Фільтр',
    reset: 'Скинути',
    submit: 'Надіслати',
    confirm: 'Підтвердити',
    close: 'Закрити',
    back: 'Назад',
    next: 'Далі',
    previous: 'Попередній',
    loading: 'Завантаження...',
    retry: 'Повторити',
    refresh: 'Оновити',
    download: 'Завантажити',
    upload: 'Вивантажити',
    copy: 'Копіювати',
    share: 'Поділитися',

    // Status
    success: 'Успіх',
    error: 'Помилка',
    warning: 'Попередження',
    info: 'Інформація',
    pending: 'Очікування',
    processing: 'Обробка',
    completed: 'Завершено',
    failed: 'Невдача',

    // Common labels
    yes: 'Так',
    no: 'Ні',
    all: 'Усі',
    none: 'Жоден',
    select: 'Вибрати',
    selectAll: 'Вибрати все',
    clear: 'Очистити',
    clearAll: 'Очистити все',
    showMore: 'Показати більше',
    showLess: 'Показати менше',
    viewDetails: 'Переглянути деталі',
    learnMore: 'Дізнатися більше',

    // Time-related
    today: 'Сьогодні',
    yesterday: 'Вчора',
    tomorrow: 'Завтра',
    now: 'Зараз',
    lastUpdated: 'Останнє оновлення',
    createdAt: 'Створено',
    modifiedAt: 'Змінено',
  },

  navigation: {
    // Main navigation
    home: 'Головна',
    dashboard: 'Панель керування',
    search: 'Пошук',
    chat: 'Чат',
    aiAssistant: 'AI Асистент',
    documents: 'Документи',
    collections: 'Колекції',
    researchCollections: 'Дослідницькі колекції',

    // Analysis section
    analysis: 'Аналіз',
    documentRelationships: "Зв'язки документів",

    // Advanced tools
    advancedTools: 'Розширені інструменти',
    extract: 'Витяг',
    extractStructureData: 'Витяг та структурування даних',
    dataSchemas: 'Схеми даних',
    aiSchemaBuilder: 'AI конструктор схем',
    extractions: 'Витяги',

    // Resources
    resources: 'Ресурси',
    publications: 'Публікації',
    researchBlog: 'Дослідницький блог',
    useCases: 'Приклади використання',
    settings: 'Налаштування',

    // Support
    support: 'Підтримка',
    helpCenter: 'Центр допомоги',
    contact: 'Контакт',

    // Chat specific
    recentChats: 'Останні розмови',
    newChat: 'Нова розмова',
    quickSearch: 'Швидкий пошук',

    // Public navigation
    navigation: 'Навігація',
    about: 'Про нас',
    privacy: 'Конфіденційність',
    termsOfService: 'Умови використання',
    features: 'Функції',
    account: 'Обліковий запис',
    signIn: 'Увійти',
    signUp: 'Зареєструватися',
    signOut: 'Вийти',

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
    thinking: 'Думаю...',
    analyzingQuestion: 'Аналізую ваше запитання...',
    searchingDocuments: 'Шукаю юридичні документи...',
    formulatingResponse: 'Формулюю відповідь...',
    understandingQuestion: 'Розумію ваше запитання...',
    retrievingDocuments: 'Отримую відповідні документи...',
    analyzingPrecedents: 'Аналізую юридичні прецеденти...',
    preparingAnswer: 'Готую комплексну відповідь...',

    // Context-specific messages
    readingContractClauses: 'Читаю пункти договору...',
    searchingContractLaw: 'Шукаю в базі договірного права...',
    analyzingProvisions: 'Аналізую положення...',
    draftingInterpretation: 'Створюю інтерпретацію...',
    understandingLegalIssue: 'Розумію правову проблему...',
    searchingCaseLaw: 'Шукаю судову практику...',
    analyzingPrecedentsCase: 'Аналізую прецеденти...',
    synthesizingFindings: 'Узагальнюю висновки...',
    identifyingRegulations: 'Визначаю нормативні акти...',
    crossReferencingRequirements: 'Порівнюю вимоги...',
    evaluatingCompliance: 'Оцінюю відповідність...',
    preparingGuidance: 'Готую рекомендації...',
    consultingKnowledgeBase: 'Консультую базу юридичних знань...',
    formulatingAnalysis: 'Формулюю правовий аналіз...',
    craftingResponse: 'Створюю відповідь...',

    // Chat UI
    askQuestion: 'Задати питання',
    typeMessage: 'Введіть повідомлення...',
    sendMessage: 'Надіслати повідомлення',
    clearConversation: 'Очистити розмову',
    exportChat: 'Експортувати чат',
    regenerateResponse: 'Згенерувати знову',
    stopGenerating: 'Зупинити генерацію',

    // Error states
    errorGenerating: 'Помилка генерації відповіді',
    errorNetwork: "Помилка мережі. Перевірте з'єднання.",
    errorTimeout: 'Перевищено час очікування. Спробуйте ще раз.',
    tryAgain: 'Спробувати ще раз',
  },

  search: {
    // Search UI
    searchPlaceholder: 'Шукати документи...',
    searchDocuments: 'Шукати документи',
    searchResults: 'Результати пошуку',
    noResults: 'Нічого не знайдено',
    noResultsDescription: 'Спробуйте змінити пошуковий запит або фільтри',

    // Filters
    filters: 'Фільтри',
    filterByType: 'Фільтр за типом',
    filterByDate: 'Фільтр за датою',
    filterByLanguage: 'Фільтр за мовою',
    dateRange: 'Діапазон дат',
    from: 'Від',
    to: 'До',

    // Results
    resultsFound: 'Знайдено {{count}} результатів',
    showingResults: 'Показано {{from}}-{{to}} з {{total}}',
    sortBy: 'Сортувати за',
    relevance: 'Релевантність',
    dateNewest: 'Дата (найновіші)',
    dateOldest: 'Дата (найстаріші)',

    // Document types
    allDocuments: 'Усі документи',
    contracts: 'Договори',
    caseLaw: 'Судова практика',
    regulations: 'Нормативні акти',
    taxInterpretations: 'Податкові роз\'яснення',
  },

  documents: {
    // Document details
    document: 'Документ',
    documents: 'Документи',
    documentDetails: 'Деталі документа',
    documentNotFound: 'Документ не знайдено',

    // Metadata
    title: 'Назва',
    type: 'Тип',
    date: 'Дата',
    language: 'Мова',
    source: 'Джерело',
    summary: 'Резюме',
    content: 'Зміст',

    // Actions
    openDocument: 'Відкрити документ',
    downloadDocument: 'Завантажити документ',
    shareDocument: 'Поділитися документом',
    addToCollection: 'Додати до колекції',
    removeFromCollection: 'Видалити з колекції',

    // Collections
    collection: 'Колекція',
    collections: 'Колекції',
    createCollection: 'Створити колекцію',
    deleteCollection: 'Видалити колекцію',
    renameCollection: 'Перейменувати колекцію',
    emptyCollection: 'Ця колекція порожня',
  },

  extraction: {
    // Extraction UI
    extraction: 'Витяг',
    extractions: 'Витяги',
    extractData: 'Витягнути дані',
    selectDocuments: 'Вибрати документи',
    selectSchema: 'Вибрати схему',
    startExtraction: 'Почати витяг',

    // Schema management
    schema: 'Схема',
    schemas: 'Схеми',
    createSchema: 'Створити схему',
    editSchema: 'Редагувати схему',
    deleteSchema: 'Видалити схему',
    schemaName: 'Назва схеми',
    schemaDescription: 'Опис схеми',
    fields: 'Поля',
    addField: 'Додати поле',

    // Status
    extractionInProgress: 'Витяг виконується',
    extractionComplete: 'Витяг завершено',
    extractionFailed: 'Витяг не вдався',

    // Results
    extractedData: 'Витягнуті дані',
    exportToExcel: 'Експортувати в Excel',
    exportToJson: 'Експортувати в JSON',
  },

  auth: {
    // Forms
    email: 'Електронна пошта',
    password: 'Пароль',
    confirmPassword: 'Підтвердити пароль',
    forgotPassword: 'Забули пароль?',
    resetPassword: 'Скинути пароль',
    rememberMe: "Запам'ятати мене",

    // Actions
    login: 'Увійти',
    logout: 'Вийти',
    register: 'Зареєструватися',
    createAccount: 'Створити обліковий запис',

    // Messages
    welcomeBack: 'З поверненням',
    signInToContinue: 'Увійдіть, щоб продовжити',
    noAccount: 'Немає облікового запису?',
    haveAccount: 'Вже маєте обліковий запис?',
    passwordsDoNotMatch: 'Паролі не збігаються',
    invalidCredentials: 'Невірна електронна пошта або пароль',
    accountCreated: 'Обліковий запис створено',
    passwordResetSent: 'Лист для скидання пароля надіслано',

    // Profile
    profile: 'Профіль',
    myAccount: 'Мій обліковий запис',
    accountSettings: 'Налаштування облікового запису',
  },

  errors: {
    // Common errors
    somethingWentWrong: 'Щось пішло не так',
    pageNotFound: 'Сторінку не знайдено',
    unauthorized: 'Не авторизовано',
    forbidden: 'Доступ заборонено',
    serverError: 'Помилка сервера',
    networkError: 'Помилка мережі',
    timeout: 'Час очікування вичерпано',

    // Validation errors
    required: "Це поле є обов'язковим",
    invalidEmail: 'Невірна адреса електронної пошти',
    invalidFormat: 'Невірний формат',
    tooShort: 'Занадто коротко',
    tooLong: 'Занадто довго',

    // Action errors
    failedToLoad: 'Не вдалося завантажити',
    failedToSave: 'Не вдалося зберегти',
    failedToDelete: 'Не вдалося видалити',
    failedToFetch: 'Не вдалося отримати дані',
  },

  legal: {
    // Legal terms - using legally accurate Ukrainian translations
    termsOfService: 'Умови використання',
    privacyPolicy: 'Політика конфіденційності',
    cookiePolicy: 'Політика файлів cookie',
    dataProcessing: 'Договір про обробку даних',
    consent: 'Згода',

    // Document types
    judgment: 'Рішення суду',
    ruling: 'Постанова',
    interpretation: 'Роз\'яснення',
    regulation: 'Положення',
    statute: 'Закон',
    amendment: 'Поправка',

    // Legal concepts
    precedent: 'Прецедент',
    jurisdiction: 'Юрисдикція',
    compliance: 'Відповідність',
    liability: 'Відповідальність',

    // Version control
    lastUpdated: 'Останнє оновлення',
    version: 'Версія',
    effectiveDate: 'Дата набрання чинності',
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
