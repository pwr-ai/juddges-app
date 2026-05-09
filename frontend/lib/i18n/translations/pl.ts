/**
 * Polish translations
 */

import type { Translations } from '../types';

export const pl: Translations = {
  common: {
    // Actions
    save: 'Zapisz',
    cancel: 'Anuluj',
    delete: 'Usuń',
    edit: 'Edytuj',
    create: 'Utwórz',
    search: 'Szukaj',
    filter: 'Filtruj',
    reset: 'Resetuj',
    submit: 'Wyślij',
    confirm: 'Potwierdź',
    close: 'Zamknij',
    back: 'Wstecz',
    next: 'Dalej',
    previous: 'Poprzedni',
    loading: 'Ładowanie...',
    retry: 'Ponów',
    refresh: 'Odśwież',
    download: 'Pobierz',
    upload: 'Prześlij',
    copy: 'Kopiuj',
    share: 'Udostępnij',

    // Status
    success: 'Sukces',
    error: 'Błąd',
    warning: 'Ostrzeżenie',
    info: 'Informacja',
    pending: 'Oczekuje',
    processing: 'Przetwarzanie',
    completed: 'Zakończone',
    failed: 'Niepowodzenie',

    // Common labels
    yes: 'Tak',
    no: 'Nie',
    all: 'Wszystkie',
    none: 'Żadne',
    select: 'Wybierz',
    selectAll: 'Zaznacz wszystkie',
    clear: 'Wyczyść',
    clearAll: 'Wyczyść wszystko',
    showMore: 'Pokaż więcej',
    showLess: 'Pokaż mniej',
    viewDetails: 'Zobacz szczegóły',
    learnMore: 'Dowiedz się więcej',

    // Time-related
    today: 'Dzisiaj',
    yesterday: 'Wczoraj',
    tomorrow: 'Jutro',
    now: 'Teraz',
    lastUpdated: 'Ostatnia aktualizacja',
    createdAt: 'Utworzono',
    modifiedAt: 'Zmodyfikowano',
  },

  navigation: {
    // Main navigation
    home: 'Strona główna',
    dashboard: 'Pulpit',
    search: 'Szukaj',
    chat: 'Czat',
    aiAssistant: 'Asystent AI',
    documents: 'Dokumenty',
    collections: 'Kolekcje',
    researchCollections: 'Kolekcje badawcze',

    // Analysis section
    analysis: 'Analiza',
    documentRelationships: 'Relacje dokumentów',

    // Advanced tools
    advancedTools: 'Narzędzia zaawansowane',
    extract: 'Ekstrakcja',
    extractStructureData: 'Ekstrakcja i strukturyzacja danych',
    dataSchemas: 'Schematy danych',
    aiSchemaBuilder: 'Kreator schematów AI',
    extractions: 'Ekstrakcje',

    // Resources
    resources: 'Zasoby',
    publications: 'Publikacje',
    managePublications: 'Zarządzaj publikacjami',
    researchBlog: 'Blog badawczy',
    useCases: 'Przypadki użycia',
    settings: 'Ustawienia',

    // Support
    support: 'Pomoc',
    helpCenter: 'Centrum pomocy',
    contact: 'Kontakt',

    // Chat specific
    recentChats: 'Ostatnie rozmowy',
    newChat: 'Nowa rozmowa',
    quickSearch: 'Szybkie wyszukiwanie',

    // Public navigation
    navigation: 'Nawigacja',
    about: 'O nas',
    privacy: 'Prywatność',
    termsOfService: 'Regulamin',
    features: 'Funkcje',
    account: 'Konto',
    signIn: 'Zaloguj się',
    signUp: 'Zarejestruj się',
    signOut: 'Wyloguj się',

    // Legal domain navigation
    searchJudgments: 'Szukaj orzeczeń',
    savedSearches: 'Zapisane wyszukiwania',
    dataExtraction: 'Ekstrakcja danych',
    extractionResults: 'Wyniki ekstrakcji',
    baseTemplate: 'Szablon bazowy',
    compareDatasets: 'Porównaj zbiory danych',
  },

  chat: {
    // Loading states
    thinking: 'Myślę...',
    analyzingQuestion: 'Analizuję Twoje pytanie...',
    searchingDocuments: 'Przeszukuję dokumenty prawne...',
    formulatingResponse: 'Formułuję odpowiedź...',
    understandingQuestion: 'Rozumiem Twoje pytanie...',
    retrievingDocuments: 'Pobieram odpowiednie dokumenty...',
    analyzingPrecedents: 'Analizuję precedensy prawne...',
    preparingAnswer: 'Przygotowuję kompleksową odpowiedź...',

    // Context-specific messages
    readingContractClauses: 'Czytam klauzule umowy...',
    searchingContractLaw: 'Przeszukuję bazę prawa umów...',
    analyzingProvisions: 'Analizuję postanowienia...',
    draftingInterpretation: 'Tworzę interpretację...',
    understandingLegalIssue: 'Rozumiem problem prawny...',
    searchingCaseLaw: 'Przeszukuję orzecznictwo...',
    analyzingPrecedentsCase: 'Analizuję precedensy...',
    synthesizingFindings: 'Syntetyzuję wnioski...',
    identifyingRegulations: 'Identyfikuję przepisy...',
    crossReferencingRequirements: 'Porównuję wymagania...',
    evaluatingCompliance: 'Oceniam zgodność...',
    preparingGuidance: 'Przygotowuję wskazówki...',
    consultingKnowledgeBase: 'Konsultuję bazę wiedzy prawnej...',
    formulatingAnalysis: 'Formułuję analizę prawną...',
    craftingResponse: 'Tworzę odpowiedź...',

    // Chat UI
    askQuestion: 'Zadaj pytanie',
    typeMessage: 'Wpisz wiadomość...',
    sendMessage: 'Wyślij wiadomość',
    clearConversation: 'Wyczyść rozmowę',
    exportChat: 'Eksportuj rozmowę',
    regenerateResponse: 'Wygeneruj ponownie',
    stopGenerating: 'Zatrzymaj generowanie',

    // Error states
    errorGenerating: 'Błąd generowania odpowiedzi',
    errorNetwork: 'Błąd sieci. Sprawdź połączenie.',
    errorTimeout: 'Przekroczono limit czasu. Spróbuj ponownie.',
    tryAgain: 'Spróbuj ponownie',
  },

  search: {
    // Search UI
    searchPlaceholder: 'Szukaj dokumentów...',
    searchDocuments: 'Szukaj dokumentów',
    searchResults: 'Wyniki wyszukiwania',
    noResults: 'Brak wyników',
    noResultsDescription: 'Spróbuj zmienić kryteria wyszukiwania lub filtry',

    // Filters
    filters: 'Filtry',
    filterByType: 'Filtruj według typu',
    filterByDate: 'Filtruj według daty',
    filterByLanguage: 'Filtruj według języka',
    dateRange: 'Zakres dat',
    from: 'Od',
    to: 'Do',

    // Results
    resultsFound: 'Znaleziono {{count}} wyników',
    showingResults: 'Pokazuję {{from}}-{{to}} z {{total}}',
    sortBy: 'Sortuj według',
    relevance: 'Trafność',
    dateNewest: 'Data (najnowsze)',
    dateOldest: 'Data (najstarsze)',

    // Document types
    allDocuments: 'Wszystkie dokumenty',
    contracts: 'Umowy',
    caseLaw: 'Orzecznictwo',
    regulations: 'Przepisy',
    taxInterpretations: 'Interpretacje podatkowe',
  },

  documents: {
    // Document details
    document: 'Dokument',
    documents: 'Dokumenty',
    documentDetails: 'Szczegóły dokumentu',
    documentNotFound: 'Nie znaleziono dokumentu',

    // Metadata
    title: 'Tytuł',
    type: 'Typ',
    date: 'Data',
    language: 'Język',
    source: 'Źródło',
    summary: 'Streszczenie',
    content: 'Treść',

    // Actions
    openDocument: 'Otwórz dokument',
    downloadDocument: 'Pobierz dokument',
    shareDocument: 'Udostępnij dokument',
    addToCollection: 'Dodaj do kolekcji',
    removeFromCollection: 'Usuń z kolekcji',

    // Collections
    collection: 'Kolekcja',
    collections: 'Kolekcje',
    createCollection: 'Utwórz kolekcję',
    deleteCollection: 'Usuń kolekcję',
    renameCollection: 'Zmień nazwę kolekcji',
    emptyCollection: 'Ta kolekcja jest pusta',
  },

  extraction: {
    // Extraction UI
    extraction: 'Ekstrakcja',
    extractions: 'Ekstrakcje',
    extractData: 'Wyodrębnij dane',
    selectDocuments: 'Wybierz dokumenty',
    selectSchema: 'Wybierz schemat',
    startExtraction: 'Rozpocznij ekstrakcję',

    // Schema management
    schema: 'Schemat',
    schemas: 'Schematy',
    createSchema: 'Utwórz schemat',
    editSchema: 'Edytuj schemat',
    deleteSchema: 'Usuń schemat',
    schemaName: 'Nazwa schematu',
    schemaDescription: 'Opis schematu',
    fields: 'Pola',
    addField: 'Dodaj pole',

    // Status
    extractionInProgress: 'Ekstrakcja w toku',
    extractionComplete: 'Ekstrakcja zakończona',
    extractionFailed: 'Ekstrakcja nieudana',

    // Results
    extractedData: 'Wyodrębnione dane',
    exportToExcel: 'Eksportuj do Excel',
    exportToJson: 'Eksportuj do JSON',
  },

  auth: {
    // Forms
    email: 'Email',
    password: 'Hasło',
    confirmPassword: 'Potwierdź hasło',
    forgotPassword: 'Zapomniałeś hasła?',
    resetPassword: 'Zresetuj hasło',
    rememberMe: 'Zapamiętaj mnie',

    // Actions
    login: 'Zaloguj się',
    logout: 'Wyloguj się',
    register: 'Zarejestruj się',
    createAccount: 'Utwórz konto',

    // Messages
    welcomeBack: 'Witaj ponownie',
    signInToContinue: 'Zaloguj się, aby kontynuować',
    noAccount: 'Nie masz konta?',
    haveAccount: 'Masz już konto?',
    passwordsDoNotMatch: 'Hasła nie są zgodne',
    invalidCredentials: 'Nieprawidłowy email lub hasło',
    accountCreated: 'Konto zostało utworzone',
    passwordResetSent: 'Email z resetem hasła został wysłany',

    // Profile
    profile: 'Profil',
    myAccount: 'Moje konto',
    accountSettings: 'Ustawienia konta',
  },

  errors: {
    // Common errors
    somethingWentWrong: 'Coś poszło nie tak',
    pageNotFound: 'Nie znaleziono strony',
    unauthorized: 'Brak autoryzacji',
    forbidden: 'Brak dostępu',
    serverError: 'Błąd serwera',
    networkError: 'Błąd sieci',
    timeout: 'Przekroczono limit czasu',

    // Validation errors
    required: 'To pole jest wymagane',
    invalidEmail: 'Nieprawidłowy adres email',
    invalidFormat: 'Nieprawidłowy format',
    tooShort: 'Za krótkie',
    tooLong: 'Za długie',

    // Action errors
    failedToLoad: 'Nie udało się załadować',
    failedToSave: 'Nie udało się zapisać',
    failedToDelete: 'Nie udało się usunąć',
    failedToFetch: 'Nie udało się pobrać danych',
  },

  legal: {
    // Legal terms - using legally accurate Polish translations
    termsOfService: 'Regulamin',
    privacyPolicy: 'Polityka prywatności',
    cookiePolicy: 'Polityka cookies',
    dataProcessing: 'Umowa powierzenia przetwarzania danych',
    consent: 'Zgoda',

    // Document types
    judgment: 'Wyrok',
    ruling: 'Orzeczenie',
    interpretation: 'Interpretacja',
    regulation: 'Rozporządzenie',
    statute: 'Ustawa',
    amendment: 'Nowelizacja',

    // Legal concepts
    precedent: 'Precedens',
    jurisdiction: 'Jurysdykcja',
    compliance: 'Zgodność',
    liability: 'Odpowiedzialność',

    // Version control
    lastUpdated: 'Ostatnia aktualizacja',
    version: 'Wersja',
    effectiveDate: 'Data wejścia w życie',
  },

  dashboard: {
    title: 'Panel główny',
    databaseOverview: 'Przegląd bazy danych',
    recentConversations: 'Ostatnie rozmowy',
    extractionTemplates: 'Szablony ekstrakcji',
    recentJudgments: 'Ostatnie orzeczenia',
    popularLegalTopics: 'Popularne tematy prawne',
    researchCollections: 'Kolekcje badawcze',
    recentExtractions: 'Ostatnie ekstrakcje',
    viewAll: 'Zobacz wszystko',
    startChat: 'Rozpocznij rozmowę',
    generateTemplate: 'Generuj szablon',
    browseJudgments: 'Przeglądaj orzeczenia',
    startExtraction: 'Rozpocznij ekstrakcję',
    noChats: 'Brak rozmów. Zadaj Juddges pytanie prawne, aby rozpocząć.',
    noSchemas: 'Brak szablonów. Pozwól Juddges wygenerować pierwszy szablon ekstrakcji.',
    noDocuments: 'Brak orzeczeń. Przeszukaj bazę danych, aby odkryć orzeczenia sądowe.',
    noExtractions: 'Brak ekstrakcji. Użyj Juddges do wyodrębnienia ustrukturyzowanych danych z orzeczeń.',
    noTrending: 'Brak popularnych tematów',
    failedToLoadStats: 'Nie udało się załadować statystyk',
    dataCompleteness: 'Kompletność danych',
    legalInsights: 'Analiza prawna',
    complexityAnalysis: 'Analiza złożoności',
  },
};
