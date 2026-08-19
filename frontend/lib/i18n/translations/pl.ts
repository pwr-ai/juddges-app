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
    researchBlog: 'Blog badawczy',
    useCases: 'Przypadki użycia',
    settings: 'Ustawienia',

    // Support
    support: 'Pomoc',
    helpCenter: 'Centrum pomocy',
    contact: 'Kontakt',

    // Chat specific
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
    searchExtractedData: 'Szukaj w danych z ekstrakcji',
    topicTrends: 'Trendy tematów',
    topicModeling: 'Modelowanie tematów',
    savedSearches: 'Zapisane wyszukiwania',
    dataExtraction: 'Ekstrakcja danych',
    extractionResults: 'Wyniki ekstrakcji',
    baseTemplate: 'Bazowy schemat kodowania',
    compareDatasets: 'Porównaj zbiory danych',
    precedentSearch: 'Wyszukiwanie precedensów',
    argumentationAnalysis: 'Analiza argumentacji',
    judgeFingerprint: 'Profil sędziego',

    // Administration (admin-only surfaces)
    administration: 'Administracja',
    adminPanel: 'Panel administratora',

    // Accessible names
    homeLinkLabel: 'JuDDGES — przejdź do strony głównej',

    // Workflow phase labels
    phasePlan: '1. Zaplanuj',
    phaseSearch: '2. Wyszukaj',
    phaseAnalyze: '3. Analizuj',
    phaseExport: '4. Eksportuj',
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
    title: 'Pulpit',
    databaseOverview: 'Przegląd bazy danych',
    recentJudgments: 'Ostatnie orzeczenia',
    popularLegalTopics: 'Popularne tematy prawne',
    researchCollections: 'Kolekcje badawcze',
    viewAll: 'Zobacz wszystko',
    noTrending: 'Brak popularnych tematów',
    failedToLoadStats: 'Nie udało się załadować statystyk',
  },

  judgeFingerprint: {
    pageTitle: 'Profil rozumowania sędziego',
    pageSubtitle: 'Analizuj i porównuj style rozumowania prawnego sędziów na podstawie ich orzeczeń',
    searchLabel: 'Wyszukaj sędziego',
    searchPlaceholder: 'Wyszukaj sędziego po nazwisku...',
    searchMaxReached: 'Maksymalnie {{max}} sędziów',
    searchHint: 'Wyszukaj do {{max}} sędziów, aby wyświetlić ich profil rozumowania. Wybierz 2–3, aby porównać.',
    searching: 'Szukanie...',
    noResults: 'Nie znaleziono sędziów pasujących do „{{query}}”',
    caseCount: '{{count}} spraw',
    removeJudge: 'Usuń {{name}}',
    dominantStyle: 'Dominujący styl',
    statCases: 'Spraw',
    statAnalyzed: 'Przeanalizowanych',
    periodTo: 'do',
    sampleCases: 'Przykładowe sprawy',
    loadingProfile: 'Ładowanie profilu sędziego...',
    loadingSubtitle: 'Analizowanie stylu rozumowania na podstawie orzeczeń',
    errorLoadingTitle: 'Błąd ładowania profilu',
    errorToastTitle: 'Nie udało się załadować profilu sędziego',
    comparisonHeading: 'Porównanie sędziów',
    comparisonDescription: 'Nakładający się wykres radarowy pokazuje różnice w stylach rozumowania',
    profilesHeading: 'Profile sędziów',
    emptyTitle: 'Profil rozumowania sędziego',
    emptyDescription: 'Wyszukaj sędziego, aby wyświetlić analizę stylu rozumowania prawnego. Wybierz 2–3 sędziów, aby porównać ich podejścia.',
    howItWorks: 'Jak to działa',
    reasoningTextual: 'Tekstualna',
    reasoningTextualDescription: 'Ścisła interpretacja tekstu ustawy, analiza literalna przepisów.',
    reasoningDeductive: 'Dedukcyjna',
    reasoningDeductiveDescription: 'Stosowanie ogólnych zasad prawnych do konkretnych stanów faktycznych.',
    reasoningAnalogical: 'Analogiczna',
    reasoningAnalogicalDescription: 'Porównywanie z podobnymi sprawami i orzeczeniami.',
    reasoningPurposive: 'Celowościowa',
    reasoningPurposiveDescription: 'Interpretacja oparta na celach polityki prawnej lub intencji ustawodawcy.',
    reasoningTeleological: 'Teleologiczna',
    reasoningTeleologicalDescription: 'Interpretacja celowościowa, odwołująca się do celu i funkcji przepisu.',
  },

  reasoningLines: {
    // Page header
    pageTitle: 'Linie orzecznicze',
    pageSubtitle: 'Odkrywaj klastry orzeczeń dotyczących tego samego zagadnienia prawnego',

    // Tabs
    tabDiscover: 'Odkrywanie',
    tabSaved: 'Zapisane linie',
    tabDag: 'Graf DAG',

    // Discovery controls
    paramsHeading: 'Parametry odkrywania',
    paramSampleSize: 'Rozmiar próbki',
    paramNumClusters: 'Liczba klastrów',
    paramLegalDomain: 'Dziedzina prawa (opcjonalnie)',
    paramLegalDomainPlaceholder: 'np. prawo podatkowe, prawo pracy...',
    discoverButton: 'Odkryj linie',
    discoverButtonPending: 'Odkrywanie...',

    // Discovery states
    discoverLoadingTitle: 'Odkrywanie linii orzeczniczych...',
    discoverLoadingSubtitle: 'Klasteryzacja orzeczeń na podstawie podobieństwa semantycznego — większe próbki trwają dłużej',
    discoverErrorTitle: 'Nie udało się przeprowadzić odkrywania',
    discoverErrorMessage: 'Usługa klasteryzacji nie zwróciła wyniku, więc nie odkryto żadnych linii. Nic nie zostało zapisane. Spróbuj ponownie lub zmniejsz rozmiar próbki i liczbę klastrów, aby odciążyć zapytanie.',
    discoverEmptyTitle: 'Nie uruchomiono jeszcze odkrywania',
    discoverEmptyDescription: 'Nie przeprowadzono dotąd żadnej klasteryzacji. Ustaw powyżej rozmiar próbki, liczbę klastrów i — opcjonalnie — dziedzinę prawa, a następnie wybierz „Odkryj linie”, aby pogrupować orzeczenia dotyczące tego samego zagadnienia prawnego.',
    discoveredHeading: 'Odkryte linie orzecznicze ({{count}})',

    // Discovery statistics
    statDocuments: 'Dokumenty',
    statClusters: 'Klastry',
    statCoherence: 'Koherencja',
    statTime: 'Czas',

    // How discovery works
    howItWorks: 'Jak to działa',
    howSemanticTitle: 'Klasteryzacja semantyczna',
    howSemanticDescription: 'Orzeczenia są grupowane na podstawie znaczenia ich treści i uzasadnień, a nie zbieżności słów kluczowych.',
    howSharedBasesTitle: 'Wspólne podstawy prawne',
    howSharedBasesDescription: 'Klastry spaja wspólne odwołanie do tych samych przepisów i aktów prawnych.',
    howCoherenceTitle: 'Analiza koherencji',
    howCoherenceDescription: 'Każdy klaster otrzymuje ocenę spójności — im wyższa, tym bardziej jednorodna linia orzecznicza.',
    howKeywordsTitle: 'Słowa kluczowe',
    howKeywordsDescription: 'Najbardziej charakterystyczne terminy każdego klastra są wyodrębniane automatycznie.',

    // Cluster / line cards
    clusterCaseCount: 'Liczba spraw: {{count}}',
    coherenceLabel: 'Koherencja',
    coherenceValue: 'Koherencja: {{percent}}%',
    legalBasesLabel: 'Podstawy prawne',
    showCases: 'Pokaż sprawy ({{count}})',
    hideCases: 'Ukryj sprawy',
    saveCluster: 'Zapisz jako linię',
    saveClusterPending: 'Zapisywanie...',
    saveClusterDone: 'Zapisano',
    caseCount: '{{count}} spraw',
    similarityMatch: '{{percent}}% trafności',

    // Status labels
    statusActive: 'Aktywna',
    statusArchived: 'Zarchiwizowana',
    statusDeleted: 'Usunięta',

    // Saved lines tab
    searchPlaceholder: 'Szukaj linii orzeczniczych...',
    searchAriaLabel: 'Szukaj linii orzeczniczych',
    searchErrorTitle: 'Wyszukiwanie jest niedostępne',
    searchErrorMessage: 'Nie udało się połączyć z usługą wyszukiwania linii orzeczniczych, więc nie wczytano żadnych wyników. Spróbuj ponownie za chwilę lub wyczyść pole wyszukiwania, aby przeglądać wszystkie zapisane linie.',
    searchEmptyTitle: 'Żadna linia orzecznicza nie pasuje do zapytania',
    searchEmptyDescription: 'Nic w zapisanym katalogu nie pasuje do „{{query}}”. Wyszukiwanie obejmuje nazwy, pytania prawne i słowa kluczowe — spróbuj ogólniejszego sformułowania albo wyczyść pole, aby przeglądać wszystkie zapisane linie.',
    searchResultsHeading: 'Wyniki wyszukiwania ({{count}})',
    savedLoading: 'Ładowanie zapisanych linii orzeczniczych...',
    savedErrorTitle: 'Nie udało się wczytać zapisanych linii',
    savedErrorMessage: 'Nie udało się pobrać zapisanych linii orzeczniczych z serwera. Nic nie zostało utracone — spróbuj ponownie lub odśwież stronę, jeśli problem się powtarza.',
    savedEmptyTitle: 'Brak zapisanych linii orzeczniczych',
    savedEmptyDescription: 'Do katalogu nie dodano dotąd żadnej linii. Przejdź do zakładki „Odkrywanie”, uruchom odkrywanie na korpusie orzeczeń i zapisz klastry warte obserwowania — pojawią się w tym miejscu.',
    savedHeading: 'Zapisane linie orzecznicze ({{count}})',

    // Automated pipeline card
    pipelineHeading: 'Automatyczny pipeline',
    pipelineWeekly: 'Co tydzień',
    pipelineAssignTitle: 'Automatyczne przypisywanie',
    pipelineAssignDescription: 'Nowe orzeczenia są automatycznie przypisywane do istniejących linii',
    pipelineDiscoverTitle: 'Automatyczne odkrywanie',
    pipelineDiscoverDescription: 'Nieprzypisane orzeczenia są grupowane w nowe linie',
    pipelineEventsTitle: 'Wykrywanie zdarzeń',
    pipelineEventsDescription: 'Rozgałęzienia i połączenia między liniami są wykrywane automatycznie',

    // DAG tab
    dagHeading: 'Graf DAG linii orzeczniczych',
    detectEvents: 'Wykryj zdarzenia',
    detectEventsPending: 'Wykrywanie...',
    detectEventsError: 'Wykrywanie zdarzeń nie powiodło się. Nic nie zostało zmienione — spróbuj ponownie za chwilę.',
    eventBranches: 'Rozgałęzienia: {{count}}',
    eventMerges: 'Połączenia: {{count}}',
    eventInfluences: 'Wpływy: {{count}}',
    eventLinesAnalyzed: 'Przeanalizowanych linii: {{count}}',
    eventProcessingTime: 'Czas: {{seconds}} s',
    dagLoading: 'Ładowanie grafu DAG...',
    dagErrorTitle: 'Nie udało się wczytać grafu',
    dagErrorMessage: 'Nie udało się pobrać grafu linii orzeczniczych z serwera. Spróbuj ponownie; jeśli błąd się powtarza, graf może być wciąż przebudowywany po ostatnim przebiegu pipeline’u.',
    dagEmptyTitle: 'Nie ma jeszcze czego pokazać',
    dagEmptyDescriptionAdmin: 'Graf jest pusty, ponieważ nie zarejestrowano żadnych rozgałęzień, połączeń ani wpływów. Zapisz co najmniej dwie linie orzecznicze, a następnie wybierz „Wykryj zdarzenia”, aby zbudować graf.',
    dagEmptyDescription: 'Graf jest pusty, ponieważ nie zarejestrowano jeszcze żadnych linii orzeczniczych ani powiązań między nimi. Graf buduje administrator — wróć tutaj, gdy linie zostaną zapisane i przeanalizowane.',
    statNodes: 'Węzły',
    statEdges: 'Krawędzie',
    statBranches: 'Rozgałęzienia',
    statMerges: 'Połączenia',

    // Detail page — shell states
    backToList: 'Powrót do linii orzeczniczych',
    detailLoading: 'Ładowanie szczegółów linii orzeczniczej...',
    detailErrorTitle: 'Nie udało się wczytać linii orzeczniczej',
    detailErrorMessage: 'Nie udało się pobrać szczegółów tej linii orzeczniczej z serwera. Spróbuj ponownie lub wróć do listy i otwórz linię jeszcze raz.',
    detailNotFoundTitle: 'Nie znaleziono linii orzeczniczej',
    detailNotFoundDescription: 'Ta linia orzecznicza nie istnieje lub została usunięta. Wróć do listy, aby przejrzeć linie nadal dostępne w katalogu.',
    createdLabel: 'Utworzono: {{date}}',

    // Detail page — delete flow
    deleteLine: 'Usuń linię',
    deleteConfirmQuestion: 'Usunąć tę linię orzeczniczą dla wszystkich użytkowników?',
    deleteConfirm: 'Tak, usuń',
    deletePending: 'Usuwanie...',
    deleteError: 'Nie udało się usunąć linii orzeczniczej. Nic nie zostało usunięte — spróbuj ponownie za chwilę.',

    // Detail page — member judgments
    membersHeading: 'Orzeczenia w linii ({{count}})',
    membersEmptyTitle: 'Brak orzeczeń w tej linii',
    membersEmptyDescription: 'Do tej linii orzeczniczej nie przypisano jeszcze żadnych orzeczeń. Cotygodniowe automatyczne przypisywanie dodaje pasujące, nowo zaimportowane orzeczenia — wróć po kolejnym przebiegu.',

    // Detail page — outcome timeline
    outcomeHeading: 'Ewolucja rozstrzygnięć w czasie',
    classify: 'Klasyfikuj orzeczenia',
    classifyPending: 'Klasyfikowanie...',
    classifyError: 'Klasyfikacja nie powiodła się. Żadne rozstrzygnięcie nie zostało zmienione — spróbuj ponownie za chwilę.',
    classifyClassified: 'Sklasyfikowano: {{count}}',
    classifySkipped: 'Pominięto: {{count}}',
    classifyErrors: 'Błędy: {{count}}',
    timelineLoading: 'Ładowanie osi czasu rozstrzygnięć...',
    timelineErrorAdmin: 'Brak osi czasu. Rozstrzygnięcia w tej linii nie zostały jeszcze sklasyfikowane — wybierz powyżej „Klasyfikuj orzeczenia”, aby ją wygenerować.',
    timelineError: 'Brak osi czasu. Rozstrzygnięcia w tej linii nie zostały jeszcze sklasyfikowane, więc nie ma czego pokazać.',
    timelineEmptyAdmin: 'Nie sklasyfikowano jeszcze żadnego orzeczenia. Wybierz powyżej „Klasyfikuj orzeczenia”, aby oznaczyć rozstrzygnięcia i zbudować oś czasu.',
    timelineEmpty: 'Nie sklasyfikowano jeszcze żadnego orzeczenia, więc oś czasu rozstrzygnięć jest pusta.',
    timelineTotalClassified: 'Sklasyfikowanych: {{count}}',
    timelineTotalUnclassified: 'Niesklasyfikowanych: {{count}}',

    // Detail page — language drift
    driftHeading: 'Dryf językowy',
    driftAnalyze: 'Analizuj dryf',
    driftPending: 'Analizowanie...',
    driftError: 'Analiza dryfu nie powiodła się. Nic nie zostało zmienione — spróbuj ponownie za chwilę.',
    driftLoading: 'Analizowanie dryfu językowego...',
    driftIdleAdmin: 'Dryf językowy nie został jeszcze przeanalizowany. Wybierz „Analizuj dryf”, aby zbadać, jak zmieniał się w czasie język orzeczeń w tej linii.',
    driftIdle: 'Dryf językowy nie został jeszcze przeanalizowany dla tej linii, więc nie ma czego pokazać.',

    // Detail page — related lines
    relatedHeading: 'Powiązane linie orzecznicze',
    relatedLoading: 'Ładowanie powiązanych linii orzeczniczych...',
    relatedError: 'Nie udało się wczytać powiązanych linii orzeczniczych. Odśwież stronę, aby spróbować ponownie.',
    relatedEmpty: 'Nie znaleziono powiązanych linii orzeczniczych. Powiązania opierają się na wspólnych podstawach prawnych i słowach kluczowych — pojawią się w miarę rozrostu katalogu.',
  },
};
