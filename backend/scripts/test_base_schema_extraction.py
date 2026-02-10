#!/usr/bin/env python3
"""Test script for Base Schema Extraction.

Tests the extraction pipeline with sample EN and PL legal documents.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

# Add the package to path
sys.path.insert(0, str(Path(__file__).parent.parent / "packages" / "ai_tax_search"))

from ai_tax_search.info_extraction.base_schema_extractor import BaseSchemaExtractor
from ai_tax_search.info_extraction.jurisdiction import detect_jurisdiction, Jurisdiction


# Sample English judgment text (UK Court of Appeal style)
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

# Sample Polish judgment text (Sąd Apelacyjny style)
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


async def test_jurisdiction_detection() -> None:
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


async def test_extraction(document_text: str, document_name: str, expected_jurisdiction: str) -> dict:
    """Test extraction on a single document."""
    print_section(f"Extracting from {document_name}")

    extractor = BaseSchemaExtractor()

    # Run extraction
    extracted_data, jurisdiction = await extractor.extract(
        document_text=document_text,
    )

    print(f"Detected jurisdiction: {jurisdiction}")
    assert jurisdiction == expected_jurisdiction, f"Expected {expected_jurisdiction}, got {jurisdiction}"

    # Validate extraction
    is_valid, errors = extractor.validate_extraction(extracted_data)

    if errors:
        print(f"Validation errors: {errors}")

    # Print extracted data
    print("\nExtracted fields:")
    for field, value in sorted(extracted_data.items()):
        if value is not None:
            # Truncate long values
            str_value = str(value)
            if len(str_value) > 80:
                str_value = str_value[:77] + "..."
            print(f"  {field}: {str_value}")

    # Count non-null fields
    non_null_count = sum(1 for v in extracted_data.values() if v is not None)
    print(f"\nTotal fields extracted: {non_null_count} / {len(extracted_data)}")

    return extracted_data


async def test_filter_config() -> None:
    """Test filter configuration generation."""
    print_section("Testing Filter Configuration")

    extractor = BaseSchemaExtractor()
    filter_config = extractor.get_filter_config()

    print(f"Total filter fields: {len(filter_config)}")

    # Group by filter type
    filter_types = {}
    for fc in filter_config:
        ft = fc["filter_type"]
        if ft not in filter_types:
            filter_types[ft] = []
        filter_types[ft].append(fc["field"])

    print("\nFilter types:")
    for ft, fields in filter_types.items():
        print(f"  {ft}: {len(fields)} fields")
        for field in fields[:3]:  # Show first 3
            print(f"    - {field}")
        if len(fields) > 3:
            print(f"    ... and {len(fields) - 3} more")

    # Test facet fields
    facet_fields = extractor.get_facet_fields()
    print(f"\nFacet fields ({len(facet_fields)}):")
    for field in facet_fields[:5]:
        print(f"  - {field}")
    if len(facet_fields) > 5:
        print(f"  ... and {len(facet_fields) - 5} more")


async def main() -> None:
    """Run all extraction tests."""
    print("\n" + "=" * 60)
    print("  BASE SCHEMA EXTRACTION TEST SUITE")
    print("=" * 60)

    # Check for OpenAI API key
    if not os.environ.get("OPENAI_API_KEY"):
        print("\n⚠️  WARNING: OPENAI_API_KEY not set!")
        print("   Set it with: export OPENAI_API_KEY=your-key")
        print("   Continuing with tests that don't require API calls...\n")

        # Run non-API tests
        await test_jurisdiction_detection()
        await test_filter_config()
        print("\n✓ Non-API tests completed successfully!")
        return

    # Run all tests
    await test_jurisdiction_detection()
    await test_filter_config()

    # Test extraction on English document
    en_result = await test_extraction(
        SAMPLE_EN_JUDGMENT,
        "English UK Judgment",
        "en_uk"
    )

    # Test extraction on Polish document
    pl_result = await test_extraction(
        SAMPLE_PL_JUDGMENT,
        "Polish Judgment",
        "pl"
    )

    # Summary
    print_section("Test Summary")
    print("✓ Jurisdiction detection: PASSED")
    print("✓ Filter configuration: PASSED")
    print(f"✓ English extraction: {sum(1 for v in en_result.values() if v is not None)} fields extracted")
    print(f"✓ Polish extraction: {sum(1 for v in pl_result.values() if v is not None)} fields extracted")
    print("\nAll tests completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())
