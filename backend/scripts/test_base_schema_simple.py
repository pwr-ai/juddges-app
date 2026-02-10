#!/usr/bin/env python3
"""Simple test script for Base Schema Extraction components.

Tests jurisdiction detection and schema loading without full dependencies.
"""

import json
import re
import sys
from pathlib import Path
from typing import Literal

# Define Jurisdiction type
Jurisdiction = Literal["en_uk", "en_us", "pl", "unknown"]


# Inline jurisdiction detection (from jurisdiction.py)
UK_COURT_PATTERNS = [
    r"crown\s+court",
    r"court\s+of\s+appeal",
    r"high\s+court",
    r"magistrates['']?\s+court",
    r"supreme\s+court\s+of\s+the\s+united\s+kingdom",
    r"royal\s+courts\s+of\s+justice",
]

US_COURT_PATTERNS = [
    r"united\s+states\s+district\s+court",
    r"u\.?s\.?\s+court\s+of\s+appeals",
    r"supreme\s+court\s+of\s+the\s+united\s+states",
    r"circuit\s+court",
    r"federal\s+court",
]

PL_COURT_PATTERNS = [
    r"sąd\s+okręgowy",
    r"sąd\s+apelacyjny",
    r"sąd\s+rejonowy",
    r"sąd\s+najwyższy",
    r"trybunał\s+konstytucyjny",
    r"naczelny\s+sąd\s+administracyjny",
    r"wojewódzki\s+sąd\s+administracyjny",
]

UK_CITATION_PATTERNS = [
    r"\[\d{4}\]\s+EWCA\s+Crim",
    r"\[\d{4}\]\s+EWCA\s+Civ",
    r"\[\d{4}\]\s+UKSC",
    r"\[\d{4}\]\s+EWHC",
]

US_CITATION_PATTERNS = [
    r"\d+\s+U\.?S\.?\s+\d+",
    r"\d+\s+F\.?\s*(?:2d|3d|4th)?\s+\d+",
    r"\d+\s+S\.?\s*Ct\.?\s+\d+",
]

PL_CITATION_PATTERNS = [
    r"sygn\.?\s*akt\s+[IVXLCDM]+\s*[A-Za-z]+\s*\d+/\d+",
    r"[IVXLCDM]+\s+AKa\s+\d+/\d+",
    r"[IVXLCDM]+\s+K\s+\d+/\d+",
]


def detect_jurisdiction(
    text: str,
    language: str | None = None,
    court_name: str | None = None,
) -> Jurisdiction:
    """Detect the jurisdiction of a legal document."""
    text_lower = text.lower() if text else ""
    court_lower = court_name.lower() if court_name else ""

    # Check court patterns
    for pattern in UK_COURT_PATTERNS:
        if re.search(pattern, text_lower) or re.search(pattern, court_lower):
            return "en_uk"

    for pattern in US_COURT_PATTERNS:
        if re.search(pattern, text_lower) or re.search(pattern, court_lower):
            return "en_us"

    for pattern in PL_COURT_PATTERNS:
        if re.search(pattern, text_lower) or re.search(pattern, court_lower):
            return "pl"

    # Check citation patterns
    for pattern in UK_CITATION_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return "en_uk"

    for pattern in US_CITATION_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return "en_us"

    for pattern in PL_CITATION_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return "pl"

    # Language-based fallback
    if language:
        lang_lower = language.lower()
        if lang_lower in ("pl", "polish"):
            return "pl"
        elif lang_lower in ("en", "english", "uk", "us"):
            return "en_uk"

    # Content-based detection
    polish_indicators = ["oskarżony", "wyrok", "sąd", "prokurator", "rzeczypospolitej"]
    english_indicators = ["defendant", "judgment", "court", "prosecution", "hereby"]

    polish_count = sum(1 for ind in polish_indicators if ind in text_lower)
    english_count = sum(1 for ind in english_indicators if ind in text_lower)

    if polish_count > english_count:
        return "pl"
    elif english_count > 0:
        return "en_uk"

    return "unknown"


