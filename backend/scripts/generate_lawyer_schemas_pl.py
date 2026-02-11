#!/usr/bin/env python3
"""
Generowanie 15 szczegółowych schematów ekstrakcji dla prawników i doradców podatkowych.
Wszystkie opisy w języku polskim.
"""

import json
import uuid
from datetime import datetime
from typing import Any

from rich.console import Console
from rich.table import Table

console = Console()


def create_schema_definition(
    name: str,
    description: str,
    category: str,
    properties: dict[str, Any],
) -> dict[str, Any]:
    """Tworzenie standardowej definicji schematu w wewnętrznym formacie YAML."""
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "description": description,
        "type": "extraction",
        "category": category,
        "text": properties,
        "dates": {},
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "user_id": None,
        "schema_version": 1,
        "visual_metadata": {},
        "last_edited_mode": "ai",
        "field_count": len(properties),
    }


# Schema 1: Podobne sprawy i precedensy
SCHEMA_1_SIMILAR_CASES = create_schema_definition(
    name="podobne_sprawy_precedensy",
    description="Wyszukiwanie podobnych spraw i precedensów prawnych do researchu sprawy",
    category="litigation",
    properties={
        "streszczenie_sprawy": {
            "type": "string",
            "description": "Krótkie streszczenie stanu faktycznego i kwestii prawnych",
            "required": True,
        },
        "problem_prawny": {
            "type": "string",
            "description": "Główne pytanie prawne lub sporna kwestia",
            "required": True,
        },
        "poziom_sadu": {
            "type": "string",
            "description": "Poziom sądu (np. NSA, WSA, Sąd Okręgowy, Sąd Rejonowy)",
            "required": False,
        },
        "izba_wydzial": {
            "type": "string",
            "description": "Izba lub wydział sądu, który rozpoznawał sprawę",
            "required": False,
        },
        "data_orzeczenia": {
            "type": "string",
            "description": "Data wydania orzeczenia (RRRR-MM-DD)",
            "required": False,
        },
        "sygnatura_sprawy": {
            "type": "string",
            "description": "Sygnatura akt sprawy",
            "required": False,
        },
        "wynik_sprawy": {
            "type": "string",
            "description": "Rozstrzygnięcie (np. 'uwzględniono', 'oddalono', 'uwzględniono częściowo')",
            "required": True,
        },
        "kluczowe_argumenty": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Kluczowe argumenty prawne, które okazały się skuteczne w sprawie",
            "required": True,
        },
        "podstawa_prawna": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Przywołane przepisy prawne (np. 'art. 15 ustawy o VAT')",
            "required": True,
        },
        "wartosc_precedensowa": {
            "type": "string",
            "description": "Ocena wartości precedensowej (wysoka, średnia, niska)",
            "required": False,
        },
        "id_podobnych_spraw": {
            "type": "array",
            "items": {"type": "string"},
            "description": "ID lub sygnatury podobnych spraw wymienionych w orzeczeniu",
            "required": False,
        },
    },
)

# Schema 2: Prognozowanie wyniku sprawy
SCHEMA_2_OUTCOME_PREDICTION = create_schema_definition(
    name="prognoza_wyniku_sprawy",
    description="Analiza predykcyjna szacująca wynik sprawy i czas trwania postępowania",
    category="litigation",
    properties={
        "typ_sprawy": {
            "type": "string",
            "description": "Rodzaj sprawy (np. spór podatkowy, odwołanie administracyjne)",
            "required": True,
        },
        "kwota_sporna": {
            "type": "number",
            "description": "Kwota będąca przedmiotem sporu (w PLN)",
            "required": False,
        },
        "poziom_sadu": {
            "type": "string",
            "description": "Poziom sądu, w którym będzie rozpoznawana sprawa",
            "required": True,
        },
        "okolicznosci_faktyczne": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Kluczowe okoliczności faktyczne wpływające na sprawę",
            "required": True,
        },
        "czynniki_korzystne": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Czynniki przemawiające za stanowiskiem klienta",
            "required": True,
        },
        "czynniki_niekorzystne": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Czynniki mogące osłabić pozycję klienta",
            "required": True,
        },
        "szacowane_prawdopodobienstwo_wygranej": {
            "type": "string",
            "description": "Szacowane prawdopodobieństwo sukcesu (np. '65-75%')",
            "required": False,
        },
        "szacowany_czas_trwania_miesiace": {
            "type": "integer",
            "description": "Szacowany czas trwania sprawy w miesiącach",
            "required": False,
        },
        "kluczowe_argumenty_prawne": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Najważniejsze argumenty prawne do przedstawienia",
            "required": True,
        },
        "wyniki_podobnych_spraw": {
            "type": "string",
            "description": "Wzorzec rozstrzygnięć w podobnych sprawach",
            "required": False,
        },
        "rekomendacja": {
            "type": "string",
            "description": "Rekomendacja strategiczna (kontynuować, ugoda, negocjacje)",
            "required": False,
        },
    },
)

