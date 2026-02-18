BEGIN;

-- Temporarily disable the schema version trigger to avoid foreign key constraint issues
-- We'll manually create version 1 entries after all schemas are inserted
ALTER TABLE extraction_schemas DISABLE TRIGGER create_schema_version_trigger;

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    'f6cbdbda-b288-4456-a76c-c17da09b6d32'::uuid,
    'podobne_sprawy_precedensy',
    'Wyszukiwanie podobnych spraw i precedensów prawnych do researchu sprawy',
    'extraction',
    'litigation',
    '{"streszczenie_sprawy": {"type": "string", "description": "Krótkie streszczenie stanu faktycznego i kwestii prawnych", "required": true}, "problem_prawny": {"type": "string", "description": "Główne pytanie prawne lub sporna kwestia", "required": true}, "poziom_sadu": {"type": "string", "description": "Poziom sądu (np. NSA, WSA, Sąd Okręgowy, Sąd Rejonowy)", "required": false}, "izba_wydzial": {"type": "string", "description": "Izba lub wydział sądu, który rozpoznawał sprawę", "required": false}, "data_orzeczenia": {"type": "string", "description": "Data wydania orzeczenia (RRRR-MM-DD)", "required": false}, "sygnatura_sprawy": {"type": "string", "description": "Sygnatura akt sprawy", "required": false}, "wynik_sprawy": {"type": "string", "description": "Rozstrzygnięcie (np. ''uwzględniono'', ''oddalono'', ''uwzględniono częściowo'')", "required": true}, "kluczowe_argumenty": {"type": "array", "items": {"type": "string"}, "description": "Kluczowe argumenty prawne, które okazały się skuteczne w sprawie", "required": true}, "podstawa_prawna": {"type": "array", "items": {"type": "string"}, "description": "Przywołane przepisy prawne (np. ''art. 15 ustawy o VAT'')", "required": true}, "wartosc_precedensowa": {"type": "string", "description": "Ocena wartości precedensowej (wysoka, średnia, niska)", "required": false}, "id_podobnych_spraw": {"type": "array", "items": {"type": "string"}, "description": "ID lub sygnatury podobnych spraw wymienionych w orzeczeniu", "required": false}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774166'::timestamp,
    '2025-10-20T12:04:33.774174'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    11
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    '63d4c97c-6755-46ac-86a2-6bc8d2f026a3'::uuid,
    'prognoza_wyniku_sprawy',
    'Analiza predykcyjna szacująca wynik sprawy i czas trwania postępowania',
    'extraction',
    'litigation',
    '{"typ_sprawy": {"type": "string", "description": "Rodzaj sprawy (np. spór podatkowy, odwołanie administracyjne)", "required": true}, "kwota_sporna": {"type": "number", "description": "Kwota będąca przedmiotem sporu (w PLN)", "required": false}, "poziom_sadu": {"type": "string", "description": "Poziom sądu, w którym będzie rozpoznawana sprawa", "required": true}, "okolicznosci_faktyczne": {"type": "array", "items": {"type": "string"}, "description": "Kluczowe okoliczności faktyczne wpływające na sprawę", "required": true}, "czynniki_korzystne": {"type": "array", "items": {"type": "string"}, "description": "Czynniki przemawiające za stanowiskiem klienta", "required": true}, "czynniki_niekorzystne": {"type": "array", "items": {"type": "string"}, "description": "Czynniki mogące osłabić pozycję klienta", "required": true}, "szacowane_prawdopodobienstwo_wygranej": {"type": "string", "description": "Szacowane prawdopodobieństwo sukcesu (np. ''65-75%'')", "required": false}, "szacowany_czas_trwania_miesiace": {"type": "integer", "description": "Szacowany czas trwania sprawy w miesiącach", "required": false}, "kluczowe_argumenty_prawne": {"type": "array", "items": {"type": "string"}, "description": "Najważniejsze argumenty prawne do przedstawienia", "required": true}, "wyniki_podobnych_spraw": {"type": "string", "description": "Wzorzec rozstrzygnięć w podobnych sprawach", "required": false}, "rekomendacja": {"type": "string", "description": "Rekomendacja strategiczna (kontynuować, ugoda, negocjacje)", "required": false}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774191'::timestamp,
    '2025-10-20T12:04:33.774193'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    11
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    'c8b15e59-d160-4213-84b7-3f21a4967afa'::uuid,
    'due_diligence_podatkowe_ma',
    'Lista kontrolna due diligence podatkowego i ocena ryzyka przy transakcjach M&A',
    'extraction',
    'tax',
    '{"nazwa_przedsiebiorstwa": {"type": "string", "description": "Nazwa przejmowanego przedsiębiorstwa", "required": true}, "nip_przedsiebiorstwa": {"type": "string", "description": "NIP (numer identyfikacji podatkowej)", "required": true}, "okres_przegladu": {"type": "string", "description": "Okres objęty due diligence (np. ''2020-2024'')", "required": true}, "zaleglosci_podatkowe": {"type": "array", "items": {"type": "object", "properties": {"rodzaj_podatku": {"type": "string"}, "kwota": {"type": "number"}, "status": {"type": "string"}}, "required": ["rodzaj_podatku", "kwota"]}, "description": "Lista zaległości i zobowiązań podatkowych", "required": true}, "toczace_sie_spory_podatkowe": {"type": "array", "items": {"type": "object", "properties": {"numer_sprawy": {"type": "string"}, "kwota_sporna": {"type": "number"}, "opis_problemu": {"type": "string"}, "etap_postepowania": {"type": "string"}}, "required": ["opis_problemu"]}, "description": "Aktywne spory podatkowe i ich status", "required": true}, "interpretacje_podatkowe": {"type": "array", "items": {"type": "object", "properties": {"numer_interpretacji": {"type": "string"}, "kwestia": {"type": "string"}, "status_waznosci": {"type": "string"}, "data_wygasniecia": {"type": "string"}}, "required": ["kwestia", "status_waznosci"]}, "description": "Interpretacje podatkowe uzyskane przez przedsiębiorstwo", "required": false}, "zidentyfikowane_ryzyka": {"type": "array", "items": {"type": "object", "properties": {"rodzaj_ryzyka": {"type": "string"}, "opis": {"type": "string"}, "szacowana_ekspozycja": {"type": "number"}, "prawdopodobienstwo": {"type": "string"}, "mitygacja": {"type": "string"}}, "required": ["rodzaj_ryzyka", "opis"]}, "description": "Zidentyfikowane ryzyka podatkowe i potencjalne zobowiązania", "required": true}, "zgodnosc_cen_transferowych": {"type": "object", "properties": {"czy_ma_dokumentacje": {"type": "boolean"}, "ocena_kompletnosci": {"type": "string"}, "zidentyfikowane_luki": {"type": "array", "items": {"type": "string"}}}, "description": "Status dokumentacji cen transferowych", "required": false}, "laczna_ekspozycja_ryzyko": {"type": "number", "description": "Łączna szacowana ekspozycja na ryzyko podatkowe w PLN", "required": false}, "ogolna_ocena_ryzyka": {"type": "string", "description": "Ogólna ocena ryzyka podatkowego (niskie, średnie, wysokie, krytyczne)", "required": true}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774207'::timestamp,
    '2025-10-20T12:04:33.774208'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    10
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    '69e27b4e-6100-4b74-b69b-bf214ac858d1'::uuid,
    'monitoring_zmian_prawnych',
    'Monitorowanie i alerty o zmianach prawnych wpływających na klientów',
    'extraction',
    'compliance',
    '{"typ_zmiany": {"type": "string", "description": "Rodzaj zmiany prawnej (nowa ustawa, nowelizacja, orzeczenie sądowe, interpretacja)", "required": true}, "zrodlo": {"type": "string", "description": "Źródło zmiany (Sejm, NSA, KIS, TSUE, itp.)", "required": true}, "data_publikacji": {"type": "string", "description": "Data publikacji (RRRR-MM-DD)", "required": true}, "data_wejscia_w_zycie": {"type": "string", "description": "Data wejścia w życie zmiany (RRRR-MM-DD)", "required": true}, "referencja_prawna": {"type": "string", "description": "Oficjalna referencja (np. ''Ustawa z dnia...'', ''Wyrok NSA...'')", "required": true}, "dotknięte_obszary": {"type": "array", "items": {"type": "string"}, "description": "Obszary prawa objęte zmianą (VAT, CIT, prawo pracy, itp.)", "required": true}, "streszczenie_zmiany": {"type": "string", "description": "Krótkie streszczenie wprowadzonych zmian", "required": true}, "ocena_wplywu": {"type": "string", "description": "Ocena praktycznego wpływu (znaczący, umiarkowany, niewielki)", "required": true}, "dotknięci_klienci": {"type": "array", "items": {"type": "string"}, "description": "Rodzaje klientów objętych zmianą (firmy IT, producenci, itp.)", "required": true}, "wymagane_dzialanie": {"type": "string", "description": "Co klienci muszą zrobić (aktualizacja umów, złożenie deklaracji, itp.)", "required": false}, "termin_dzialania": {"type": "string", "description": "Termin podjęcia wymaganego działania (RRRR-MM-DD)", "required": false}, "powiazane_sprawy_klientow": {"type": "array", "items": {"type": "string"}, "description": "Sprawy lub kwestie klientów, które mogą być dotknięte", "required": false}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774216'::timestamp,
    '2025-10-20T12:04:33.774217'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    12
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    'ee89246f-0bda-47dd-8e77-408e59a64c30'::uuid,
    'automatyczna_analiza_ryzyka_podatkowego',
    'Automatyczna analiza profilu ryzyka podatkowego klienta',
    'extraction',
    'tax',
    '{"nazwa_klienta": {"type": "string", "description": "Nazwa przedsiębiorstwa klienta", "required": true}, "nip_klienta": {"type": "string", "description": "NIP (numer identyfikacji podatkowej)", "required": true}, "okres_analizy": {"type": "string", "description": "Analizowany okres (np. ''2024 Q1-Q4'')", "required": true}, "zidentyfikowane_ryzyka": {"type": "array", "items": {"type": "object", "properties": {"kategoria_ryzyka": {"type": "string"}, "opis_ryzyka": {"type": "string"}, "poziom_powagi": {"type": "string"}, "potencjalna_kara": {"type": "number"}, "podstawa_prawna": {"type": "string"}, "kroki_naprawcze": {"type": "array", "items": {"type": "string"}}}, "required": ["kategoria_ryzyka", "opis_ryzyka", "poziom_powagi"]}, "description": "Lista zidentyfikowanych ryzyk podatkowych", "required": true}, "ryzyka_vat": {"type": "array", "items": {"type": "object", "properties": {"kwestia": {"type": "string"}, "dotkniete_faktury": {"type": "integer"}, "kwota_ryzyka": {"type": "number"}}, "required": ["kwestia"]}, "description": "Ryzyka specyficzne dla VAT", "required": false}, "ryzyka_cen_transferowych": {"type": "array", "items": {"type": "object", "properties": {"kwestia": {"type": "string"}, "dotkniete_transakcje": {"type": "integer"}, "potencjalna_korekta": {"type": "number"}}, "required": ["kwestia"]}, "description": "Ryzyka compliance cen transferowych", "required": false}, "luki_w_zgodnosci": {"type": "array", "items": {"type": "object", "properties": {"wymog": {"type": "string"}, "opis_luki": {"type": "string"}, "pilnosc": {"type": "string"}}, "required": ["wymog", "opis_luki"]}, "description": "Wymagania compliance, które nie są spełnione", "required": true}, "wynik_ryzyka": {"type": "integer", "description": "Ogólny wynik ryzyka (0-100)", "required": false}, "dzialania_priorytetowe": {"type": "array", "items": {"type": "object", "properties": {"dzialanie": {"type": "string"}, "termin": {"type": "string"}, "priorytet": {"type": "string"}}, "required": ["dzialanie", "priorytet"]}, "description": "Priorytetowe działania w celu zaradzenia ryzykom", "required": true}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774231'::timestamp,
    '2025-10-20T12:04:33.774232'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    9
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    '9ec68391-080c-427d-a516-ea49f3c77f32'::uuid,
    'wniosek_interpretacja_podatkowa',
    'Automatyczne przygotowanie wniosków o interpretację podatkową',
    'extraction',
    'tax',
    '{"nazwa_podatnika": {"type": "string", "description": "Nazwa podatnika wnioskującego o interpretację", "required": true}, "nip_podatnika": {"type": "string", "description": "NIP (numer identyfikacji podatkowej)", "required": true}, "adres_podatnika": {"type": "string", "description": "Pełny adres podatnika", "required": true}, "stan_faktyczny": {"type": "string", "description": "Szczegółowy opis stanu faktycznego", "required": true}, "planowana_transakcja": {"type": "string", "description": "Opis planowanej transakcji (jeśli dotyczy)", "required": false}, "pytanie_prawne": {"type": "string", "description": "Konkretne pytanie prawne wymagające interpretacji", "required": true}, "stanowisko_podatnika": {"type": "string", "description": "Stanowisko podatnika w sprawie zastosowania prawa", "required": true}, "podstawa_prawna": {"type": "array", "items": {"type": "string"}, "description": "Przywołane przepisy prawne", "required": true}, "orzecznictwo_wspierajace": {"type": "array", "items": {"type": "object", "properties": {"sygnatura": {"type": "string"}, "sad": {"type": "string"}, "znaczenie": {"type": "string"}}, "required": ["sygnatura"]}, "description": "Orzeczenia sądowe wspierające stanowisko podatnika", "required": false}, "podobne_interpretacje": {"type": "array", "items": {"type": "string"}, "description": "Podobne interpretacje wydane przez organy podatkowe", "required": false}, "typ_interpretacji": {"type": "string", "description": "Rodzaj interpretacji (indywidualna, ogólna)", "required": true}, "pilnosc": {"type": "string", "description": "Poziom pilności (standardowa, pilna)", "required": false}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774242'::timestamp,
    '2025-10-20T12:04:33.774243'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    12
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    '62462553-e52b-40c3-8c38-a0a8817e3954'::uuid,
    'wyszukiwarka_jezyk_biznesowy',
    'Wyszukiwarka dla nieprawników wykorzystująca prosty język biznesowy',
    'extraction',
    'compliance',
    '{"pytanie_uzytkownika": {"type": "string", "description": "Pytanie użytkownika w prostym języku", "required": true}, "wyodrebniona_intencja": {"type": "string", "description": "Wyodrębniona intencja prawna z pytania", "required": true}, "obszar_prawny": {"type": "string", "description": "Zidentyfikowany obszar prawa (VAT, CIT, prawo pracy, itp.)", "required": true}, "prosta_odpowiedz": {"type": "string", "description": "Odpowiedź w prostym, biznesowym języku", "required": true}, "istotne_przepisy": {"type": "array", "items": {"type": "object", "properties": {"przepis": {"type": "string"}, "wyjasnienie": {"type": "string"}}, "required": ["przepis", "wyjasnienie"]}, "description": "Istotne przepisy prawne z wyjaśnieniami", "required": true}, "przyklady": {"type": "array", "items": {"type": "string"}, "description": "Praktyczne przykłady ilustrujące odpowiedź", "required": false}, "ostrzezenia": {"type": "array", "items": {"type": "string"}, "description": "Ważne ostrzeżenia lub wyjątki", "required": false}, "poziom_zlozonosci": {"type": "string", "description": "Ocena złożoności (prosty, umiarkowany, złożony)", "required": true}, "wymaga_eksperta": {"type": "boolean", "description": "Czy sprawa wymaga konsultacji z ekspertem", "required": true}, "powod_konsultacji_eksperta": {"type": "string", "description": "Dlaczego potrzebna jest konsultacja eksperta (jeśli dotyczy)", "required": false}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774253'::timestamp,
    '2025-10-20T12:04:33.774254'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    10
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    '1b144785-f3bd-49e8-9d2b-e1553e7297fe'::uuid,
    'analiza_koszt_korzysci_spory',
    'Analiza kosztów i korzyści dla decyzji dotyczących sporów sądowych',
    'extraction',
    'litigation',
    '{"opis_sprawy": {"type": "string", "description": "Krótki opis sprawy sądowej", "required": true}, "kwota_sporna": {"type": "number", "description": "Kwota sporna (PLN)", "required": true}, "obecny_etap": {"type": "string", "description": "Obecny etap postępowania", "required": true}, "szacowane_koszty": {"type": "object", "properties": {"oplaty_sadowe": {"type": "number"}, "zastepstwo_prawne": {"type": "number"}, "opinie_bieglych": {"type": "number"}, "inne_koszty": {"type": "number"}, "laczne_szacowane_koszty": {"type": "number"}}, "description": "Rozbicie szacowanych kosztów sporu", "required": true}, "prawdopodobienstwo_wygranej": {"type": "number", "description": "Szacowane prawdopodobieństwo wygranej (0.0-1.0)", "required": true}, "szacowany_czas_miesiace": {"type": "integer", "description": "Szacowany czas trwania postępowania w miesiącach", "required": true}, "mozliwe_wyniki": {"type": "array", "items": {"type": "object", "properties": {"wynik": {"type": "string"}, "prawdopodobienstwo": {"type": "number"}, "efekt_finansowy": {"type": "number"}}, "required": ["wynik", "prawdopodobienstwo"]}, "description": "Możliwe wyniki sprawy z prawdopodobieństwami", "required": true}, "wartosc_oczekiwana": {"type": "number", "description": "Kalkulacja wartości oczekiwanej (wynik ważony prawdopodobieństwem)", "required": true}, "opcje_ugody": {"type": "array", "items": {"type": "object", "properties": {"kwota_ugody": {"type": "number"}, "realnosc": {"type": "string"}, "korzysc_netto": {"type": "number"}}, "required": ["kwota_ugody"]}, "description": "Potencjalne opcje ugody", "required": false}, "rekomendacja": {"type": "string", "description": "Rekomendacja strategiczna (kontynuować, ugoda, negocjacje)", "required": true}, "uzasadnienie_rekomendacji": {"type": "string", "description": "Uzasadnienie rekomendacji", "required": true}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774264'::timestamp,
    '2025-10-20T12:04:33.774265'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    11
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    '03715c6d-0b0a-476f-9878-47a37cf9fad8'::uuid,
    'sprawdzanie_zgodnosci_dokumentow',
    'Automatyczne sprawdzanie zgodności dokumentów prawnych i umów',
    'extraction',
    'compliance',
    '{"typ_dokumentu": {"type": "string", "description": "Rodzaj dokumentu (umowa, regulamin, polityka prywatności, itp.)", "required": true}, "tytul_dokumentu": {"type": "string", "description": "Tytuł lub nazwa dokumentu", "required": true}, "sprawdzenia_zgodnosci": {"type": "array", "items": {"type": "object", "properties": {"wymog": {"type": "string"}, "status": {"type": "string"}, "szczegoly": {"type": "string"}, "powaznosc": {"type": "string"}}, "required": ["wymog", "status"]}, "description": "Lista przeprowadzonych sprawdzeń zgodności", "required": true}, "brakujace_klauzule": {"type": "array", "items": {"type": "object", "properties": {"nazwa_klauzuli": {"type": "string"}, "wymog_prawny": {"type": "string"}, "konsekwencja": {"type": "string"}}, "required": ["nazwa_klauzuli", "wymog_prawny"]}, "description": "Wymagane klauzule, które są brakujące", "required": true}, "niewazne_klauzule": {"type": "array", "items": {"type": "object", "properties": {"odniesienie_klauzuli": {"type": "string"}, "problem": {"type": "string"}, "podstawa_prawna": {"type": "string"}, "sugerowana_zmiana": {"type": "string"}}, "required": ["odniesienie_klauzuli", "problem"]}, "description": "Klauzule, które mogą być nieważne lub niewykonalne", "required": false}, "zgodnosc_rodo": {"type": "object", "properties": {"zgodny": {"type": "boolean"}, "problemy": {"type": "array", "items": {"type": "string"}}, "brakujace_elementy": {"type": "array", "items": {"type": "string"}}}, "description": "Ocena zgodności z RODO", "required": false}, "problemy_ochrony_konsumentow": {"type": "array", "items": {"type": "object", "properties": {"problem": {"type": "string"}, "przepis_prawny": {"type": "string"}, "rekomendacja": {"type": "string"}}, "required": ["problem"]}, "description": "Problemy z zakresu ochrony konsumentów", "required": false}, "ogolny_wynik_zgodnosci": {"type": "integer", "description": "Ogólny wynik zgodności (0-100)", "required": false}, "naprawy_priorytetowe": {"type": "array", "items": {"type": "object", "properties": {"naprawa": {"type": "string"}, "priorytet": {"type": "string"}, "pilnosc": {"type": "string"}}, "required": ["naprawa", "priorytet"]}, "description": "Priorytetowa lista wymaganych napraw", "required": true}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774277'::timestamp,
    '2025-10-20T12:04:33.774278'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    9
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    '7278807a-4f9f-4048-9b43-6c4bb2c35a43'::uuid,
    'ekstrakcja_danych_deklaracje_podatkowe',
    'Automatyczna ekstrakcja danych z faktur i dokumentów do deklaracji podatkowych',
    'extraction',
    'tax',
    '{"okres_podatkowy": {"type": "string", "description": "Okres podatkowy (np. ''2024-01'', ''2024 Q1'')", "required": true}, "nazwa_podatnika": {"type": "string", "description": "Nazwa podatnika", "required": true}, "nip_podatnika": {"type": "string", "description": "NIP (numer identyfikacji podatkowej)", "required": true}, "pozycje_przychodowe": {"type": "array", "items": {"type": "object", "properties": {"numer_faktury": {"type": "string"}, "data": {"type": "string"}, "kontrahent": {"type": "string"}, "kwota_brutto": {"type": "number"}, "kwota_netto": {"type": "number"}, "kwota_vat": {"type": "number"}, "stawka_vat": {"type": "string"}, "kategoria": {"type": "string"}}, "required": ["numer_faktury", "kwota_brutto", "kwota_netto"]}, "description": "Lista pozycji przychodowych z faktur", "required": true}, "pozycje_kosztowe": {"type": "array", "items": {"type": "object", "properties": {"numer_faktury": {"type": "string"}, "data": {"type": "string"}, "dostawca": {"type": "string"}, "opis": {"type": "string"}, "kwota_brutto": {"type": "number"}, "kwota_netto": {"type": "number"}, "kwota_vat": {"type": "number"}, "vat_do_odliczenia": {"type": "number"}, "kategoria_kosztu": {"type": "string"}}, "required": ["numer_faktury", "kwota_brutto", "kategoria_kosztu"]}, "description": "Lista pozycji kosztowych z faktur", "required": true}, "wykryte_anomalie": {"type": "array", "items": {"type": "object", "properties": {"typ_anomalii": {"type": "string"}, "dotknieta_faktura": {"type": "string"}, "opis": {"type": "string"}, "sugerowane_dzialanie": {"type": "string"}}, "required": ["typ_anomalii", "opis"]}, "description": "Wykryte anomalie lub niespójności", "required": false}, "podsumowanie": {"type": "object", "properties": {"laczny_przychod": {"type": "number"}, "laczne_koszty": {"type": "number"}, "laczny_vat_nalezny": {"type": "number"}, "laczny_vat_naliczony": {"type": "number"}, "saldo_vat": {"type": "number"}}, "description": "Podsumowanie wyodrębnionych danych", "required": true}, "wynik_jakosci_danych": {"type": "integer", "description": "Wynik jakości danych (0-100)", "required": false}, "pozycje_wymagajace_weryfikacji": {"type": "array", "items": {"type": "object", "properties": {"odniesienie_pozycji": {"type": "string"}, "powod": {"type": "string"}}, "required": ["odniesienie_pozycji", "powod"]}, "description": "Pozycje oznaczone do ręcznej weryfikacji", "required": false}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774290'::timestamp,
    '2025-10-20T12:04:33.774291'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    9
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    '1bb5d545-6c56-4a7d-a597-7b8a36191cf8'::uuid,
    'benchmarking_optymalizacja_podatkowa',
    'Benchmarking podatkowy względem branży i rekomendacje optymalizacyjne',
    'extraction',
    'tax',
    '{"nazwa_przedsiebiorstwa": {"type": "string", "description": "Nazwa analizowanego przedsiębiorstwa", "required": true}, "sektor_branzowy": {"type": "string", "description": "Klasyfikacja sektora branżowego", "required": true}, "roczny_przychod": {"type": "number", "description": "Roczny przychód w PLN", "required": true}, "wielkosc_przedsiebiorstwa": {"type": "string", "description": "Kategoria wielkości przedsiębiorstwa (mikro, mała, średnia, duża)", "required": true}, "aktualne_wskazniki_podatkowe": {"type": "object", "properties": {"efektywna_stopa_podatkowa": {"type": "number"}, "zaplacony_cit": {"type": "number"}, "efektywnosc_vat": {"type": "number"}, "laczne_obciazenie_podatkowe": {"type": "number"}}, "description": "Aktualne wskaźniki podatkowe przedsiębiorstwa", "required": true}, "benchmarki_branzowe": {"type": "object", "properties": {"srednia_efektywna_stopa": {"type": "number"}, "mediana_efektywnej_stopy": {"type": "number"}, "percentyl_25": {"type": "number"}, "percentyl_75": {"type": "number"}}, "description": "Statystyki benchmarkowe branży", "required": true}, "porownanie_z_branza": {"type": "string", "description": "Jak przedsiębiorstwo wypada względem branży (powyżej średniej, poniżej średniej, itp.)", "required": true}, "zidentyfikowane_oszczednosci": {"type": "number", "description": "Łączne potencjalne oszczędności podatkowe zidentyfikowane (PLN)", "required": false}, "mozliwosci_optymalizacji": {"type": "array", "items": {"type": "object", "properties": {"mozliwosc": {"type": "string"}, "szacowane_oszczednosci": {"type": "number"}, "podstawa_prawna": {"type": "string"}, "zlozon_wdrozenia": {"type": "string"}, "czas_wdrozenia": {"type": "string"}}, "required": ["mozliwosc", "szacowane_oszczednosci"]}, "description": "Zidentyfikowane możliwości optymalizacji podatkowej", "required": true}, "niewykorzystane_ulgi": {"type": "array", "items": {"type": "object", "properties": {"nazwa_ulgi": {"type": "string"}, "opis": {"type": "string"}, "szacowana_korzysc": {"type": "number"}, "kryteria_kwalifikowalnosci": {"type": "string"}}, "required": ["nazwa_ulgi", "opis"]}, "description": "Ulgi i odliczenia podatkowe obecnie niewykorzystywane", "required": false}, "rekomendacje_priorytetowe": {"type": "array", "items": {"type": "string"}, "description": "Priorytetowe rekomendacje optymalizacji podatkowej", "required": true}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774303'::timestamp,
    '2025-10-20T12:04:33.774304'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    11
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    'c0a8ab5d-d03e-482c-bf0f-56a7e511c885'::uuid,
    'analiza_komunikacji_z_urzedami',
    'Analiza historii komunikacji z organami podatkowymi i rządowymi',
    'extraction',
    'compliance',
    '{"nazwa_klienta": {"type": "string", "description": "Nazwa klienta", "required": true}, "nip_klienta": {"type": "string", "description": "NIP (numer identyfikacji podatkowej)", "required": true}, "okres_analizy": {"type": "string", "description": "Okres objęty analizą (np. ''ostatnie 5 lat'')", "required": true}, "podsumowanie_komunikacji": {"type": "object", "properties": {"laczna_liczba_komunikatow": {"type": "integer"}, "wedlug_urzedu": {"type": "object", "properties": {"urzad_skarbowy": {"type": "integer"}, "zus": {"type": "integer"}, "inne": {"type": "integer"}}}, "wedlug_typu": {"type": "object", "properties": {"zapytania": {"type": "integer"}, "zawiadomienia": {"type": "integer"}, "decyzje": {"type": "integer"}, "kary": {"type": "integer"}}}}, "description": "Statystyki podsumowujące komunikację", "required": true}, "aktualne_zobowiazania": {"type": "array", "items": {"type": "object", "properties": {"typ_zobowiazania": {"type": "string"}, "kwota": {"type": "number"}, "termin": {"type": "string"}, "status": {"type": "string"}}, "required": ["typ_zobowiazania", "status"]}, "description": "Aktualne aktywne zobowiązania podatkowe", "required": true}, "historia_sporow": {"type": "array", "items": {"type": "object", "properties": {"sygnatura_sprawy": {"type": "string"}, "kwestia": {"type": "string"}, "data_rozpoczecia": {"type": "string"}, "data_rozstrzygniecia": {"type": "string"}, "wynik": {"type": "string"}, "wplyw_finansowy": {"type": "number"}}, "required": ["kwestia", "wynik"]}, "description": "Historia sporów i ich wyników", "required": false}, "nadbiegajace_terminy": {"type": "array", "items": {"type": "object", "properties": {"data_terminu": {"type": "string"}, "wymagane_dzialanie": {"type": "string"}, "priorytet": {"type": "string"}}, "required": ["data_terminu", "wymagane_dzialanie"]}, "description": "Nadchodzące terminy i wymagane działania", "required": true}, "wykryte_niezgodnosci": {"type": "array", "items": {"type": "object", "properties": {"typ_niezgodnosci": {"type": "string"}, "opis": {"type": "string"}, "dotknięte_okresy": {"type": "array", "items": {"type": "string"}}, "rekomendowane_dzialanie": {"type": "string"}}, "required": ["typ_niezgodnosci", "opis"]}, "description": "Niespójności znalezione w deklaracjach lub komunikacji", "required": false}, "os_czasu_zgodnosci": {"type": "array", "items": {"type": "object", "properties": {"data": {"type": "string"}, "zdarzenie": {"type": "string"}, "typ_zdarzenia": {"type": "string"}}, "required": ["data", "zdarzenie"]}, "description": "Chronologiczna oś czasu wszystkich istotnych zdarzeń", "required": true}, "flagi_ryzyka": {"type": "array", "items": {"type": "string"}, "description": "Czerwone flagi lub obszary wymagające natychmiastowej uwagi", "required": false}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774319'::timestamp,
    '2025-10-20T12:04:33.774320'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    10
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    'a87bb737-e9d3-49d3-b4eb-7d0de673e763'::uuid,
    'asystent_kontroli_podatkowej',
    'Asystent do przygotowania i zarządzania kontrolami podatkowymi',
    'extraction',
    'compliance',
    '{"data_zawiadomienia_o_kontroli": {"type": "string", "description": "Data zawiadomienia o kontroli (RRRR-MM-DD)", "required": true}, "typ_kontroli": {"type": "string", "description": "Rodzaj kontroli (VAT, CIT, ceny transferowe, kompleksowa)", "required": true}, "zakres_kontroli": {"type": "string", "description": "Opis zakresu kontroli i obszarów objętych badaniem", "required": true}, "okres_kontroli": {"type": "string", "description": "Kontrolowany okres (np. ''2022-2023'')", "required": true}, "organ_kontrolujacy": {"type": "string", "description": "Nazwa i lokalizacja kontrolującego urzędu skarbowego", "required": true}, "obszary_badania": {"type": "array", "items": {"type": "string"}, "description": "Konkretne obszary lub transakcje objęte badaniem", "required": true}, "analiza_ryzyka": {"type": "object", "properties": {"prawdopodobne_obszary_zainteresowania": {"type": "array", "items": {"type": "string"}}, "potencjalne_problemy": {"type": "array", "items": {"type": "string"}}, "poziom_ryzyka": {"type": "string"}}, "description": "Analiza ryzyk kontroli na podstawie zawiadomienia i danych historycznych", "required": true}, "dane_podobnych_kontroli": {"type": "object", "properties": {"typowe_problemy": {"type": "array", "items": {"type": "string"}}, "typowy_czas_trwania": {"type": "string"}, "srednia_korekta": {"type": "number"}}, "description": "Dane z podobnych kontroli dla kontekstu", "required": false}, "dokumenty_do_przygotowania": {"type": "array", "items": {"type": "object", "properties": {"typ_dokumentu": {"type": "string"}, "priorytet": {"type": "string"}, "status": {"type": "string"}, "uwagi": {"type": "string"}}, "required": ["typ_dokumentu", "priorytet"]}, "description": "Lista kontrolna dokumentów do przygotowania na kontrolę", "required": true}, "strategia_obrony": {"type": "object", "properties": {"kluczowe_argumenty": {"type": "array", "items": {"type": "string"}}, "dokumentacja_wspomagajaca": {"type": "array", "items": {"type": "string"}}, "potencjalne_slabosci": {"type": "array", "items": {"type": "string"}}}, "description": "Rekomendowana strategia obrony", "required": false}, "kamienie_milowe_harmonogramu": {"type": "array", "items": {"type": "object", "properties": {"kamien_milowy": {"type": "string"}, "termin": {"type": "string"}, "status": {"type": "string"}}, "required": ["kamien_milowy"]}, "description": "Kluczowe kamienie milowe i terminy podczas procesu kontroli", "required": true}, "natychmiastowe_dzialania": {"type": "array", "items": {"type": "object", "properties": {"dzialanie": {"type": "string"}, "pilnosc": {"type": "string"}, "odpowiedzialny": {"type": "string"}}, "required": ["dzialanie", "pilnosc"]}, "description": "Natychmiastowe działania do podjęcia po otrzymaniu zawiadomienia o kontroli", "required": true}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774347'::timestamp,
    '2025-10-20T12:04:33.774348'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    12
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    '652295c5-e865-44ea-b5a5-df4b11ec78de'::uuid,
    'raport_podatkowy_dla_zarzadu_inwestorow',
    'Podsumowanie wykonawcze pozycji podatkowej dla zarządu i inwestorów',
    'extraction',
    'tax',
    '{"okres_raportowy": {"type": "string", "description": "Okres raportowy (np. ''2024 Q3'', ''Rok obrotowy 2024'')", "required": true}, "nazwa_przedsiebiorstwa": {"type": "string", "description": "Nazwa przedsiębiorstwa", "required": true}, "streszczenie_wykonawcze": {"type": "string", "description": "Wysokopoziomowe podsumowanie pozycji podatkowej i kluczowych wydarzeń", "required": true}, "kluczowe_wskazniki_podatkowe": {"type": "object", "properties": {"efektywna_stopa_podatkowa": {"type": "number"}, "laczny_zaplacony_podatek": {"type": "number"}, "laczne_nalezone_zobowiazania": {"type": "number"}, "zmiana_wzgledem_poprzedniego_okresu": {"type": "number"}}, "description": "Kluczowe wskaźniki efektywności podatkowej", "required": true}, "aktualne_zobowiazania_podatkowe": {"type": "object", "properties": {"zobowiazania_biezace": {"type": "number"}, "zobowiazania_odroczone": {"type": "number"}, "zobowiazania_warunkowe": {"type": "number"}, "suma": {"type": "number"}}, "description": "Podsumowanie zobowiązań podatkowych", "required": true}, "aktualne_spory_podatkowe": {"type": "array", "items": {"type": "object", "properties": {"opis_sporu": {"type": "string"}, "kwota_ryzyka": {"type": "number"}, "status": {"type": "string"}, "oczekiwane_rozstrzygniecie": {"type": "string"}}, "required": ["opis_sporu", "status"]}, "description": "Przegląd toczących się sporów podatkowych", "required": false}, "istotne_wydarzenia": {"type": "array", "items": {"type": "object", "properties": {"wydarzenie": {"type": "string"}, "wplyw": {"type": "string"}, "efekt_finansowy": {"type": "number"}}, "required": ["wydarzenie", "wplyw"]}, "description": "Istotne wydarzenia podatkowe w okresie", "required": true}, "podsumowanie_ryzyka": {"type": "object", "properties": {"ogolny_poziom_ryzyka": {"type": "string"}, "kluczowe_ryzyka": {"type": "array", "items": {"type": "string"}}, "dzialania_mitygacyjne": {"type": "array", "items": {"type": "string"}}}, "description": "Podsumowanie ryzyk podatkowych", "required": true}, "status_zgodnosci": {"type": "object", "properties": {"wszystkie_zgloszenia_aktualne": {"type": "boolean"}, "zaleglosci": {"type": "array", "items": {"type": "string"}}, "nadbiegajace_terminy": {"type": "array", "items": {"type": "string"}}}, "description": "Przegląd statusu zgodności podatkowej", "required": true}, "porownanie_rok_do_roku": {"type": "object", "properties": {"okres_biezacy": {"type": "number"}, "okres_poprzedni": {"type": "number"}, "zmiana_kwotowa": {"type": "number"}, "zmiana_procentowa": {"type": "number"}}, "description": "Porównanie z poprzednim okresem", "required": false}, "pozycje_dzialania": {"type": "array", "items": {"type": "object", "properties": {"pozycja": {"type": "string"}, "priorytet": {"type": "string"}, "wlasciciel": {"type": "string"}, "termin": {"type": "string"}}, "required": ["pozycja", "priorytet"]}, "description": "Pozycje działania wymagające uwagi zarządu/rady", "required": false}, "perspektywy": {"type": "string", "description": "Perspektywy na przyszłość dotyczące pozycji podatkowej", "required": false}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774363'::timestamp,
    '2025-10-20T12:04:33.774364'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    12
);