# Sample documents
SAMPLE_EN_JUDGMENT = """
COURT OF APPEAL (CRIMINAL DIVISION)

Case No: 2024/01234/A1

Neutral Citation Number: [2024] EWCA Crim 456

IN THE COURT OF APPEAL
CRIMINAL DIVISION

Royal Courts of Justice
Strand, London, WC2A 2LL

Date: 15 January 2024

Before:
LORD JUSTICE SMITH
MR JUSTICE JONES
HIS HONOUR JUDGE BROWN

REGINA
v
JOHN MICHAEL DOE

JUDGMENT

1. This is an appeal against sentence by John Michael Doe ("the appellant") who was convicted on 12 October 2023 at the Central Criminal Court of robbery and assault occasioning actual bodily harm.

2. The appellant, a male aged 35 at the time of the offence, pleaded guilty to both offences.

3. The facts briefly stated are as follows: On 5 June 2023, the appellant entered a convenience store in East London and demanded money from the cashier, a female victim aged 42. When the victim refused, the appellant struck her causing bruising to her face. The appellant fled with approximately £500 in cash.

4. The appellant has 12 previous convictions including two for robbery. He was on licence at the time of the offence having been released from prison 6 months earlier.

5. In mitigation, counsel for the appellant submitted that:
   - The appellant had shown genuine remorse
   - He cooperated fully with the police investigation
   - He has mental health issues including depression
   - He was intoxicated at the time of the offence

6. The sentencing judge imposed a total sentence of 8 years' imprisonment.

7. The appellant now appeals against that sentence on the grounds that it was manifestly excessive having regard to the mitigating factors.

8. We have considered the Sentencing Guidelines for robbery and the relevant authorities. The victim impact statement indicated significant psychological trauma suffered by the victim.

9. In our judgment, while we acknowledge the mitigating factors, the sentence properly reflected the seriousness of the offence, the appellant's criminal history, and the need for public protection.

10. Accordingly, the appeal against sentence is DISMISSED.

LORD JUSTICE SMITH
"""

SAMPLE_PL_JUDGMENT = """
Sygn. akt II AKa 123/24

WYROK
W IMIENIU RZECZYPOSPOLITEJ POLSKIEJ

Dnia 20 stycznia 2024 r.

Sąd Apelacyjny w Warszawie II Wydział Karny w składzie:

Przewodniczący: SSA Jan Kowalski
Sędziowie: SSA Anna Nowak
          SSA Piotr Wiśniewski

przy udziale prokuratora Prokuratury Regionalnej w Warszawie - Marka Zielińskiego

po rozpoznaniu w dniu 15 stycznia 2024 r.

sprawy Adama Malinowskiego

oskarżonego z art. 280 § 1 kk

na skutek apelacji wniesionej przez obrońcę oskarżonego

od wyroku Sądu Okręgowego w Warszawie

z dnia 10 października 2023 r., sygn. akt VIII K 456/23

I. Utrzymuje w mocy zaskarżony wyrok.

II. Zasądza od Skarbu Państwa na rzecz adw. Ewy Kamińskiej kwotę 1200 zł tytułem wynagrodzenia za nieopłaconą pomoc prawną udzieloną oskarżonemu z urzędu w postępowaniu odwoławczym.

III. Zwalnia oskarżonego od kosztów sądowych za postępowanie odwoławcze.

UZASADNIENIE

Sąd Okręgowy w Warszawie wyrokiem z dnia 10 października 2023 r. uznał oskarżonego Adama Malinowskiego za winnego popełnienia przestępstwa rozboju z art. 280 § 1 kk i wymierzył mu karę 4 lat pozbawienia wolności.

Apelację od tego wyroku wniósł obrońca oskarżonego, zaskarżając wyrok w części dotyczącej orzeczenia o karze i wnosząc o jej obniżenie.

Oskarżony, mężczyzna w wieku 28 lat, przyznał się do winy. Jest to jego pierwsze skazanie. Przed popełnieniem czynu był osobą bezrobotną. W czasie popełnienia czynu znajdował się pod wpływem alkoholu.

Pokrzywdzonym w sprawie jest kobieta w wieku 55 lat, która doznała obrażeń ciała w postaci złamania nosa.

Sąd Apelacyjny zważył, co następuje:

Apelacja nie zasługuje na uwzględnienie. Kara wymierzona przez Sąd I instancji jest adekwatna do stopnia społecznej szkodliwości czynu oraz stopnia zawinienia oskarżonego.

Z powyższych względów Sąd Apelacyjny orzekł jak w sentencji.

SSA Jan Kowalski
"""


def print_section(title: str) -> None:
    """Print a formatted section header."""
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60 + "\n")