# Schema 3: Due diligence podatkowe przy M&A
SCHEMA_3_TAX_DUE_DILIGENCE = create_schema_definition(
    name="due_diligence_podatkowe_ma",
    description="Lista kontrolna due diligence podatkowego i ocena ryzyka przy transakcjach M&A",
    category="tax",
    properties={
        "nazwa_przedsiebiorstwa": {
            "type": "string",
            "description": "Nazwa przejmowanego przedsiębiorstwa",
            "required": True,
        },
        "nip_przedsiebiorstwa": {
            "type": "string",
            "description": "NIP (numer identyfikacji podatkowej)",
            "required": True,
        },
        "okres_przegladu": {
            "type": "string",
            "description": "Okres objęty due diligence (np. '2020-2024')",
            "required": True,
        },
        "zaleglosci_podatkowe": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rodzaj_podatku": {"type": "string"},
                    "kwota": {"type": "number"},
                    "status": {"type": "string"},
                },
                "required": ["rodzaj_podatku", "kwota"],
            },
            "description": "Lista zaległości i zobowiązań podatkowych",
            "required": True,
        },
        "toczace_sie_spory_podatkowe": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "numer_sprawy": {"type": "string"},
                    "kwota_sporna": {"type": "number"},
                    "opis_problemu": {"type": "string"},
                    "etap_postepowania": {"type": "string"},
                },
                "required": ["opis_problemu"],
            },
            "description": "Aktywne spory podatkowe i ich status",
            "required": True,
        },
        "interpretacje_podatkowe": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "numer_interpretacji": {"type": "string"},
                    "kwestia": {"type": "string"},
                    "status_waznosci": {"type": "string"},
                    "data_wygasniecia": {"type": "string"},
                },
                "required": ["kwestia", "status_waznosci"],
            },
            "description": "Interpretacje podatkowe uzyskane przez przedsiębiorstwo",
            "required": False,
        },
        "zidentyfikowane_ryzyka": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rodzaj_ryzyka": {"type": "string"},
                    "opis": {"type": "string"},
                    "szacowana_ekspozycja": {"type": "number"},
                    "prawdopodobienstwo": {"type": "string"},
                    "mitygacja": {"type": "string"},
                },
                "required": ["rodzaj_ryzyka", "opis"],
            },
            "description": "Zidentyfikowane ryzyka podatkowe i potencjalne zobowiązania",
            "required": True,
        },
        "zgodnosc_cen_transferowych": {
            "type": "object",
            "properties": {
                "czy_ma_dokumentacje": {"type": "boolean"},
                "ocena_kompletnosci": {"type": "string"},
                "zidentyfikowane_luki": {"type": "array", "items": {"type": "string"}},
            },
            "description": "Status dokumentacji cen transferowych",
            "required": False,
        },
        "laczna_ekspozycja_ryzyko": {
            "type": "number",
            "description": "Łączna szacowana ekspozycja na ryzyko podatkowe w PLN",
            "required": False,
        },
        "ogolna_ocena_ryzyka": {
            "type": "string",
            "description": "Ogólna ocena ryzyka podatkowego (niskie, średnie, wysokie, krytyczne)",
            "required": True,
        },
    },
)

# Schema 4: Monitoring zmian prawnych
SCHEMA_4_LEGAL_CHANGES = create_schema_definition(
    name="monitoring_zmian_prawnych",
    description="Monitorowanie i alerty o zmianach prawnych wpływających na klientów",
    category="compliance",
    properties={
        "typ_zmiany": {
            "type": "string",
            "description": "Rodzaj zmiany prawnej (nowa ustawa, nowelizacja, orzeczenie sądowe, interpretacja)",
            "required": True,
        },
        "zrodlo": {
            "type": "string",
            "description": "Źródło zmiany (Sejm, NSA, KIS, TSUE, itp.)",
            "required": True,
        },
        "data_publikacji": {
            "type": "string",
            "description": "Data publikacji (RRRR-MM-DD)",
            "required": True,
        },
        "data_wejscia_w_zycie": {
            "type": "string",
            "description": "Data wejścia w życie zmiany (RRRR-MM-DD)",
            "required": True,
        },
        "referencja_prawna": {
            "type": "string",
            "description": "Oficjalna referencja (np. 'Ustawa z dnia...', 'Wyrok NSA...')",
            "required": True,
        },
        "dotknięte_obszary": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Obszary prawa objęte zmianą (VAT, CIT, prawo pracy, itp.)",
            "required": True,
        },
        "streszczenie_zmiany": {
            "type": "string",
            "description": "Krótkie streszczenie wprowadzonych zmian",
            "required": True,
        },
        "ocena_wplywu": {
            "type": "string",
            "description": "Ocena praktycznego wpływu (znaczący, umiarkowany, niewielki)",
            "required": True,
        },
        "dotknięci_klienci": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Rodzaje klientów objętych zmianą (firmy IT, producenci, itp.)",
            "required": True,
        },
        "wymagane_dzialanie": {
            "type": "string",
            "description": "Co klienci muszą zrobić (aktualizacja umów, złożenie deklaracji, itp.)",
            "required": False,
        },
        "termin_dzialania": {
            "type": "string",
            "description": "Termin podjęcia wymaganego działania (RRRR-MM-DD)",
            "required": False,
        },
        "powiazane_sprawy_klientow": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Sprawy lub kwestie klientów, które mogą być dotknięte",
            "required": False,
        },
    },
)

# Schema 5: Automatyczna analiza ryzyka podatkowego
SCHEMA_5_TAX_RISK_ANALYSIS = create_schema_definition(
    name="automatyczna_analiza_ryzyka_podatkowego",
    description="Automatyczna analiza profilu ryzyka podatkowego klienta",
    category="tax",
    properties={
        "nazwa_klienta": {
            "type": "string",
            "description": "Nazwa przedsiębiorstwa klienta",
            "required": True,
        },
        "nip_klienta": {
            "type": "string",
            "description": "NIP (numer identyfikacji podatkowej)",
            "required": True,
        },
        "okres_analizy": {
            "type": "string",
            "description": "Analizowany okres (np. '2024 Q1-Q4')",
            "required": True,
        },
        "zidentyfikowane_ryzyka": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kategoria_ryzyka": {"type": "string"},
                    "opis_ryzyka": {"type": "string"},
                    "poziom_powagi": {"type": "string"},
                    "potencjalna_kara": {"type": "number"},
                    "podstawa_prawna": {"type": "string"},
                    "kroki_naprawcze": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["kategoria_ryzyka", "opis_ryzyka", "poziom_powagi"],
            },
            "description": "Lista zidentyfikowanych ryzyk podatkowych",
            "required": True,
        },
        "ryzyka_vat": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kwestia": {"type": "string"},
                    "dotkniete_faktury": {"type": "integer"},
                    "kwota_ryzyka": {"type": "number"},
                },
                "required": ["kwestia"],
            },
            "description": "Ryzyka specyficzne dla VAT",
            "required": False,
        },
        "ryzyka_cen_transferowych": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kwestia": {"type": "string"},
                    "dotkniete_transakcje": {"type": "integer"},
                    "potencjalna_korekta": {"type": "number"},
                },
                "required": ["kwestia"],
            },
            "description": "Ryzyka compliance cen transferowych",
            "required": False,
        },
        "luki_w_zgodnosci": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "wymog": {"type": "string"},
                    "opis_luki": {"type": "string"},
                    "pilnosc": {"type": "string"},
                },
                "required": ["wymog", "opis_luki"],
            },
            "description": "Wymagania compliance, które nie są spełnione",
            "required": True,
        },
        "wynik_ryzyka": {
            "type": "integer",
            "description": "Ogólny wynik ryzyka (0-100)",
            "required": False,
        },
        "dzialania_priorytetowe": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "dzialanie": {"type": "string"},
                    "termin": {"type": "string"},
                    "priorytet": {"type": "string"},
                },
                "required": ["dzialanie", "priorytet"],
            },
            "description": "Priorytetowe działania w celu zaradzenia ryzykom",
            "required": True,
        },
    },
)

