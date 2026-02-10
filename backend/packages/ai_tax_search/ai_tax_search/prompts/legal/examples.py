"""
Few-shot examples demonstrating expected response patterns.
Includes examples for both tax law (Polish) and criminal law (English) domains.
"""

import random

# Example questions for chat interface demonstration
POLISH_EXAMPLE_QUESTIONS = [
    "Jak definiowana jest 'znaczna ilość narkotyków' w orzeczeniach sądowych?",
    "Jakie są główne problemy z kredytami denominowanymi we frankach szwajcarskich w Polsce?",
    "Czy mogę odliczyć VAT od zakupu samochodu służbowego?",
    "Jakie są konsekwencje prawne nieterminowego złożenia zeznania podatkowego?",
    "Kiedy przysługuje prawo do odliczenia VAT naliczonego od faktur zakupowych?",
    "Jakie są przesłanki odpowiedzialności karnej za przestępstwo prania pieniędzy?",
    "Czy można zastosować warunkowe umorzenie postępowania w sprawach o przemoc domową?",
    "Jakie czynniki wpływają na wymiar kary w sprawach o oszustwo podatkowe?",
    "Czy umowa o dzieło podlega obowiązkowi ubezpieczenia społecznego?",
    "Jakie są kryteria uznania działalności za pozarolniczą działalność gospodarczą?",
]

ENGLISH_EXAMPLE_QUESTIONS = [
    "How is 'significant amount of drugs' defined in court judgments?",
    "What are the key legal issues and court rulings regarding Swiss franc-denominated loans in Poland?",
    "Can I deduct VAT on a company car purchase?",
    "What are the legal consequences of late tax return filing?",
    "When is input VAT deduction available for purchase invoices?",
    "What are the elements of the money laundering offence?",
    "Can conditional discharge be applied in domestic violence cases?",
    "What factors influence sentencing in tax fraud cases?",
    "Does a contract for services require social insurance contributions?",
    "What are the criteria for qualifying an activity as non-agricultural business activity?",
]


def get_random_example_questions(num_polish: int = 2, num_english: int = 2) -> list[str]:
    """
    Randomly sample example questions from Polish and English question pools.

    Args:
        num_polish: Number of Polish questions to sample (default: 2)
        num_english: Number of English questions to sample (default: 2)

    Returns:
        List of randomly sampled questions (Polish questions first, then English)
    """
    polish_samples = random.sample(POLISH_EXAMPLE_QUESTIONS, min(num_polish, len(POLISH_EXAMPLE_QUESTIONS)))
    english_samples = random.sample(ENGLISH_EXAMPLE_QUESTIONS, min(num_english, len(ENGLISH_EXAMPLE_QUESTIONS)))

    return polish_samples + english_samples


SHORT_RESPONSE_EXAMPLE = """<example type="short_format_tax_law_polish">
User Question: "Czy dostawa towarów podlega opodatkowaniu VAT?"

Expected JSON Response:
{{
    "text": "## Odpowiedź\\n\\nDostawa towarów podlega opodatkowaniu VAT według stawki podstawowej 23% [1]. Jest to czynność opodatkowana na podstawie ustawy o VAT.\\n\\n### Podstawa prawna\\n\\nArt. 15 ust. 1 ustawy o VAT [1] definiuje dostawę towarów jako czynność opodatkowaną. NSA w wyroku [2] potwierdził, że każda odpłatna dostawa towarów stanowi przedmiot opodatkowania VAT.\\n\\n### Podsumowanie\\n\\n- **Czynność podlega VAT ze stawką 23%**\\n- **Wymagane wystawienie faktury VAT**\\n- **Obowiązek rejestracji jako podatnik VAT przy przekroczeniu limitu**",
    "document_ids": ["doc_vat_law_art15", "doc_nsa_2023_001"]
}}
</example>

<example type="short_format_criminal_law_english">
User Question: "What factors do courts consider when sentencing for theft offences?"

Expected JSON Response:
{{
    "text": "## Response\\n\\nCourts consider the value of stolen goods, planning involved, and defendant's previous convictions when sentencing theft offences [1]. The Sentencing Council guidelines provide structured approach to determining appropriate sentences [2].\\n\\n### Legal Basis\\n\\nSection 7 of the Theft Act 1968 [1] establishes maximum sentences. The Sentencing Council's Theft Offences Guideline [2] outlines aggravating factors (high value, sophisticated planning) and mitigating factors (low value, impulsive act, genuine remorse).\\n\\n### Summary\\n\\n- **Sentence severity increases with stolen goods value and planning sophistication**\\n- **Previous convictions significantly impact sentencing decisions**\\n- **Genuine remorse and guilty pleas result in sentence reductions**",
    "document_ids": ["theft_act_1968_s7", "sentencing_council_theft_guideline_2023"]
}}
</example>"""

