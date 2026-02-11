#!/usr/bin/env python3
"""
Generate 15 comprehensive extraction schemas for lawyer and tax advisor use cases.

This script creates detailed JSON schemas for each of the practical problems
identified for legal professionals in Poland, covering everything from case
similarity search to smart contract analysis.
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
    """
    Create a standardized schema definition in internal YAML format.

    Args:
        name: Schema name (identifier)
        description: Human-readable description
        category: Category for grouping (e.g., 'litigation', 'tax', 'compliance')
        properties: Field definitions in internal format

    Returns:
        Complete schema definition ready for database insertion
    """
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "description": description,
        "type": "extraction",
        "category": category,
        "text": properties,  # Internal field format
        "dates": {},  # Date field configurations
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "user_id": None,  # System schema, no specific user
        "schema_version": 1,
        "visual_metadata": {},
        "last_edited_mode": "ai",
        "field_count": len(properties),
    }


# Schema 1: Similar Cases and Precedents
SCHEMA_1_SIMILAR_CASES = create_schema_definition(
    name="similar_cases_precedents",
    description="Finding similar cases and legal precedents for case research",
    category="litigation",
    properties={
        "case_summary": {
            "type": "string",
            "description": "Brief summary of the case facts and legal issues",
            "required": True,
        },
        "legal_issue": {
            "type": "string",
            "description": "Main legal question or issue at stake",
            "required": True,
        },
        "court_level": {
            "type": "string",
            "description": "Court level (e.g., NSA, WSA, Sąd Rejonowy)",
            "required": False,
        },
        "court_chamber": {
            "type": "string",
            "description": "Court chamber or division that heard the case",
            "required": False,
        },
        "judgment_date": {
            "type": "string",
            "description": "Date of the judgment (YYYY-MM-DD)",
            "required": False,
        },
        "case_signature": {
            "type": "string",
            "description": "Case signature/reference number",
            "required": False,
        },
        "outcome": {
            "type": "string",
            "description": "Case outcome (e.g., 'granted', 'dismissed', 'partially granted')",
            "required": True,
        },
        "key_arguments": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Key legal arguments that were successful in the case",
            "required": True,
        },
        "legal_basis": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Legal provisions cited (e.g., 'art. 15 ustawy o VAT')",
            "required": True,
        },
        "precedential_value": {
            "type": "string",
            "description": "Assessment of precedential value (high, medium, low)",
            "required": False,
        },
        "similar_case_ids": {
            "type": "array",
            "items": {"type": "string"},
            "description": "IDs or signatures of similar cases mentioned",
            "required": False,
        },
    },
)

# Schema 2: Case Outcome Prediction
SCHEMA_2_OUTCOME_PREDICTION = create_schema_definition(
    name="case_outcome_prediction",
    description="Predictive analytics for estimating case outcomes and duration",
    category="litigation",
    properties={
        "case_type": {
            "type": "string",
            "description": "Type of legal case (e.g., tax dispute, administrative appeal)",
            "required": True,
        },
        "dispute_amount": {
            "type": "number",
            "description": "Amount in dispute (in PLN)",
            "required": False,
        },
        "court_level": {
            "type": "string",
            "description": "Court level where case will be heard",
            "required": True,
        },
        "factual_circumstances": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Key factual circumstances affecting the case",
            "required": True,
        },
        "favorable_factors": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Factors that favor the client's position",
            "required": True,
        },
        "unfavorable_factors": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Factors that may weaken the client's position",
            "required": True,
        },
        "win_probability_estimate": {
            "type": "string",
            "description": "Estimated probability of success (e.g., '65-75%')",
            "required": False,
        },
        "estimated_duration_months": {
            "type": "integer",
            "description": "Estimated case duration in months",
            "required": False,
        },
        "key_legal_arguments": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Most important legal arguments to pursue",
            "required": True,
        },
        "similar_cases_outcome": {
            "type": "string",
            "description": "Pattern of outcomes in similar cases",
            "required": False,
        },
        "recommendation": {
            "type": "string",
            "description": "Strategic recommendation (proceed, settle, negotiate)",
            "required": False,
        },
    },
)

# Schema 3: Tax Due Diligence for M&A
SCHEMA_3_TAX_DUE_DILIGENCE = create_schema_definition(
    name="tax_due_diligence_ma",
    description="Tax due diligence checklist and risk assessment for M&A transactions",
    category="tax",
    properties={
        "company_name": {
            "type": "string",
            "description": "Name of the target company",
            "required": True,
        },
        "company_tax_id": {
            "type": "string",
            "description": "NIP (tax identification number)",
            "required": True,
        },
        "review_period": {
            "type": "string",
            "description": "Period covered by due diligence (e.g., '2020-2024')",
            "required": True,
        },
        "outstanding_tax_liabilities": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "tax_type": {"type": "string"},
                    "amount": {"type": "number"},
                    "status": {"type": "string"},
                },
                "required": ["tax_type", "amount"],
            },
            "description": "List of outstanding tax obligations",
            "required": True,
        },
        "pending_tax_disputes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "case_number": {"type": "string"},
                    "dispute_amount": {"type": "number"},
                    "issue_description": {"type": "string"},
                    "stage": {"type": "string"},
                },
                "required": ["issue_description"],
            },
            "description": "Active tax disputes and their status",
            "required": True,
        },
        "tax_interpretations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "interpretation_number": {"type": "string"},
                    "issue": {"type": "string"},
                    "validity_status": {"type": "string"},
                    "expiry_date": {"type": "string"},
                },
                "required": ["issue", "validity_status"],
            },
            "description": "Tax interpretations obtained by the company",
            "required": False,
        },
        "identified_risks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "risk_type": {"type": "string"},
                    "description": {"type": "string"},
                    "estimated_exposure": {"type": "number"},
                    "probability": {"type": "string"},
                    "mitigation": {"type": "string"},
                },
                "required": ["risk_type", "description"],
            },
            "description": "Identified tax risks and potential liabilities",
            "required": True,
        },
        "transfer_pricing_compliance": {
            "type": "object",
            "properties": {
                "has_documentation": {"type": "boolean"},
                "completeness_assessment": {"type": "string"},
                "gaps_identified": {"type": "array", "items": {"type": "string"}},
            },
            "description": "Transfer pricing documentation status",
            "required": False,
        },
        "total_risk_exposure": {
            "type": "number",
            "description": "Total estimated tax risk exposure in PLN",
            "required": False,
        },
        "overall_risk_rating": {
            "type": "string",
            "description": "Overall tax risk rating (low, medium, high, critical)",
            "required": True,
        },
    },
)

# Schema 4: Legal Changes Monitoring
SCHEMA_4_LEGAL_CHANGES = create_schema_definition(
    name="legal_changes_monitoring",
    description="Monitoring and alerting for legal changes affecting clients",
    category="compliance",
    properties={
        "change_type": {
            "type": "string",
            "description": "Type of legal change (new law, amendment, court ruling, interpretation)",
            "required": True,
        },
        "source": {
            "type": "string",
            "description": "Source of change (Sejm, NSA, KIS, TSUE, etc.)",
            "required": True,
        },
        "publication_date": {
            "type": "string",
            "description": "Date of publication (YYYY-MM-DD)",
            "required": True,
        },
        "effective_date": {
            "type": "string",
            "description": "Date when change becomes effective (YYYY-MM-DD)",
            "required": True,
        },
        "legal_reference": {
            "type": "string",
            "description": "Official reference (e.g., 'Ustawa z dnia...', 'Wyrok NSA...')",
            "required": True,
        },
        "affected_areas": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Legal areas affected (VAT, CIT, labor law, etc.)",
            "required": True,
        },
        "change_summary": {
            "type": "string",
            "description": "Brief summary of what changed",
            "required": True,
        },
        "impact_assessment": {
            "type": "string",
            "description": "Assessment of practical impact (major, moderate, minor)",
            "required": True,
        },
        "affected_client_types": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Types of clients affected (IT companies, manufacturers, etc.)",
            "required": True,
        },
        "action_required": {
            "type": "string",
            "description": "What clients need to do (update contracts, file declarations, etc.)",
            "required": False,
        },
        "deadline_for_action": {
            "type": "string",
            "description": "Deadline for taking required action (YYYY-MM-DD)",
            "required": False,
        },
        "related_client_cases": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Client cases or matters that may be affected",
            "required": False,
        },
    },
)

# Schema 5: Automatic Tax Risk Analysis
SCHEMA_5_TAX_RISK_ANALYSIS = create_schema_definition(
    name="automatic_tax_risk_analysis",
    description="Automated analysis of client's tax risk profile",
    category="tax",
    properties={
        "client_name": {
            "type": "string",
            "description": "Client company name",
            "required": True,
        },
        "client_tax_id": {
            "type": "string",
            "description": "NIP (tax identification number)",
            "required": True,
        },
        "analysis_period": {
            "type": "string",
            "description": "Period analyzed (e.g., '2024 Q1-Q4')",
            "required": True,
        },
        "identified_risks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "risk_category": {"type": "string"},
                    "risk_description": {"type": "string"},
                    "severity": {"type": "string"},
                    "potential_penalty": {"type": "number"},
                    "legal_basis": {"type": "string"},
                    "remediation_steps": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["risk_category", "risk_description", "severity"],
            },
            "description": "List of identified tax risks",
            "required": True,
        },
        "vat_risks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "issue": {"type": "string"},
                    "affected_invoices": {"type": "integer"},
                    "risk_amount": {"type": "number"},
                },
                "required": ["issue"],
            },
            "description": "VAT-specific risks identified",
            "required": False,
        },
        "transfer_pricing_risks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "issue": {"type": "string"},
                    "affected_transactions": {"type": "integer"},
                    "potential_adjustment": {"type": "number"},
                },
                "required": ["issue"],
            },
            "description": "Transfer pricing compliance risks",
            "required": False,
        },
        "compliance_gaps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "requirement": {"type": "string"},
                    "gap_description": {"type": "string"},
                    "urgency": {"type": "string"},
                },
                "required": ["requirement", "gap_description"],
            },
            "description": "Compliance requirements not being met",
            "required": True,
        },
        "risk_score": {
            "type": "integer",
            "description": "Overall risk score (0-100)",
            "required": False,
        },
        "priority_actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "action": {"type": "string"},
                    "deadline": {"type": "string"},
                    "priority": {"type": "string"},
                },
                "required": ["action", "priority"],
            },
            "description": "Prioritized actions to address risks",
            "required": True,
        },
    },
)

# Schema 6: Tax Interpretation Request Preparation
SCHEMA_6_INTERPRETATION_REQUEST = create_schema_definition(
    name="tax_interpretation_request",
    description="Automated preparation of tax interpretation requests",
    category="tax",
    properties={
        "taxpayer_name": {
            "type": "string",
            "description": "Name of the taxpayer requesting interpretation",
            "required": True,
        },
        "taxpayer_tax_id": {
            "type": "string",
            "description": "NIP (tax identification number)",
            "required": True,
        },
        "taxpayer_address": {
            "type": "string",
            "description": "Full address of the taxpayer",
            "required": True,
        },
        "factual_state": {
            "type": "string",
            "description": "Detailed description of the factual situation",
            "required": True,
        },
        "planned_transaction": {
            "type": "string",
            "description": "Description of planned transaction (if applicable)",
            "required": False,
        },
        "legal_question": {
            "type": "string",
            "description": "Specific legal question requiring interpretation",
            "required": True,
        },
        "taxpayer_position": {
            "type": "string",
            "description": "Taxpayer's position on how the law should be applied",
            "required": True,
        },
        "legal_basis": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Relevant legal provisions cited",
            "required": True,
        },
        "supporting_case_law": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "case_signature": {"type": "string"},
                    "court": {"type": "string"},
                    "relevance": {"type": "string"},
                },
                "required": ["case_signature"],
            },
            "description": "Court cases supporting the taxpayer's position",
            "required": False,
        },
        "similar_interpretations": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Similar tax interpretations issued by authorities",
            "required": False,
        },
        "interpretation_type": {
            "type": "string",
            "description": "Type of interpretation (individual, general)",
            "required": True,
        },
        "urgency": {
            "type": "string",
            "description": "Urgency level (standard, urgent)",
            "required": False,
        },
    },
)

# Schema 7: Business Language Search
SCHEMA_7_BUSINESS_LANGUAGE_SEARCH = create_schema_definition(
    name="business_language_search",
    description="Search engine for non-lawyers using plain business language",
    category="compliance",
    properties={
        "user_question": {
            "type": "string",
            "description": "User's question in plain language",
            "required": True,
        },
        "extracted_intent": {
            "type": "string",
            "description": "Extracted legal intent from the question",
            "required": True,
        },
        "legal_area": {
            "type": "string",
            "description": "Identified legal area (VAT, CIT, labor law, etc.)",
            "required": True,
        },
        "simple_answer": {
            "type": "string",
            "description": "Answer in plain, business-friendly language",
            "required": True,
        },
        "relevant_provisions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "provision": {"type": "string"},
                    "explanation": {"type": "string"},
                },
                "required": ["provision", "explanation"],
            },
            "description": "Relevant legal provisions with explanations",
            "required": True,
        },
        "examples": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Practical examples illustrating the answer",
            "required": False,
        },
        "warnings": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Important warnings or exceptions",
            "required": False,
        },
        "complexity_level": {
            "type": "string",
            "description": "Complexity assessment (simple, moderate, complex)",
            "required": True,
        },
        "needs_expert": {
            "type": "boolean",
            "description": "Whether the case requires expert consultation",
            "required": True,
        },
        "expert_consultation_reason": {
            "type": "string",
            "description": "Why expert consultation is needed (if applicable)",
            "required": False,
        },
    },
)

# Schema 8: Cost vs Benefit Litigation Analysis
SCHEMA_8_COST_BENEFIT_LITIGATION = create_schema_definition(
    name="cost_benefit_litigation",
    description="Cost-benefit analysis for litigation decisions",
    category="litigation",
    properties={
        "case_description": {
            "type": "string",
            "description": "Brief description of the legal case",
            "required": True,
        },
        "amount_in_dispute": {
            "type": "number",
            "description": "Amount in dispute (PLN)",
            "required": True,
        },
        "current_stage": {
            "type": "string",
            "description": "Current stage of proceedings",
            "required": True,
        },
        "estimated_costs": {
            "type": "object",
            "properties": {
                "court_fees": {"type": "number"},
                "legal_representation": {"type": "number"},
                "expert_opinions": {"type": "number"},
                "other_costs": {"type": "number"},
                "total_estimated_costs": {"type": "number"},
            },
            "description": "Breakdown of estimated litigation costs",
            "required": True,
        },
        "win_probability": {
            "type": "number",
            "description": "Estimated probability of winning (0.0-1.0)",
            "required": True,
        },
        "estimated_duration_months": {
            "type": "integer",
            "description": "Estimated duration of proceedings in months",
            "required": True,
        },
        "possible_outcomes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "outcome": {"type": "string"},
                    "probability": {"type": "number"},
                    "financial_result": {"type": "number"},
                },
                "required": ["outcome", "probability"],
            },
            "description": "Possible case outcomes with probabilities",
            "required": True,
        },
        "expected_value": {
            "type": "number",
            "description": "Expected value calculation (probability-weighted outcome)",
            "required": True,
        },
        "settlement_options": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "settlement_amount": {"type": "number"},
                    "feasibility": {"type": "string"},
                    "net_benefit": {"type": "number"},
                },
                "required": ["settlement_amount"],
            },
            "description": "Potential settlement options",
            "required": False,
        },
        "recommendation": {
            "type": "string",
            "description": "Strategic recommendation (continue, settle, negotiate)",
            "required": True,
        },
        "recommendation_rationale": {
            "type": "string",
            "description": "Reasoning behind the recommendation",
            "required": True,
        },
    },
)

# Schema 9: Document Compliance Checking
SCHEMA_9_DOCUMENT_COMPLIANCE = create_schema_definition(
    name="document_compliance_checking",
    description="Automated compliance checking for legal documents and contracts",
    category="compliance",
    properties={
        "document_type": {
            "type": "string",
            "description": "Type of document (contract, terms of service, privacy policy, etc.)",
            "required": True,
        },
        "document_title": {
            "type": "string",
            "description": "Title or name of the document",
            "required": True,
        },
        "compliance_checks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "requirement": {"type": "string"},
                    "status": {"type": "string"},
                    "details": {"type": "string"},
                    "severity": {"type": "string"},
                },
                "required": ["requirement", "status"],
            },
            "description": "List of compliance checks performed",
            "required": True,
        },
        "missing_clauses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "clause_name": {"type": "string"},
                    "legal_requirement": {"type": "string"},
                    "consequence": {"type": "string"},
                },
                "required": ["clause_name", "legal_requirement"],
            },
            "description": "Required clauses that are missing",
            "required": True,
        },
        "invalid_clauses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "clause_reference": {"type": "string"},
                    "issue": {"type": "string"},
                    "legal_basis": {"type": "string"},
                    "suggested_revision": {"type": "string"},
                },
                "required": ["clause_reference", "issue"],
            },
            "description": "Clauses that may be invalid or unenforceable",
            "required": False,
        },
        "gdpr_compliance": {
            "type": "object",
            "properties": {
                "compliant": {"type": "boolean"},
                "issues": {"type": "array", "items": {"type": "string"}},
                "missing_elements": {"type": "array", "items": {"type": "string"}},
            },
            "description": "GDPR compliance assessment",
            "required": False,
        },
        "consumer_protection_issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "issue": {"type": "string"},
                    "legal_provision": {"type": "string"},
                    "recommendation": {"type": "string"},
                },
                "required": ["issue"],
            },
            "description": "Consumer protection compliance issues",
            "required": False,
        },
        "overall_compliance_score": {
            "type": "integer",
            "description": "Overall compliance score (0-100)",
            "required": False,
        },
        "priority_fixes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "fix": {"type": "string"},
                    "priority": {"type": "string"},
                    "urgency": {"type": "string"},
                },
                "required": ["fix", "priority"],
            },
            "description": "Prioritized list of fixes needed",
            "required": True,
        },
    },
)

# Schema 10: Tax Declaration Data Extraction
SCHEMA_10_TAX_DECLARATION_EXTRACTION = create_schema_definition(
    name="tax_declaration_data_extraction",
    description="Automated data extraction from invoices and documents for tax declarations",
    category="tax",
    properties={
        "tax_period": {
            "type": "string",
            "description": "Tax period (e.g., '2024-01', '2024 Q1')",
            "required": True,
        },
        "taxpayer_name": {
            "type": "string",
            "description": "Name of the taxpayer",
            "required": True,
        },
        "taxpayer_tax_id": {
            "type": "string",
            "description": "NIP (tax identification number)",
            "required": True,
        },
        "income_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "invoice_number": {"type": "string"},
                    "date": {"type": "string"},
                    "counterparty": {"type": "string"},
                    "gross_amount": {"type": "number"},
                    "net_amount": {"type": "number"},
                    "vat_amount": {"type": "number"},
                    "vat_rate": {"type": "string"},
                    "category": {"type": "string"},
                },
                "required": ["invoice_number", "gross_amount", "net_amount"],
            },
            "description": "List of income items from invoices",
            "required": True,
        },
        "expense_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "invoice_number": {"type": "string"},
                    "date": {"type": "string"},
                    "supplier": {"type": "string"},
                    "description": {"type": "string"},
                    "gross_amount": {"type": "number"},
                    "net_amount": {"type": "number"},
                    "vat_amount": {"type": "number"},
                    "deductible_vat": {"type": "number"},
                    "expense_category": {"type": "string"},
                },
                "required": ["invoice_number", "gross_amount", "expense_category"],
            },
            "description": "List of expense items from invoices",
            "required": True,
        },
        "detected_anomalies": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "anomaly_type": {"type": "string"},
                    "affected_invoice": {"type": "string"},
                    "description": {"type": "string"},
                    "suggested_action": {"type": "string"},
                },
                "required": ["anomaly_type", "description"],
            },
            "description": "Anomalies or inconsistencies detected",
            "required": False,
        },
        "summary": {
            "type": "object",
            "properties": {
                "total_income": {"type": "number"},
                "total_expenses": {"type": "number"},
                "total_vat_input": {"type": "number"},
                "total_vat_output": {"type": "number"},
                "vat_balance": {"type": "number"},
            },
            "description": "Summary of extracted data",
            "required": True,
        },
        "data_quality_score": {
            "type": "integer",
            "description": "Data quality score (0-100)",
            "required": False,
        },
        "items_requiring_review": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "item_reference": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["item_reference", "reason"],
            },
            "description": "Items flagged for manual review",
            "required": False,
        },
    },
)

# Schema 11: Tax Benchmarking and Optimization
SCHEMA_11_TAX_BENCHMARKING = create_schema_definition(
    name="tax_benchmarking_optimization",
    description="Tax benchmarking against industry peers and optimization recommendations",
    category="tax",
    properties={
        "company_name": {
            "type": "string",
            "description": "Name of the company being analyzed",
            "required": True,
        },
        "industry_sector": {
            "type": "string",
            "description": "Industry sector classification",
            "required": True,
        },
        "annual_revenue": {
            "type": "number",
            "description": "Annual revenue in PLN",
            "required": True,
        },
        "company_size": {
            "type": "string",
            "description": "Company size category (micro, small, medium, large)",
            "required": True,
        },
        "current_tax_metrics": {
            "type": "object",
            "properties": {
                "effective_tax_rate": {"type": "number"},
                "cit_paid": {"type": "number"},
                "vat_efficiency": {"type": "number"},
                "total_tax_burden": {"type": "number"},
            },
            "description": "Current tax metrics for the company",
            "required": True,
        },
        "industry_benchmarks": {
            "type": "object",
            "properties": {
                "average_effective_tax_rate": {"type": "number"},
                "median_effective_tax_rate": {"type": "number"},
                "percentile_25": {"type": "number"},
                "percentile_75": {"type": "number"},
            },
            "description": "Industry benchmark statistics",
            "required": True,
        },
        "benchmark_comparison": {
            "type": "string",
            "description": "How company compares to industry (above average, below average, etc.)",
            "required": True,
        },
        "potential_savings_identified": {
            "type": "number",
            "description": "Total potential tax savings identified (PLN)",
            "required": False,
        },
        "optimization_opportunities": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "opportunity": {"type": "string"},
                    "estimated_savings": {"type": "number"},
                    "legal_basis": {"type": "string"},
                    "implementation_complexity": {"type": "string"},
                    "implementation_timeline": {"type": "string"},
                },
                "required": ["opportunity", "estimated_savings"],
            },
            "description": "Tax optimization opportunities identified",
            "required": True,
        },
        "unused_reliefs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "relief_name": {"type": "string"},
                    "description": {"type": "string"},
                    "estimated_benefit": {"type": "number"},
                    "eligibility_criteria": {"type": "string"},
                },
                "required": ["relief_name", "description"],
            },
            "description": "Tax reliefs and deductions not currently utilized",
            "required": False,
        },
        "priority_recommendations": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Prioritized recommendations for tax optimization",
            "required": True,
        },
    },
)

# Schema 12: Government Communication History Analysis
SCHEMA_12_GOVERNMENT_COMMUNICATION = create_schema_definition(
    name="government_communication_analysis",
    description="Analysis of communication history with tax and government authorities",
    category="compliance",
    properties={
        "client_name": {
            "type": "string",
            "description": "Name of the client",
            "required": True,
        },
        "client_tax_id": {
            "type": "string",
            "description": "NIP (tax identification number)",
            "required": True,
        },
        "analysis_period": {
            "type": "string",
            "description": "Period covered by analysis (e.g., 'last 5 years')",
            "required": True,
        },
        "communications_summary": {
            "type": "object",
            "properties": {
                "total_communications": {"type": "integer"},
                "by_authority": {
                    "type": "object",
                    "properties": {
                        "tax_office": {"type": "integer"},
                        "zus": {"type": "integer"},
                        "other": {"type": "integer"},
                    },
                },
                "by_type": {
                    "type": "object",
                    "properties": {
                        "inquiries": {"type": "integer"},
                        "notices": {"type": "integer"},
                        "decisions": {"type": "integer"},
                        "penalties": {"type": "integer"},
                    },
                },
            },
            "description": "Summary statistics of communications",
            "required": True,
        },
        "active_obligations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "obligation_type": {"type": "string"},
                    "amount": {"type": "number"},
                    "due_date": {"type": "string"},
                    "status": {"type": "string"},
                },
                "required": ["obligation_type", "status"],
            },
            "description": "Current active tax obligations",
            "required": True,
        },
        "dispute_history": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "case_reference": {"type": "string"},
                    "issue": {"type": "string"},
                    "start_date": {"type": "string"},
                    "resolution_date": {"type": "string"},
                    "outcome": {"type": "string"},
                    "financial_impact": {"type": "number"},
                },
                "required": ["issue", "outcome"],
            },
            "description": "History of disputes and their outcomes",
            "required": False,
        },
        "upcoming_deadlines": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "deadline_date": {"type": "string"},
                    "action_required": {"type": "string"},
                    "priority": {"type": "string"},
                },
                "required": ["deadline_date", "action_required"],
            },
            "description": "Upcoming deadlines and required actions",
            "required": True,
        },
        "inconsistencies_detected": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "inconsistency_type": {"type": "string"},
                    "description": {"type": "string"},
                    "affected_periods": {"type": "array", "items": {"type": "string"}},
                    "recommended_action": {"type": "string"},
                },
                "required": ["inconsistency_type", "description"],
            },
            "description": "Inconsistencies found in declarations or communications",
            "required": False,
        },
        "compliance_timeline": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date": {"type": "string"},
                    "event": {"type": "string"},
                    "event_type": {"type": "string"},
                },
                "required": ["date", "event"],
            },
            "description": "Chronological timeline of all significant events",
            "required": True,
        },
        "risk_flags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Red flags or areas requiring immediate attention",
            "required": False,
        },
    },
)

# Schema 13: Tax Audit Assistant
SCHEMA_13_TAX_AUDIT_ASSISTANT = create_schema_definition(
    name="tax_audit_assistant",
    description="Assistant for preparing and managing tax audits",
    category="compliance",
    properties={
        "audit_notice_date": {
            "type": "string",
            "description": "Date of audit notice (YYYY-MM-DD)",
            "required": True,
        },
        "audit_type": {
            "type": "string",
            "description": "Type of audit (VAT, CIT, transfer pricing, comprehensive)",
            "required": True,
        },
        "audit_scope": {
            "type": "string",
            "description": "Description of audit scope and focus areas",
            "required": True,
        },
        "audit_period": {
            "type": "string",
            "description": "Period being audited (e.g., '2022-2023')",
            "required": True,
        },
        "auditing_authority": {
            "type": "string",
            "description": "Name and location of auditing tax office",
            "required": True,
        },
        "areas_under_review": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Specific areas or transactions under review",
            "required": True,
        },
        "risk_analysis": {
            "type": "object",
            "properties": {
                "likely_focus_areas": {"type": "array", "items": {"type": "string"}},
                "potential_issues": {"type": "array", "items": {"type": "string"}},
                "risk_level": {"type": "string"},
            },
            "description": "Analysis of audit risks based on notice and historical data",
            "required": True,
        },
        "similar_audits_data": {
            "type": "object",
            "properties": {
                "common_issues": {"type": "array", "items": {"type": "string"}},
                "typical_duration": {"type": "string"},
                "average_adjustment": {"type": "number"},
            },
            "description": "Data from similar audits for context",
            "required": False,
        },
        "documents_to_prepare": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "document_type": {"type": "string"},
                    "priority": {"type": "string"},
                    "status": {"type": "string"},
                    "notes": {"type": "string"},
                },
                "required": ["document_type", "priority"],
            },
            "description": "Checklist of documents to prepare for audit",
            "required": True,
        },
        "defense_strategy": {
            "type": "object",
            "properties": {
                "key_arguments": {"type": "array", "items": {"type": "string"}},
                "supporting_documentation": {"type": "array", "items": {"type": "string"}},
                "potential_weaknesses": {"type": "array", "items": {"type": "string"}},
            },
            "description": "Recommended defense strategy",
            "required": False,
        },
        "timeline_milestones": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "milestone": {"type": "string"},
                    "deadline": {"type": "string"},
                    "status": {"type": "string"},
                },
                "required": ["milestone"],
            },
            "description": "Key milestones and deadlines during audit process",
            "required": True,
        },
        "immediate_actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "action": {"type": "string"},
                    "urgency": {"type": "string"},
                    "responsible": {"type": "string"},
                },
                "required": ["action", "urgency"],
            },
            "description": "Immediate actions to take upon receiving audit notice",
            "required": True,
        },
    },
)

# Schema 14: Management/Investor Report Generation
SCHEMA_14_MANAGEMENT_REPORT = create_schema_definition(
    name="management_investor_tax_report",
    description="Executive summary of tax position for management and investors",
    category="tax",
    properties={
        "report_period": {
            "type": "string",
            "description": "Reporting period (e.g., '2024 Q3', 'FY 2024')",
            "required": True,
        },
        "company_name": {
            "type": "string",
            "description": "Company name",
            "required": True,
        },
        "executive_summary": {
            "type": "string",
            "description": "High-level summary of tax position and key developments",
            "required": True,
        },
        "key_tax_metrics": {
            "type": "object",
            "properties": {
                "effective_tax_rate": {"type": "number"},
                "total_tax_paid": {"type": "number"},
                "total_tax_accrued": {"type": "number"},
                "change_from_previous_period": {"type": "number"},
            },
            "description": "Key tax performance metrics",
            "required": True,
        },
        "current_tax_liabilities": {
            "type": "object",
            "properties": {
                "current_liabilities": {"type": "number"},
                "deferred_liabilities": {"type": "number"},
                "contingent_liabilities": {"type": "number"},
                "total": {"type": "number"},
            },
            "description": "Summary of tax liabilities",
            "required": True,
        },
        "active_tax_disputes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "dispute_description": {"type": "string"},
                    "amount_at_stake": {"type": "number"},
                    "status": {"type": "string"},
                    "expected_resolution": {"type": "string"},
                },
                "required": ["dispute_description", "status"],
            },
            "description": "Overview of ongoing tax disputes",
            "required": False,
        },
        "significant_developments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "development": {"type": "string"},
                    "impact": {"type": "string"},
                    "financial_effect": {"type": "number"},
                },
                "required": ["development", "impact"],
            },
            "description": "Significant tax developments during the period",
            "required": True,
        },
        "risk_summary": {
            "type": "object",
            "properties": {
                "overall_risk_level": {"type": "string"},
                "key_risks": {"type": "array", "items": {"type": "string"}},
                "risk_mitigation_actions": {"type": "array", "items": {"type": "string"}},
            },
            "description": "Summary of tax risks",
            "required": True,
        },
        "compliance_status": {
            "type": "object",
            "properties": {
                "all_filings_current": {"type": "boolean"},
                "outstanding_obligations": {"type": "array", "items": {"type": "string"}},
                "upcoming_deadlines": {"type": "array", "items": {"type": "string"}},
            },
            "description": "Tax compliance status overview",
            "required": True,
        },
        "year_over_year_comparison": {
            "type": "object",
            "properties": {
                "current_period": {"type": "number"},
                "previous_period": {"type": "number"},
                "change_amount": {"type": "number"},
                "change_percentage": {"type": "number"},
            },
            "description": "Comparison with previous period",
            "required": False,
        },
        "action_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "item": {"type": "string"},
                    "priority": {"type": "string"},
                    "owner": {"type": "string"},
                    "deadline": {"type": "string"},
                },
                "required": ["item", "priority"],
            },
            "description": "Action items requiring board/management attention",
            "required": False,
        },
        "outlook": {
            "type": "string",
            "description": "Forward-looking outlook on tax position",
            "required": False,
        },
    },
)

# Schema 15: Smart Contract Analysis for Crypto/Fintech
SCHEMA_15_SMART_CONTRACT_ANALYSIS = create_schema_definition(
    name="smart_contract_tax_analysis",
    description="Tax analysis and classification of cryptocurrency and smart contract transactions",
    category="tax",
    properties={
        "transaction_type": {
            "type": "string",
            "description": "Type of crypto transaction (DeFi, NFT, staking, yield farming, etc.)",
            "required": True,
        },
        "smart_contract_address": {
            "type": "string",
            "description": "Blockchain address of the smart contract",
            "required": False,
        },
        "blockchain": {
            "type": "string",
            "description": "Blockchain platform (Ethereum, BSC, Polygon, etc.)",
            "required": True,
        },
        "transaction_summary": {
            "type": "string",
            "description": "Plain-language summary of what the transaction does",
            "required": True,
        },
        "tax_classification": {
            "type": "string",
            "description": "Polish tax classification of the transaction",
            "required": True,
        },
        "tax_event_type": {
            "type": "string",
            "description": "Type of taxable event (income, capital gain, exchange, etc.)",
            "required": True,
        },
        "taxable_moment": {
            "type": "string",
            "description": "When the tax obligation arises (e.g., 'at claim', 'at receipt', 'at sale')",
            "required": True,
        },
        "applicable_tax_provisions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "provision": {"type": "string"},
                    "interpretation": {"type": "string"},
                },
                "required": ["provision", "interpretation"],
            },
            "description": "Applicable Polish tax law provisions",
            "required": True,
        },
        "income_calculation_method": {
            "type": "string",
            "description": "How to calculate taxable income from this transaction",
            "required": True,
        },
        "valuation_method": {
            "type": "string",
            "description": "Method for valuing crypto assets (e.g., market price at transaction time)",
            "required": True,
        },
        "comparable_precedents": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "case_description": {"type": "string"},
                    "ruling": {"type": "string"},
                    "relevance": {"type": "string"},
                },
                "required": ["case_description"],
            },
            "description": "Similar cases or interpretations from Poland or abroad",
            "required": False,
        },
        "uncertainty_areas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "issue": {"type": "string"},
                    "risk_level": {"type": "string"},
                    "recommended_approach": {"type": "string"},
                },
                "required": ["issue", "risk_level"],
            },
            "description": "Areas of legal uncertainty and risk",
            "required": False,
        },
        "reporting_requirements": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "requirement": {"type": "string"},
                    "form": {"type": "string"},
                    "deadline": {"type": "string"},
                },
                "required": ["requirement"],
            },
            "description": "Tax reporting requirements for this transaction type",
            "required": True,
        },
        "documentation_needed": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Documentation that should be retained for tax purposes",
            "required": True,
        },
        "international_considerations": {
            "type": "string",
            "description": "Cross-border or international tax considerations",
            "required": False,
        },
        "risk_assessment": {
            "type": "string",
            "description": "Overall risk assessment for this tax treatment (low, medium, high)",
            "required": True,
        },
        "recommendations": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Recommendations for tax treatment and compliance",
            "required": True,
        },
    },
)


# Collection of all schemas
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


def save_schemas_to_json(output_file: str = "lawyer_schemas.json") -> None:
    """
    Save all schemas to a JSON file for manual insertion.

    Args:
        output_file: Path to output JSON file
    """
    console.print(f"[bold cyan]Saving schemas to {output_file}...[/bold cyan]")

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(ALL_SCHEMAS, f, ensure_ascii=False, indent=2)

    console.print(f"[bold green]✓ Successfully saved {len(ALL_SCHEMAS)} schemas to {output_file}[/bold green]")


def display_schemas_table() -> None:
    """Display a nice table of all schemas."""
    table = Table(title="Generated Lawyer & Tax Advisor Schemas")

    table.add_column("No.", justify="right", style="cyan", no_wrap=True)
    table.add_column("Schema Name", style="magenta")
    table.add_column("Category", style="green")
    table.add_column("Fields", justify="right", style="yellow")
    table.add_column("Description", style="white")

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
    """Main entry point for the script."""
    import sys

    console.print("[bold cyan]Starting schema generation for lawyer and tax advisor use cases[/bold cyan]")
    console.print(f"[cyan]Total schemas to generate: {len(ALL_SCHEMAS)}[/cyan]\n")

    # Display the schemas in a nice table
    display_schemas_table()

    # Save to JSON file
    output_file = sys.argv[1] if len(sys.argv) > 1 else "lawyer_schemas.json"
    save_schemas_to_json(output_file)

    console.print("\n[bold yellow]To insert these schemas into Supabase:[/bold yellow]")
    console.print("[yellow]You can use the Supabase MCP tools or manually execute SQL INSERT statements.[/yellow]")


if __name__ == "__main__":
    main()