# Schema 6: Przygotowanie wniosku o interpretację podatkową
SCHEMA_6_INTERPRETATION_REQUEST = create_schema_definition(
    name="wniosek_interpretacja_podatkowa",
    description="Automatyczne przygotowanie wniosków o interpretację podatkową",
    category="tax",
    properties={
        "nazwa_podatnika": {
            "type": "string",
            "description": "Nazwa podatnika wnioskującego o interpretację",
            "required": True,
        },
        "nip_podatnika": {
            "type": "string",
            "description": "NIP (numer identyfikacji podatkowej)",
            "required": True,
        },
        "adres_podatnika": {
            "type": "string",
            "description": "Pełny adres podatnika",
            "required": True,
        },
        "stan_faktyczny": {
            "type": "string",
            "description": "Szczegółowy opis stanu faktycznego",
            "required": True,
        },
        "planowana_transakcja": {
            "type": "string",
            "description": "Opis planowanej transakcji (jeśli dotyczy)",
            "required": False,
        },
        "pytanie_prawne": {
            "type": "string",
            "description": "Konkretne pytanie prawne wymagające interpretacji",
            "required": True,
        },
        "stanowisko_podatnika": {
            "type": "string",
            "description": "Stanowisko podatnika w sprawie zastosowania prawa",
            "required": True,
        },
        "podstawa_prawna": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Przywołane przepisy prawne",
            "required": True,
        },
        "orzecznictwo_wspierajace": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sygnatura": {"type": "string"},
                    "sad": {"type": "string"},
                    "znaczenie": {"type": "string"},
                },
                "required": ["sygnatura"],
            },
            "description": "Orzeczenia sądowe wspierające stanowisko podatnika",
            "required": False,
        },
        "podobne_interpretacje": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Podobne interpretacje wydane przez organy podatkowe",
            "required": False,
        },
        "typ_interpretacji": {
            "type": "string",
            "description": "Rodzaj interpretacji (indywidualna, ogólna)",
            "required": True,
        },
        "pilnosc": {
            "type": "string",
            "description": "Poziom pilności (standardowa, pilna)",
            "required": False,
        },
    },
)

# Schema 7: Wyszukiwarka w języku biznesowym
SCHEMA_7_BUSINESS_LANGUAGE_SEARCH = create_schema_definition(
    name="wyszukiwarka_jezyk_biznesowy",
    description="Wyszukiwarka dla nieprawników wykorzystująca prosty język biznesowy",
    category="compliance",
    properties={
        "pytanie_uzytkownika": {
            "type": "string",
            "description": "Pytanie użytkownika w prostym języku",
            "required": True,
        },
        "wyodrebniona_intencja": {
            "type": "string",
            "description": "Wyodrębniona intencja prawna z pytania",
            "required": True,
        },
        "obszar_prawny": {
            "type": "string",
            "description": "Zidentyfikowany obszar prawa (VAT, CIT, prawo pracy, itp.)",
            "required": True,
        },
        "prosta_odpowiedz": {
            "type": "string",
            "description": "Odpowiedź w prostym, biznesowym języku",
            "required": True,
        },
        "istotne_przepisy": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "przepis": {"type": "string"},
                    "wyjasnienie": {"type": "string"},
                },
                "required": ["przepis", "wyjasnienie"],
            },
            "description": "Istotne przepisy prawne z wyjaśnieniami",
            "required": True,
        },
        "przyklady": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Praktyczne przykłady ilustrujące odpowiedź",
            "required": False,
        },
        "ostrzezenia": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Ważne ostrzeżenia lub wyjątki",
            "required": False,
        },
        "poziom_zlozonosci": {
            "type": "string",
            "description": "Ocena złożoności (prosty, umiarkowany, złożony)",
            "required": True,
        },
        "wymaga_eksperta": {
            "type": "boolean",
            "description": "Czy sprawa wymaga konsultacji z ekspertem",
            "required": True,
        },
        "powod_konsultacji_eksperta": {
            "type": "string",
            "description": "Dlaczego potrzebna jest konsultacja eksperta (jeśli dotyczy)",
            "required": False,
        },
    },
)