INSERT INTO extraction_schemas (
    id, name, description, type, category, text, dates,
    created_at, updated_at, user_id, schema_version,
    visual_metadata, last_edited_mode, field_count
) VALUES (
    'f26208a7-6009-40b9-b570-e2f015807c78'::uuid,
    'analiza_podatkowa_smart_kontraktow',
    'Analiza podatkowa i klasyfikacja transakcji kryptowalutowych i smart kontraktów',
    'extraction',
    'tax',
    '{"typ_transakcji": {"type": "string", "description": "Rodzaj transakcji krypto (DeFi, NFT, staking, yield farming, itp.)", "required": true}, "adres_smart_kontraktu": {"type": "string", "description": "Adres blockchainowy smart kontraktu", "required": false}, "blockchain": {"type": "string", "description": "Platforma blockchainowa (Ethereum, BSC, Polygon, itp.)", "required": true}, "streszczenie_transakcji": {"type": "string", "description": "Podsumowanie w prostym języku, co robi transakcja", "required": true}, "klasyfikacja_podatkowa": {"type": "string", "description": "Polska klasyfikacja podatkowa transakcji", "required": true}, "typ_zdarzenia_podatkowego": {"type": "string", "description": "Rodzaj zdarzenia podatkowego (przychód, zysk kapitałowy, wymiana, itp.)", "required": true}, "moment_opodatkowania": {"type": "string", "description": "Kiedy powstaje obowiązek podatkowy (np. ''przy odbiorze'', ''przy roszczeniu'', ''przy sprzedaży'')", "required": true}, "stosowne_przepisy_podatkowe": {"type": "array", "items": {"type": "object", "properties": {"przepis": {"type": "string"}, "interpretacja": {"type": "string"}}, "required": ["przepis", "interpretacja"]}, "description": "Stosowne przepisy polskiego prawa podatkowego", "required": true}, "metoda_obliczania_przychodu": {"type": "string", "description": "Jak obliczyć przychód podlegający opodatkowaniu z tej transakcji", "required": true}, "metoda_wyceny": {"type": "string", "description": "Metoda wyceny aktywów krypto (np. cena rynkowa w momencie transakcji)", "required": true}, "porownywalne_precedensy": {"type": "array", "items": {"type": "object", "properties": {"opis_sprawy": {"type": "string"}, "orzeczenie": {"type": "string"}, "znaczenie": {"type": "string"}}, "required": ["opis_sprawy"]}, "description": "Podobne sprawy lub interpretacje z Polski lub zagranicy", "required": false}, "obszary_niepewnosci": {"type": "array", "items": {"type": "object", "properties": {"kwestia": {"type": "string"}, "poziom_ryzyka": {"type": "string"}, "rekomendowane_podejscie": {"type": "string"}}, "required": ["kwestia", "poziom_ryzyka"]}, "description": "Obszary niepewności prawnej i ryzyka", "required": false}, "wymogi_raportowania": {"type": "array", "items": {"type": "object", "properties": {"wymog": {"type": "string"}, "formularz": {"type": "string"}, "termin": {"type": "string"}}, "required": ["wymog"]}, "description": "Wymogi raportowania podatkowego dla tego typu transakcji", "required": true}, "potrzebna_dokumentacja": {"type": "array", "items": {"type": "string"}, "description": "Dokumentacja, która powinna być zachowana dla celów podatkowych", "required": true}, "uwagi_miedzynarodowe": {"type": "string", "description": "Uwagi dotyczące podatków transgranicznych lub międzynarodowych", "required": false}, "ocena_ryzyka": {"type": "string", "description": "Ogólna ocena ryzyka tego traktowania podatkowego (niskie, średnie, wysokie)", "required": true}, "rekomendacje": {"type": "array", "items": {"type": "string"}, "description": "Rekomendacje dotyczące traktowania podatkowego i zgodności", "required": true}}'::jsonb,
    '{}'::jsonb,
    '2025-10-20T12:04:33.774379'::timestamp,
    '2025-10-20T12:04:33.774381'::timestamp,
    NULL,
    1,
    '{}'::jsonb,
    'ai',
    17
);