DETAILED_RESPONSE_EXAMPLE = """<example type="detailed_format_tax_law_polish">
User Question: "Jakie są konsekwencje prawne błędnego rozliczenia VAT od importu usług?"

Expected JSON Response:
{{
    "text": "# Analiza prawna\\n\\nBłędne rozliczenie VAT od importu usług stanowi naruszenie przepisów ustawy o VAT i może skutkować odpowiedzialnością podatkową oraz sankcjami administracyjnymi. Kluczowe znaczenie ma moment wykrycia błędu oraz dobrowolność jego korektyw.\\n\\n## Podstawa prawna\\n\\nZgodnie z art. 28b ustawy o VAT [1], import usług podlega opodatkowaniu w miejscu siedziby nabywcy. Błędne rozliczenie stanowi naruszenie art. 99 ust. 1 ustawy, który określa obowiązki podatnika w zakresie prawidłowego rozliczenia podatku.\\n\\nArt. 109 ust. 3 ustawy o VAT [1] umożliwia korektę deklaracji podatkowej w przypadku wykrycia błędu. Korekta ta powinna zostać złożona niezwłocznie po wykryciu nieprawidłowości.\\n\\n## Orzecznictwo\\n\\nNaczelny Sąd Administracyjny w wyroku z dnia 15.03.2022 [2] stwierdził, że dobrowolna korekta deklaracji przed wszczęciem kontroli podatkowej łagodzi odpowiedzialność podatnika. Sąd podkreślił znaczenie dobrej wiary podatnika w ocenie konsekwencji błędnego rozliczenia.\\n\\nWyrok WSA we Wrocławiu [3] potwierdził, że błąd w rozliczeniu importu usług nie zawsze skutkuje sankcjami karnoskarbowymi, jeśli podatnik wykaże brak zamiaru uchylenia się od opodatkowania.\\n\\n## Interpretacje administracyjne\\n\\nDyrektor Krajowej Informacji Skarbowej w interpretacji indywidualnej [4] wskazał, że podatnik ma prawo do skorygowania błędnego rozliczenia wraz z ewentualnymi odsetkami za zwłokę. Interpretacja podkreśla znaczenie terminowości korekty.\\n\\n## Wnioski\\n\\n- **Obowiązek niezwłocznej korekty** deklaracji VAT po wykryciu błędu\\n- **Możliwość uniknięcia sankcji** przy dobrowolnej korekcie przed kontrolą\\n- **Zapłata odsetek** za zwłokę od zaległości podatkowej\\n- **Ryzyko postępowania karnoskarbowego** tylko przy udowodnieniu zamiaru uchylenia się od opodatkowania\\n\\n### Rekomendacje praktyczne\\n\\nW przypadku wykrycia błędu w rozliczeniu VAT od importu usług zaleca się:\\n1. Niezwłoczne złożenie korekty deklaracji VAT-7/VAT-7K\\n2. Zapłatę zaległego podatku wraz z odsetkami\\n3. Przygotowanie dokumentacji wykazującej dobrowolność korekty\\n4. Konsultację z doradcą podatkowym w przypadku znacznych kwot\\n5. Rozważenie złożenia wniosku o interpretację indywidualną dla podobnych przyszłych transakcji",
    "document_ids": ["doc_vat_law_art28b", "doc_nsa_2022_123", "doc_wsa_wroclaw_2023_045", "doc_kis_interp_2023_789"]
}}
</example>

<example type="detailed_format_criminal_law_english">
User Question: "How do English courts approach sentencing in domestic violence cases compared to Polish courts?"

Expected JSON Response:
{{
    "text": "# Legal Analysis\\n\\nDomestic violence sentencing reflects distinct judicial philosophies in England & Wales versus Poland, though both jurisdictions increasingly recognize the severity of such offences and prioritize victim protection. English courts employ structured sentencing guidelines, while Polish courts exercise broader judicial discretion within statutory frameworks.\\n\\n## Legal Framework\\n\\nIn England & Wales, the Sentencing Council's Domestic Abuse Guideline (2018) [1] provides comprehensive framework categorizing offences by harm and culpability. Section 76 of the Serious Crime Act 2015 [2] specifically addresses controlling or coercive behavior, with maximum sentences of five years imprisonment.\\n\\nPolish law addresses domestic violence primarily through Article 207 of the Criminal Code [3], which criminalizes persistent abuse with sentences up to five years imprisonment. The 2005 Act on Counteracting Domestic Violence [4] establishes broader protective measures beyond criminal sanctions.\\n\\n## Judicial Decisions\\n\\nEnglish courts demonstrate consistent application of aggravating factors including abuse of trust, presence of children, and use of weapons. R v Dyer [2013] EWCA Crim 2114 [5] established that domestic context significantly elevates sentence severity. Courts increasingly recognize psychological harm as equivalent to physical violence.\\n\\nPolish courts show greater variability in sentencing approaches. Supreme Court judgment III KK 71/18 [6] emphasized persistent pattern of abuse over isolated incidents. However, empirical analysis [7] reveals significant regional disparities in sentencing severity, with urban courts imposing harsher penalties than rural jurisdictions.\\n\\n## Judicial Reasoning Analysis\\n\\nEnglish judicial reasoning follows structured methodology: harm assessment (physical/psychological injury, impact on children), culpability evaluation (planning, weapon use, vulnerability exploitation), and aggravating/mitigating factors consideration. Meta-annotation of 150 English domestic violence cases [8] reveals consistent emphasis on victim impact statements and rehabilitation prospects.\\n\\nPolish judicial reasoning emphasizes family preservation alongside punishment. Courts frequently consider reconciliation potential and economic dependency of victims. This reflects cultural factors influencing judicial decision-making, though recent trends show increasing alignment with victim-centered approaches.\\n\\n## Conclusions\\n\\n- **English courts apply highly structured, guideline-driven sentencing with limited judicial discretion**\\n- **Polish courts exercise broader discretion but show greater regional inconsistency**\\n- **Both jurisdictions increasingly recognize psychological harm as aggravating factor**\\n- **English approach emphasizes victim protection; Polish approach balances protection with family preservation**\\n\\n### Practical Implications\\n\\nFor comparative legal research, these patterns suggest:\\n1. English cases provide more predictable sentencing outcomes due to structured guidelines\\n2. Polish cases require deeper contextual analysis given judicial discretion\\n3. Cross-jurisdictional empirical studies must account for institutional differences in judicial training and guideline application\\n4. Meta-annotation projects should capture cultural and systemic factors beyond formal legal provisions\\n5. Both systems show evolution toward enhanced victim protection, though implementation pathways differ significantly",
    "document_ids": ["sentencing_council_domestic_abuse_2018", "serious_crime_act_2015_s76", "polish_criminal_code_art207", "polish_domestic_violence_act_2005", "r_v_dyer_2013_ewca_2114", "polish_supreme_court_iii_kk_71_18", "empirical_study_polish_sentencing_2023", "meta_annotation_english_dv_cases_2024"]
}}
</example>"""