# Schema 8: Analiza kosztów vs korzyści w sporach sądowych
SCHEMA_8_COST_BENEFIT_LITIGATION = create_schema_definition(
    name="analiza_koszt_korzysci_spory",
    description="Analiza kosztów i korzyści dla decyzji dotyczących sporów sądowych",
    category="litigation",
    properties={
        "opis_sprawy": {
            "type": "string",
            "description": "Krótki opis sprawy sądowej",
            "required": True,
        },
        "kwota_sporna": {
            "type": "number",
            "description": "Kwota sporna (PLN)",
            "required": True,
        },
        "obecny_etap": {
            "type": "string",
            "description": "Obecny etap postępowania",
            "required": True,
        },
        "szacowane_koszty": {
            "type": "object",
            "properties": {
                "oplaty_sadowe": {"type": "number"},
                "zastepstwo_prawne": {"type": "number"},
                "opinie_bieglych": {"type": "number"},
                "inne_koszty": {"type": "number"},
                "laczne_szacowane_koszty": {"type": "number"},
            },
            "description": "Rozbicie szacowanych kosztów sporu",
            "required": True,
        },
        "prawdopodobienstwo_wygranej": {
            "type": "number",
            "description": "Szacowane prawdopodobieństwo wygranej (0.0-1.0)",
            "required": True,
        },
        "szacowany_czas_miesiace": {
            "type": "integer",
            "description": "Szacowany czas trwania postępowania w miesiącach",
            "required": True,
        },
        "mozliwe_wyniki": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "wynik": {"type": "string"},
                    "prawdopodobienstwo": {"type": "number"},
                    "efekt_finansowy": {"type": "number"},
                },
                "required": ["wynik", "prawdopodobienstwo"],
            },
            "description": "Możliwe wyniki sprawy z prawdopodobieństwami",
            "required": True,
        },
        "wartosc_oczekiwana": {
            "type": "number",
            "description": "Kalkulacja wartości oczekiwanej (wynik ważony prawdopodobieństwem)",
            "required": True,
        },
        "opcje_ugody": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kwota_ugody": {"type": "number"},
                    "realnosc": {"type": "string"},
                    "korzysc_netto": {"type": "number"},
                },
                "required": ["kwota_ugody"],
            },
            "description": "Potencjalne opcje ugody",
            "required": False,
        },
        "rekomendacja": {
            "type": "string",
            "description": "Rekomendacja strategiczna (kontynuować, ugoda, negocjacje)",
            "required": True,
        },
        "uzasadnienie_rekomendacji": {
            "type": "string",
            "description": "Uzasadnienie rekomendacji",
            "required": True,
        },
    },
)

# Schema 9: Sprawdzanie zgodności dokumentów
SCHEMA_9_DOCUMENT_COMPLIANCE = create_schema_definition(
    name="sprawdzanie_zgodnosci_dokumentow",
    description="Automatyczne sprawdzanie zgodności dokumentów prawnych i umów",
    category="compliance",
    properties={
        "typ_dokumentu": {
            "type": "string",
            "description": "Rodzaj dokumentu (umowa, regulamin, polityka prywatności, itp.)",
            "required": True,
        },
        "tytul_dokumentu": {
            "type": "string",
            "description": "Tytuł lub nazwa dokumentu",
            "required": True,
        },
        "sprawdzenia_zgodnosci": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "wymog": {"type": "string"},
                    "status": {"type": "string"},
                    "szczegoly": {"type": "string"},
                    "powaznosc": {"type": "string"},
                },
                "required": ["wymog", "status"],
            },
            "description": "Lista przeprowadzonych sprawdzeń zgodności",
            "required": True,
        },
        "brakujace_klauzule": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "nazwa_klauzuli": {"type": "string"},
                    "wymog_prawny": {"type": "string"},
                    "konsekwencja": {"type": "string"},
                },
                "required": ["nazwa_klauzuli", "wymog_prawny"],
            },
            "description": "Wymagane klauzule, które są brakujące",
            "required": True,
        },
        "niewazne_klauzule": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "odniesienie_klauzuli": {"type": "string"},
                    "problem": {"type": "string"},
                    "podstawa_prawna": {"type": "string"},
                    "sugerowana_zmiana": {"type": "string"},
                },
                "required": ["odniesienie_klauzuli", "problem"],
            },
            "description": "Klauzule, które mogą być nieważne lub niewykonalne",
            "required": False,
        },
        "zgodnosc_rodo": {
            "type": "object",
            "properties": {
                "zgodny": {"type": "boolean"},
                "problemy": {"type": "array", "items": {"type": "string"}},
                "brakujace_elementy": {"type": "array", "items": {"type": "string"}},
            },
            "description": "Ocena zgodności z RODO",
            "required": False,
        },
        "problemy_ochrony_konsumentow": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "problem": {"type": "string"},
                    "przepis_prawny": {"type": "string"},
                    "rekomendacja": {"type": "string"},
                },
                "required": ["problem"],
            },
            "description": "Problemy z zakresu ochrony konsumentów",
            "required": False,
        },
        "ogolny_wynik_zgodnosci": {
            "type": "integer",
            "description": "Ogólny wynik zgodności (0-100)",
            "required": False,
        },
        "naprawy_priorytetowe": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "naprawa": {"type": "string"},
                    "priorytet": {"type": "string"},
                    "pilnosc": {"type": "string"},
                },
                "required": ["naprawa", "priorytet"],
            },
            "description": "Priorytetowa lista wymaganych napraw",
            "required": True,
        },
    },
)