-- Re-enable the trigger
ALTER TABLE extraction_schemas ENABLE TRIGGER create_schema_version_trigger;

-- Manually create version 1 records for all inserted schemas
INSERT INTO schema_versions (
    schema_id,
    version_number,
    schema_snapshot,
    field_snapshot,
    change_type,
    change_summary,
    user_id,
    session_id,
    diff_from_previous
)
SELECT
    id as schema_id,
    1 as version_number,
    text::jsonb as schema_snapshot,
    '[]'::jsonb as field_snapshot,  -- No fields for bulk import
    'bulk_import' as change_type,
    'Version 1 created via bulk_import' as change_summary,
    user_id,
    id::text as session_id,
    NULL as diff_from_previous
FROM extraction_schemas
WHERE id IN (
    'f6cbdbda-b288-4456-a76c-c17da09b6d32',
    '63d4c97c-6755-46ac-86a2-6bc8d2f026a3',
    'c8b15e59-d160-4213-84b7-3f21a4967afa',
    '69e27b4e-6100-4b74-b69b-bf214ac858d1',
    'ee89246f-0bda-47dd-8e77-408e59a64c30',
    '9ec68391-080c-427d-a516-ea49f3c77f32',
    '62462553-e52b-40c3-8c38-a0a8817e3954',
    '1b144785-f3bd-49e8-9d2b-e1553e7297fe',
    '03715c6d-0b0a-476f-9878-47a37cf9fad8',
    '7278807a-4f9f-4048-9b43-6c4bb2c35a43',
    '1bb5d545-6c56-4a7d-a597-7b8a36191cf8',
    'c0a8ab5d-d03e-482c-bf0f-56a7e511c885',
    'a87bb737-e9d3-49d3-b4eb-7d0de673e763',
    '652295c5-e865-44ea-b5a5-df4b11ec78de',
    'f26208a7-6009-40b9-b570-e2f015807c78'
);

COMMIT;

-- Wstawiono 15 schematów pomyślnie