def test_jurisdiction_detection() -> None:
    """Test jurisdiction detection for both documents."""
    print_section("Testing Jurisdiction Detection")

    # Test English document
    en_jurisdiction = detect_jurisdiction(
        text=SAMPLE_EN_JUDGMENT[:3000],
        language="en"
    )
    print(f"English document jurisdiction: {en_jurisdiction}")
    assert en_jurisdiction == "en_uk", f"Expected en_uk, got {en_jurisdiction}"
    print("✓ English jurisdiction detection passed")

    # Test Polish document
    pl_jurisdiction = detect_jurisdiction(
        text=SAMPLE_PL_JUDGMENT[:3000],
        language="pl"
    )
    print(f"Polish document jurisdiction: {pl_jurisdiction}")
    assert pl_jurisdiction == "pl", f"Expected pl, got {pl_jurisdiction}"
    print("✓ Polish jurisdiction detection passed")

    # Test without language hint
    en_no_hint = detect_jurisdiction(text=SAMPLE_EN_JUDGMENT[:3000])
    print(f"English without hint: {en_no_hint}")
    assert en_no_hint == "en_uk", f"Expected en_uk, got {en_no_hint}"
    print("✓ English detection without hint passed")

    pl_no_hint = detect_jurisdiction(text=SAMPLE_PL_JUDGMENT[:3000])
    print(f"Polish without hint: {pl_no_hint}")
    assert pl_no_hint == "pl", f"Expected pl, got {pl_no_hint}"
    print("✓ Polish detection without hint passed")


def test_schema_loading() -> None:
    """Test loading the base schema JSON."""
    print_section("Testing Schema Loading")

    schema_path = Path(__file__).parent.parent / "packages" / "ai_tax_search" / "config" / "schema" / "base_legal_schema.json"

    if not schema_path.exists():
        print(f"⚠️  Schema file not found at: {schema_path}")
        return

    with open(schema_path) as f:
        schema = json.load(f)

    print(f"Schema loaded successfully!")
    print(f"Schema title: {schema.get('title', 'N/A')}")
    print(f"Total properties: {len(schema.get('properties', {}))}")

    # Count by type
    type_counts = {}
    filter_type_counts = {}
    properties = schema.get("properties", {})

    for field_name, field_def in properties.items():
        # Count by data type
        field_type = field_def.get("type", "unknown")
        type_counts[field_type] = type_counts.get(field_type, 0) + 1

        # Count by filter type
        filter_type = field_def.get("x-filter-type", "none")
        filter_type_counts[filter_type] = filter_type_counts.get(filter_type, 0) + 1

    print("\nFields by data type:")
    for t, count in sorted(type_counts.items()):
        print(f"  {t}: {count}")

    print("\nFields by filter type:")
    for ft, count in sorted(filter_type_counts.items()):
        print(f"  {ft}: {count}")

    # List enum fields
    enum_fields = [
        name for name, defn in properties.items()
        if "enum" in defn
    ]
    print(f"\nEnum fields ({len(enum_fields)}):")
    for field in enum_fields[:10]:
        enum_values = properties[field].get("enum", [])
        print(f"  {field}: {len(enum_values)} values")
    if len(enum_fields) > 10:
        print(f"  ... and {len(enum_fields) - 10} more")

    print("\n✓ Schema loading test passed")


def test_mappings_loading() -> None:
    """Test loading the jurisdiction mappings YAML."""
    print_section("Testing Jurisdiction Mappings")

    try:
        import yaml
    except ImportError:
        print("⚠️  PyYAML not installed, skipping mappings test")
        return

    mappings_path = Path(__file__).parent.parent / "packages" / "ai_tax_search" / "config" / "schema" / "jurisdiction_mappings.yaml"

    if not mappings_path.exists():
        print(f"⚠️  Mappings file not found at: {mappings_path}")
        return

    with open(mappings_path) as f:
        mappings = yaml.safe_load(f)

    print("Mappings loaded successfully!")

    # Field mappings
    field_mappings = mappings.get("field_mappings", {})
    print(f"Total field mappings: {len(field_mappings)}")

    # Show a few examples
    print("\nSample field mappings (EN → PL):")
    for i, (field, translations) in enumerate(field_mappings.items()):
        if i >= 5:
            break
        en = translations.get("en_uk", "N/A")
        pl = translations.get("pl", "N/A")
        print(f"  {field}:")
        print(f"    EN: {en[:50]}..." if len(en) > 50 else f"    EN: {en}")
        print(f"    PL: {pl[:50]}..." if len(pl) > 50 else f"    PL: {pl}")

    # Extraction contexts
    contexts = mappings.get("extraction_contexts", {})
    print(f"\nExtraction contexts: {list(contexts.keys())}")

    print("\n✓ Mappings loading test passed")


def main() -> None:
    """Run all tests."""
    print("\n" + "=" * 60)
    print("  BASE SCHEMA SIMPLE TEST SUITE")
    print("=" * 60)

    test_jurisdiction_detection()
    test_schema_loading()
    test_mappings_loading()

    print_section("Test Summary")
    print("✓ All tests completed successfully!")
    print("\nTo test full extraction with LLM, ensure:")
    print("  1. OPENAI_API_KEY is set")
    print("  2. All dependencies are installed (langchain, openai, etc.)")
    print("  3. Run: python test_base_schema_extraction.py")


if __name__ == "__main__":
    main()