# Schema 10: Ekstrakcja danych do deklaracji podatkowych
SCHEMA_10_TAX_DECLARATION_EXTRACTION = create_schema_definition(
    name="ekstrakcja_danych_deklaracje_podatkowe",
    description="Automatyczna ekstrakcja danych z faktur i dokumentów do deklaracji podatkowych",
    category="tax",
    properties={
        "okres_podatkowy": {
            "type": "string",
            "description": "Okres podatkowy (np. '2024-01', '2024 Q1')",
            "required": True,
        },
        "nazwa_podatnika": {
            "type": "string",
            "description": "Nazwa podatnika",
            "required": True,
        },
        "nip_podatnika": {
            "type": "string",
            "description": "NIP (numer identyfikacji podatkowej)",
            "required": True,
        },
        "pozycje_przychodowe": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "numer_faktury": {"type": "string"},
                    "data": {"type": "string"},
                    "kontrahent": {"type": "string"},
                    "kwota_brutto": {"type": "number"},
                    "kwota_netto": {"type": "number"},
                    "kwota_vat": {"type": "number"},
                    "stawka_vat": {"type": "string"},
                    "kategoria": {"type": "string"},
                },
                "required": ["numer_faktury", "kwota_brutto", "kwota_netto"],
            },
            "description": "Lista pozycji przychodowych z faktur",
            "required": True,
        },
        "pozycje_kosztowe": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "numer_faktury": {"type": "string"},
                    "data": {"type": "string"},
                    "dostawca": {"type": "string"},
                    "opis": {"type": "string"},
                    "kwota_brutto": {"type": "number"},
                    "kwota_netto": {"type": "number"},
                    "kwota_vat": {"type": "number"},
                    "vat_do_odliczenia": {"type": "number"},
                    "kategoria_kosztu": {"type": "string"},
                },
                "required": ["numer_faktury", "kwota_brutto", "kategoria_kosztu"],
            },
            "description": "Lista pozycji kosztowych z faktur",
            "required": True,
        },
        "wykryte_anomalie": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "typ_anomalii": {"type": "string"},
                    "dotknieta_faktura": {"type": "string"},
                    "opis": {"type": "string"},
                    "sugerowane_dzialanie": {"type": "string"},
                },
                "required": ["typ_anomalii", "opis"],
            },
            "description": "Wykryte anomalie lub niespójności",
            "required": False,
        },
        "podsumowanie": {
            "type": "object",
            "properties": {
                "laczny_przychod": {"type": "number"},
                "laczne_koszty": {"type": "number"},
                "laczny_vat_nalezny": {"type": "number"},
                "laczny_vat_naliczony": {"type": "number"},
                "saldo_vat": {"type": "number"},
            },
            "description": "Podsumowanie wyodrębnionych danych",
            "required": True,
        },
        "wynik_jakosci_danych": {
            "type": "integer",
            "description": "Wynik jakości danych (0-100)",
            "required": False,
        },
        "pozycje_wymagajace_weryfikacji": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "odniesienie_pozycji": {"type": "string"},
                    "powod": {"type": "string"},
                },
                "required": ["odniesienie_pozycji", "powod"],
            },
            "description": "Pozycje oznaczone do ręcznej weryfikacji",
            "required": False,
        },
    },
)

# Schema 11: Benchmarking i optymalizacja podatkowa
SCHEMA_11_TAX_BENCHMARKING = create_schema_definition(
    name="benchmarking_optymalizacja_podatkowa",
    description="Benchmarking podatkowy względem branży i rekomendacje optymalizacyjne",
    category="tax",
    properties={
        "nazwa_przedsiebiorstwa": {
            "type": "string",
            "description": "Nazwa analizowanego przedsiębiorstwa",
            "required": True,
        },
        "sektor_branzowy": {
            "type": "string",
            "description": "Klasyfikacja sektora branżowego",
            "required": True,
        },
        "roczny_przychod": {
            "type": "number",
            "description": "Roczny przychód w PLN",
            "required": True,
        },
        "wielkosc_przedsiebiorstwa": {
            "type": "string",
            "description": "Kategoria wielkości przedsiębiorstwa (mikro, mała, średnia, duża)",
            "required": True,
        },
        "aktualne_wskazniki_podatkowe": {
            "type": "object",
            "properties": {
                "efektywna_stopa_podatkowa": {"type": "number"},
                "zaplacony_cit": {"type": "number"},
                "efektywnosc_vat": {"type": "number"},
                "laczne_obciazenie_podatkowe": {"type": "number"},
            },
            "description": "Aktualne wskaźniki podatkowe przedsiębiorstwa",
            "required": True,
        },
        "benchmarki_branzowe": {
            "type": "object",
            "properties": {
                "srednia_efektywna_stopa": {"type": "number"},
                "mediana_efektywnej_stopy": {"type": "number"},
                "percentyl_25": {"type": "number"},
                "percentyl_75": {"type": "number"},
            },
            "description": "Statystyki benchmarkowe branży",
            "required": True,
        },
        "porownanie_z_branza": {
            "type": "string",
            "description": "Jak przedsiębiorstwo wypada względem branży (powyżej średniej, poniżej średniej, itp.)",
            "required": True,
        },
        "zidentyfikowane_oszczednosci": {
            "type": "number",
            "description": "Łączne potencjalne oszczędności podatkowe zidentyfikowane (PLN)",
            "required": False,
        },
        "mozliwosci_optymalizacji": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "mozliwosc": {"type": "string"},
                    "szacowane_oszczednosci": {"type": "number"},
                    "podstawa_prawna": {"type": "string"},
                    "zlozon_wdrozenia": {"type": "string"},
                    "czas_wdrozenia": {"type": "string"},
                },
                "required": ["mozliwosc", "szacowane_oszczednosci"],
            },
            "description": "Zidentyfikowane możliwości optymalizacji podatkowej",
            "required": True,
        },
        "niewykorzystane_ulgi": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "nazwa_ulgi": {"type": "string"},
                    "opis": {"type": "string"},
                    "szacowana_korzysc": {"type": "number"},
                    "kryteria_kwalifikowalnosci": {"type": "string"},
                },
                "required": ["nazwa_ulgi", "opis"],
            },
            "description": "Ulgi i odliczenia podatkowe obecnie niewykorzystywane",
            "required": False,
        },
        "rekomendacje_priorytetowe": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Priorytetowe rekomendacje optymalizacji podatkowej",
            "required": True,
        },
    },
)

# Schema 12: Analiza historii komunikacji z urzędami
SCHEMA_12_GOVERNMENT_COMMUNICATION = create_schema_definition(
    name="analiza_komunikacji_z_urzedami",
    description="Analiza historii komunikacji z organami podatkowymi i rządowymi",
    category="compliance",
    properties={
        "nazwa_klienta": {
            "type": "string",
            "description": "Nazwa klienta",
            "required": True,
        },
        "nip_klienta": {
            "type": "string",
            "description": "NIP (numer identyfikacji podatkowej)",
            "required": True,
        },
        "okres_analizy": {
            "type": "string",
            "description": "Okres objęty analizą (np. 'ostatnie 5 lat')",
            "required": True,
        },
        "podsumowanie_komunikacji": {
            "type": "object",
            "properties": {
                "laczna_liczba_komunikatow": {"type": "integer"},
                "wedlug_urzedu": {
                    "type": "object",
                    "properties": {
                        "urzad_skarbowy": {"type": "integer"},
                        "zus": {"type": "integer"},
                        "inne": {"type": "integer"},
                    },
                },
                "wedlug_typu": {
                    "type": "object",
                    "properties": {
                        "zapytania": {"type": "integer"},
                        "zawiadomienia": {"type": "integer"},
                        "decyzje": {"type": "integer"},
                        "kary": {"type": "integer"},
                    },
                },
            },
            "description": "Statystyki podsumowujące komunikację",
            "required": True,
        },
        "aktualne_zobowiazania": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "typ_zobowiazania": {"type": "string"},
                    "kwota": {"type": "number"},
                    "termin": {"type": "string"},
                    "status": {"type": "string"},
                },
                "required": ["typ_zobowiazania", "status"],
            },
            "description": "Aktualne aktywne zobowiązania podatkowe",
            "required": True,
        },
        "historia_sporow": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sygnatura_sprawy": {"type": "string"},
                    "kwestia": {"type": "string"},
                    "data_rozpoczecia": {"type": "string"},
                    "data_rozstrzygniecia": {"type": "string"},
                    "wynik": {"type": "string"},
                    "wplyw_finansowy": {"type": "number"},
                },
                "required": ["kwestia", "wynik"],
            },
            "description": "Historia sporów i ich wyników",
            "required": False,
        },
        "nadbiegajace_terminy": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "data_terminu": {"type": "string"},
                    "wymagane_dzialanie": {"type": "string"},
                    "priorytet": {"type": "string"},
                },
                "required": ["data_terminu", "wymagane_dzialanie"],
            },
            "description": "Nadchodzące terminy i wymagane działania",
            "required": True,
        },
        "wykryte_niezgodnosci": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "typ_niezgodnosci": {"type": "string"},
                    "opis": {"type": "string"},
                    "dotknięte_okresy": {"type": "array", "items": {"type": "string"}},
                    "rekomendowane_dzialanie": {"type": "string"},
                },
                "required": ["typ_niezgodnosci", "opis"],
            },
            "description": "Niespójności znalezione w deklaracjach lub komunikacji",
            "required": False,
        },
        "os_czasu_zgodnosci": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "data": {"type": "string"},
                    "zdarzenie": {"type": "string"},
                    "typ_zdarzenia": {"type": "string"},
                },
                "required": ["data", "zdarzenie"],
            },
            "description": "Chronologiczna oś czasu wszystkich istotnych zdarzeń",
            "required": True,
        },
        "flagi_ryzyka": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Czerwone flagi lub obszary wymagające natychmiastowej uwagi",
            "required": False,
        },
    },
)

# Schema 13: Asystent kontroli podatkowej
SCHEMA_13_TAX_AUDIT_ASSISTANT = create_schema_definition(
    name="asystent_kontroli_podatkowej",
    description="Asystent do przygotowania i zarządzania kontrolami podatkowymi",
    category="compliance",
    properties={
        "data_zawiadomienia_o_kontroli": {
            "type": "string",
            "description": "Data zawiadomienia o kontroli (RRRR-MM-DD)",
            "required": True,
        },
        "typ_kontroli": {
            "type": "string",
            "description": "Rodzaj kontroli (VAT, CIT, ceny transferowe, kompleksowa)",
            "required": True,
        },
        "zakres_kontroli": {
            "type": "string",
            "description": "Opis zakresu kontroli i obszarów objętych badaniem",
            "required": True,
        },
        "okres_kontroli": {
            "type": "string",
            "description": "Kontrolowany okres (np. '2022-2023')",
            "required": True,
        },
        "organ_kontrolujacy": {
            "type": "string",
            "description": "Nazwa i lokalizacja kontrolującego urzędu skarbowego",
            "required": True,
        },
        "obszary_badania": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Konkretne obszary lub transakcje objęte badaniem",
            "required": True,
        },
        "analiza_ryzyka": {
            "type": "object",
            "properties": {
                "prawdopodobne_obszary_zainteresowania": {"type": "array", "items": {"type": "string"}},
                "potencjalne_problemy": {"type": "array", "items": {"type": "string"}},
                "poziom_ryzyka": {"type": "string"},
            },
            "description": "Analiza ryzyk kontroli na podstawie zawiadomienia i danych historycznych",
            "required": True,
        },
        "dane_podobnych_kontroli": {
            "type": "object",
            "properties": {
                "typowe_problemy": {"type": "array", "items": {"type": "string"}},
                "typowy_czas_trwania": {"type": "string"},
                "srednia_korekta": {"type": "number"},
            },
            "description": "Dane z podobnych kontroli dla kontekstu",
            "required": False,
        },
        "dokumenty_do_przygotowania": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "typ_dokumentu": {"type": "string"},
                    "priorytet": {"type": "string"},
                    "status": {"type": "string"},
                    "uwagi": {"type": "string"},
                },
                "required": ["typ_dokumentu", "priorytet"],
            },
            "description": "Lista kontrolna dokumentów do przygotowania na kontrolę",
            "required": True,
        },
        "strategia_obrony": {
            "type": "object",
            "properties": {
                "kluczowe_argumenty": {"type": "array", "items": {"type": "string"}},
                "dokumentacja_wspomagajaca": {"type": "array", "items": {"type": "string"}},
                "potencjalne_slabosci": {"type": "array", "items": {"type": "string"}},
            },
            "description": "Rekomendowana strategia obrony",
            "required": False,
        },
        "kamienie_milowe_harmonogramu": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kamien_milowy": {"type": "string"},
                    "termin": {"type": "string"},
                    "status": {"type": "string"},
                },
                "required": ["kamien_milowy"],
            },
            "description": "Kluczowe kamienie milowe i terminy podczas procesu kontroli",
            "required": True,
        },
        "natychmiastowe_dzialania": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "dzialanie": {"type": "string"},
                    "pilnosc": {"type": "string"},
                    "odpowiedzialny": {"type": "string"},
                },
                "required": ["dzialanie", "pilnosc"],
            },
            "description": "Natychmiastowe działania do podjęcia po otrzymaniu zawiadomienia o kontroli",
            "required": True,
        },
    },
)

# Schema 14: Raport dla zarządu/inwestorów
SCHEMA_14_MANAGEMENT_REPORT = create_schema_definition(
    name="raport_podatkowy_dla_zarzadu_inwestorow",
    description="Podsumowanie wykonawcze pozycji podatkowej dla zarządu i inwestorów",
    category="tax",
    properties={
        "okres_raportowy": {
            "type": "string",
            "description": "Okres raportowy (np. '2024 Q3', 'Rok obrotowy 2024')",
            "required": True,
        },
        "nazwa_przedsiebiorstwa": {
            "type": "string",
            "description": "Nazwa przedsiębiorstwa",
            "required": True,
        },
        "streszczenie_wykonawcze": {
            "type": "string",
            "description": "Wysokopoziomowe podsumowanie pozycji podatkowej i kluczowych wydarzeń",
            "required": True,
        },
        "kluczowe_wskazniki_podatkowe": {
            "type": "object",
            "properties": {
                "efektywna_stopa_podatkowa": {"type": "number"},
                "laczny_zaplacony_podatek": {"type": "number"},
                "laczne_nalezone_zobowiazania": {"type": "number"},
                "zmiana_wzgledem_poprzedniego_okresu": {"type": "number"},
            },
            "description": "Kluczowe wskaźniki efektywności podatkowej",
            "required": True,
        },
        "aktualne_zobowiazania_podatkowe": {
            "type": "object",
            "properties": {
                "zobowiazania_biezace": {"type": "number"},
                "zobowiazania_odroczone": {"type": "number"},
                "zobowiazania_warunkowe": {"type": "number"},
                "suma": {"type": "number"},
            },
            "description": "Podsumowanie zobowiązań podatkowych",
            "required": True,
        },
        "aktualne_spory_podatkowe": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "opis_sporu": {"type": "string"},
                    "kwota_ryzyka": {"type": "number"},
                    "status": {"type": "string"},
                    "oczekiwane_rozstrzygniecie": {"type": "string"},
                },
                "required": ["opis_sporu", "status"],
            },
            "description": "Przegląd toczących się sporów podatkowych",
            "required": False,
        },
        "istotne_wydarzenia": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "wydarzenie": {"type": "string"},
                    "wplyw": {"type": "string"},
                    "efekt_finansowy": {"type": "number"},
                },
                "required": ["wydarzenie", "wplyw"],
            },
            "description": "Istotne wydarzenia podatkowe w okresie",
            "required": True,
        },
        "podsumowanie_ryzyka": {
            "type": "object",
            "properties": {
                "ogolny_poziom_ryzyka": {"type": "string"},
                "kluczowe_ryzyka": {"type": "array", "items": {"type": "string"}},
                "dzialania_mitygacyjne": {"type": "array", "items": {"type": "string"}},
            },
            "description": "Podsumowanie ryzyk podatkowych",
            "required": True,
        },
        "status_zgodnosci": {
            "type": "object",
            "properties": {
                "wszystkie_zgloszenia_aktualne": {"type": "boolean"},
                "zaleglosci": {"type": "array", "items": {"type": "string"}},
                "nadbiegajace_terminy": {"type": "array", "items": {"type": "string"}},
            },
            "description": "Przegląd statusu zgodności podatkowej",
            "required": True,
        },
        "porownanie_rok_do_roku": {
            "type": "object",
            "properties": {
                "okres_biezacy": {"type": "number"},
                "okres_poprzedni": {"type": "number"},
                "zmiana_kwotowa": {"type": "number"},
                "zmiana_procentowa": {"type": "number"},
            },
            "description": "Porównanie z poprzednim okresem",
            "required": False,
        },
        "pozycje_dzialania": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "pozycja": {"type": "string"},
                    "priorytet": {"type": "string"},
                    "wlasciciel": {"type": "string"},
                    "termin": {"type": "string"},
                },
                "required": ["pozycja", "priorytet"],
            },
            "description": "Pozycje działania wymagające uwagi zarządu/rady",
            "required": False,
        },
        "perspektywy": {
            "type": "string",
            "description": "Perspektywy na przyszłość dotyczące pozycji podatkowej",
            "required": False,
        },
    },
)

# Schema 15: Analiza smart kontraktów dla krypto/fintech
SCHEMA_15_SMART_CONTRACT_ANALYSIS = create_schema_definition(
    name="analiza_podatkowa_smart_kontraktow",
    description="Analiza podatkowa i klasyfikacja transakcji kryptowalutowych i smart kontraktów",
    category="tax",
    properties={
        "typ_transakcji": {
            "type": "string",
            "description": "Rodzaj transakcji krypto (DeFi, NFT, staking, yield farming, itp.)",
            "required": True,
        },
        "adres_smart_kontraktu": {
            "type": "string",
            "description": "Adres blockchainowy smart kontraktu",
            "required": False,
        },
        "blockchain": {
            "type": "string",
            "description": "Platforma blockchainowa (Ethereum, BSC, Polygon, itp.)",
            "required": True,
        },
        "streszczenie_transakcji": {
            "type": "string",
            "description": "Podsumowanie w prostym języku, co robi transakcja",
            "required": True,
        },
        "klasyfikacja_podatkowa": {
            "type": "string",
            "description": "Polska klasyfikacja podatkowa transakcji",
            "required": True,
        },
        "typ_zdarzenia_podatkowego": {
            "type": "string",
            "description": "Rodzaj zdarzenia podatkowego (przychód, zysk kapitałowy, wymiana, itp.)",
            "required": True,
        },
        "moment_opodatkowania": {
            "type": "string",
            "description": "Kiedy powstaje obowiązek podatkowy (np. 'przy odbiorze', 'przy roszczeniu', 'przy sprzedaży')",
            "required": True,
        },
        "stosowne_przepisy_podatkowe": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "przepis": {"type": "string"},
                    "interpretacja": {"type": "string"},
                },
                "required": ["przepis", "interpretacja"],
            },
            "description": "Stosowne przepisy polskiego prawa podatkowego",
            "required": True,
        },
        "metoda_obliczania_przychodu": {
            "type": "string",
            "description": "Jak obliczyć przychód podlegający opodatkowaniu z tej transakcji",
            "required": True,
        },
        "metoda_wyceny": {
            "type": "string",
            "description": "Metoda wyceny aktywów krypto (np. cena rynkowa w momencie transakcji)",
            "required": True,
        },
        "porownywalne_precedensy": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "opis_sprawy": {"type": "string"},
                    "orzeczenie": {"type": "string"},
                    "znaczenie": {"type": "string"},
                },
                "required": ["opis_sprawy"],
            },
            "description": "Podobne sprawy lub interpretacje z Polski lub zagranicy",
            "required": False,
        },
        "obszary_niepewnosci": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kwestia": {"type": "string"},
                    "poziom_ryzyka": {"type": "string"},
                    "rekomendowane_podejscie": {"type": "string"},
                },
                "required": ["kwestia", "poziom_ryzyka"],
            },
            "description": "Obszary niepewności prawnej i ryzyka",
            "required": False,
        },
        "wymogi_raportowania": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "wymog": {"type": "string"},
                    "formularz": {"type": "string"},
                    "termin": {"type": "string"},
                },
                "required": ["wymog"],
            },
            "description": "Wymogi raportowania podatkowego dla tego typu transakcji",
            "required": True,
        },
        "potrzebna_dokumentacja": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Dokumentacja, która powinna być zachowana dla celów podatkowych",
            "required": True,
        },
        "uwagi_miedzynarodowe": {
            "type": "string",
            "description": "Uwagi dotyczące podatków transgranicznych lub międzynarodowych",
            "required": False,
        },
        "ocena_ryzyka": {
            "type": "string",
            "description": "Ogólna ocena ryzyka tego traktowania podatkowego (niskie, średnie, wysokie)",
            "required": True,
        },
        "rekomendacje": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Rekomendacje dotyczące traktowania podatkowego i zgodności",
            "required": True,
        },
    },
)


# Kolekcja wszystkich schematów
ALL_SCHEMAS = [
    SCHEMA_1_SIMILAR_CASES,
    SCHEMA_2_OUTCOME_PREDICTION,
    SCHEMA_3_TAX_DUE_DILIGENCE,
    SCHEMA_4_LEGAL_CHANGES,
    SCHEMA_5_TAX_RISK_ANALYSIS,
    SCHEMA_6_INTERPRETATION_REQUEST,
    SCHEMA_7_BUSINESS_LANGUAGE_SEARCH,
    SCHEMA_8_COST_BENEFIT_LITIGATION,
    SCHEMA_9_DOCUMENT_COMPLIANCE,
    SCHEMA_10_TAX_DECLARATION_EXTRACTION,
    SCHEMA_11_TAX_BENCHMARKING,
    SCHEMA_12_GOVERNMENT_COMMUNICATION,
    SCHEMA_13_TAX_AUDIT_ASSISTANT,
    SCHEMA_14_MANAGEMENT_REPORT,
    SCHEMA_15_SMART_CONTRACT_ANALYSIS,
]


def save_schemas_to_json(output_file: str = "lawyer_schemas_pl.json") -> None:
    """Zapisz wszystkie schematy do pliku JSON."""
    console.print(f"[bold cyan]Zapisywanie schematów do {output_file}...[/bold cyan]")

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(ALL_SCHEMAS, f, ensure_ascii=False, indent=2)

    console.print(f"[bold green]✓ Pomyślnie zapisano {len(ALL_SCHEMAS)} schematów do {output_file}[/bold green]")


def display_schemas_table() -> None:
    """Wyświetl ładną tabelę wszystkich schematów."""
    table = Table(title="Wygenerowane schematy dla prawników i doradców podatkowych")

    table.add_column("Nr", justify="right", style="cyan", no_wrap=True)
    table.add_column("Nazwa schematu", style="magenta")
    table.add_column("Kategoria", style="green")
    table.add_column("Pola", justify="right", style="yellow")
    table.add_column("Opis", style="white")

    for i, schema in enumerate(ALL_SCHEMAS, 1):
        table.add_row(
            str(i),
            schema["name"],
            schema["category"],
            str(schema["field_count"]),
            schema["description"][:60] + "..." if len(schema["description"]) > 60 else schema["description"],
        )

    console.print(table)


def main():
    """Główny punkt wejścia skryptu."""
    import sys

    console.print("[bold cyan]Rozpoczęcie generowania schematów dla prawników i doradców podatkowych[/bold cyan]")
    console.print(f"[cyan]Liczba schematów do wygenerowania: {len(ALL_SCHEMAS)}[/cyan]\n")

    # Wyświetl schematy w ładnej tabeli
    display_schemas_table()

    # Zapisz do pliku JSON
    output_file = sys.argv[1] if len(sys.argv) > 1 else "lawyer_schemas_pl.json"
    save_schemas_to_json(output_file)

    console.print("\n[bold yellow]Aby wstawić te schematy do Supabase:[/bold yellow]")
    console.print("[yellow]Możesz użyć narzędzi Supabase MCP lub ręcznie wykonać instrukcje SQL INSERT.[/yellow]")


if __name__ == "__main__":
    main()
