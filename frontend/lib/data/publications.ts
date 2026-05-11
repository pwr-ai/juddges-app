/**
 * Static publication data for the publications page.
 *
 * Used as a fallback when the backend `/publications` API is unreachable.
 */

import {
  PublicationProject,
  PublicationStatus,
  PublicationType,
  type Publication,
} from "@/types/publication";

export const publications: Publication[] = [
  {
    id: "augustyniak-bernaczyk-kaczmarek-2025-unseen-influence",
    title:
      "Unseen Influence: Computational Propaganda, Free Elections, and the Reluctance to Seek Judicial Remedies in Poland. Evidence from AI-Assisted Case Law Analysis",
    authors: [
      {
        name: "Łukasz Augustyniak",
        affiliation: "Wrocław University of Science and Technology, Poland",
        url: "https://orcid.org/0000-0002-4090-4480",
      },
      {
        name: "Michał Bernaczyk",
        affiliation: "University of Wrocław, Poland",
        url: "https://orcid.org/0000-0001-7683-8852",
      },
      {
        name: "Berenika Kaczmarek-Templin",
        affiliation: "Wrocław University of Science and Technology, Poland",
        url: "https://orcid.org/0000-0003-2731-7430",
      },
    ],
    venue: "Białostockie Studia Prawnicze, Tom 30 Nr 4",
    venueShort: "BSP",
    year: 2025,
    month: 11,
    abstract:
      "The Polish electoral system adheres to the principle of free and fair elections. This principle has a defined content, and its backbone remains access to truthful information and the free shaping of opinions about a candidate or an issue put to a referendum. However, the enormous increase in computational power and the associated development of artificial intelligence have caused electoral competition to become highly aggressive; it no longer avoids false information, messages appealing to negative emotions, or calls for violence. Very Large Online Platforms' predictable abdication of their role as moderators of public debate leads to the question: How can or should public authorities protect integrity and freedom of participation from abuse in the era of digital constitutionalism? Should we rely on a litigation system where the initiative comes solely from the participant in the electoral process, or should we also include the regulatory power of the electoral administration? What picture of electoral campaigns is provided by Polish jurisprudence concerning electoral disputes?",
    project: PublicationProject.JUDDGES,
    type: PublicationType.JOURNAL,
    status: PublicationStatus.PUBLISHED,
    links: {
      doi: "10.15290/bsp.2025.30.04.14",
    },
    tags: ["legal analytics", "electoral law", "computational propaganda", "Polish case law"],
    publicationDate: "2025-11-24",
  },
  {
    id: "binkowski-etal-2025-hallucination-spectral",
    title: "Hallucination Detection in LLMs Using Spectral Features of Attention Maps",
    authors: [
      { name: "Jakub Binkowski" },
      { name: "Denis Janiak" },
      { name: "Albert Sawczyn" },
      { name: "Bogdan Gabrys" },
      { name: "Tomasz Jan Kajdanowicz" },
    ],
    venue:
      "Proceedings of the 2025 Conference on Empirical Methods in Natural Language Processing (EMNLP)",
    venueShort: "EMNLP 2025",
    year: 2025,
    month: 11,
    abstract:
      "Large Language Models (LLMs) have demonstrated remarkable performance across various tasks but remain prone to hallucinations. Detecting hallucinations is essential for safety-critical applications, and recent methods leverage attention map properties to this end, though their effectiveness remains limited. In this work, we investigate the spectral features of attention maps by interpreting them as adjacency matrices of graph structures. We propose the LapEigvals method, which utilises the top-k eigenvalues of the Laplacian matrix derived from the attention maps as an input to hallucination detection probes. Empirical evaluations demonstrate that our approach achieves state-of-the-art hallucination detection performance among attention-based methods. Extensive ablation studies further highlight the robustness and generalisation of LapEigvals, paving the way for future advancements in the hallucination detection domain.",
    project: PublicationProject.JUDDGES,
    type: PublicationType.CONFERENCE,
    status: PublicationStatus.PUBLISHED,
    links: {
      doi: "10.18653/v1/2025.emnlp-main.1239",
      website: "https://aclanthology.org/2025.emnlp-main.1239/",
    },
    tags: ["LLMs", "hallucination detection", "attention maps", "spectral analysis"],
  },
  {
    id: "janiak-etal-2025-illusion-of-progress",
    title: "The Illusion of Progress: Re-evaluating Hallucination Detection in LLMs",
    authors: [
      { name: "Denis Janiak" },
      { name: "Jakub Binkowski" },
      { name: "Albert Sawczyn" },
      { name: "Bogdan Gabrys" },
      { name: "Ravid Shwartz-Ziv" },
      { name: "Tomasz Jan Kajdanowicz" },
    ],
    venue:
      "Proceedings of the 2025 Conference on Empirical Methods in Natural Language Processing (EMNLP)",
    venueShort: "EMNLP 2025",
    year: 2025,
    month: 11,
    abstract:
      "Large language models (LLMs) have revolutionized natural language processing, yet their tendency to hallucinate poses serious challenges for reliable deployment. Despite numerous hallucination detection methods, their evaluations often rely on ROUGE, a metric based on lexical overlap that misaligns with human judgments. Through comprehensive human studies, we demonstrate that while ROUGE exhibits high recall, its extremely low precision leads to misleading performance estimates. In fact, several established detection methods show performance drops of up to 45.9% when assessed using human-aligned metrics like LLM-as-Judge. Moreover, our analysis reveals that simple heuristics based on response length can rival complex detection techniques, exposing a fundamental flaw in current evaluation practices. We argue that adopting semantically aware and robust evaluation frameworks is essential to accurately gauge the true performance of hallucination detection methods, ultimately ensuring the trustworthiness of LLM outputs.",
    project: PublicationProject.JUDDGES,
    type: PublicationType.CONFERENCE,
    status: PublicationStatus.PUBLISHED,
    links: {
      doi: "10.18653/v1/2025.emnlp-main.1761",
      website: "https://aclanthology.org/2025.emnlp-main.1761/",
    },
    tags: ["LLMs", "hallucination detection", "evaluation", "LLM-as-Judge"],
  },
  {
    id: "augustyniak-etal-2026-bridging-ai-law",
    title:
      "Bridging AI and Law: A Scalable Multi-Agent Platform for Quantitative Legal Analytics Across Millions of Documents",
    authors: [
      { name: "Łukasz Augustyniak" },
      { name: "Kamil Tagowski" },
      { name: "Adrian Szymczak" },
      { name: "Jakub Binkowski" },
      { name: "Albert Sawczyn" },
      { name: "Michał Skibiński" },
      { name: "Denis Janiak" },
      { name: "Mateusz Bystroński" },
      { name: "Grzegorz Piotrowski" },
      { name: "Michał Bernaczyk" },
      { name: "Krzysztof Kamiński" },
      { name: "Tomasz Jan Kajdanowicz" },
    ],
    venue: "AAAI 2026 Bridge on AI and Law (AILaw26) — Demo Track",
    venueShort: "AAAI 2026 AILaw",
    year: 2026,
    month: 1,
    abstract:
      "We present a production-scale platform that bridges artificial intelligence and legal practice, currently indexing over 3 million legal documents and 300 million semantic vectors across multiple jurisdictions. While retrieval-augmented generation (RAG) systems have advanced legal information retrieval, they remain limited in processing scale, quantitative aggregation, and interpretability — capabilities crucial for trustworthy AI in law. Our Quantitative Legal Agent (QLA) architecture enables systematic analysis across massive document collections through a unified data model supporting Polish court judgments (3M+), UK rulings (6K), and tax interpretations, with an extensible ingestion pipeline for additional jurisdictions and document types. The platform introduces a novel lawyer-AI specialist collaborative workflow: legal experts define search criteria, curate example documents into collections, and specify extraction goals, while AI specialists expand document retrieval and refine extraction schemas — enabling rigorous quantitative analysis with validated aggregation. This workflow has already produced published legal analytics studies. We demonstrate the system's capabilities in bias detection, precedent mapping, and trend analysis, showing how QLA advances responsible, transparent AI for high-stakes legal applications.",
    project: PublicationProject.JUDDGES,
    type: PublicationType.WORKSHOP,
    status: PublicationStatus.PUBLISHED,
    links: {},
    tags: [
      "Legal AI",
      "Quantitative Legal Analytics",
      "Multi-Agent Systems",
      "Information Extraction",
      "Semantic Search",
      "Explainable AI",
      "Human-AI Collaboration",
      "Legal NLP",
    ],
    manuscriptNumber: "Submission 49",
    publicationDate: "2025-12-13",
  },
  {
    id: "sawczyn-etal-2026-factselfcheck",
    title: "FactSelfCheck: Fact-Level Black-Box Hallucination Detection for LLMs",
    authors: [
      { name: "Albert Sawczyn" },
      { name: "Jakub Binkowski" },
      { name: "Denis Janiak" },
      { name: "Bogdan Gabrys" },
      { name: "Tomasz Jan Kajdanowicz" },
    ],
    venue: "Findings of the Association for Computational Linguistics: EACL 2026",
    venueShort: "EACL 2026 Findings",
    year: 2026,
    month: 3,
    abstract:
      "Large Language Models (LLMs) frequently generate hallucinated content, posing significant challenges for applications where factuality is crucial. While existing hallucination detection methods typically operate at the sentence level or passage level, we propose FactSelfCheck, a novel zero-resource black-box sampling-based method that enables fine-grained fact-level detection. Our approach represents text as interpretable knowledge graphs consisting of facts in the form of triples, providing clearer insights into content factuality than traditional approaches. Through analyzing factual consistency across multiple LLM responses, we compute fine-grained hallucination scores without requiring external resources or training data. Our evaluation demonstrates that FactSelfCheck performs competitively with leading sentence-level sampling-based methods while providing more detailed and interpretable insights. Most notably, our fact-level approach significantly improves hallucination correction, achieving a 35.5% increase in factual content compared to the baseline, while sentence-level SelfCheckGPT yields only a 10.6% improvement. The granular nature of our detection enables more precise identification and correction of hallucinated content. Additionally, we contribute FavaMultiSamples, a novel dataset that addresses a gap in the field by providing the research community with a second dataset for evaluating sampling-based methods.",
    project: PublicationProject.JUDDGES,
    type: PublicationType.CONFERENCE,
    status: PublicationStatus.PUBLISHED,
    links: {
      doi: "10.18653/v1/2026.findings-eacl.296",
      website: "https://aclanthology.org/2026.findings-eacl.296/",
    },
    tags: [
      "LLMs",
      "hallucination detection",
      "knowledge graphs",
      "black-box methods",
      "factuality",
    ],
  },
];

/**
 * Sort publications by year descending, then by title.
 */
export function sortPublications(pubs: Publication[], sortBy?: string): Publication[] {
  return [...pubs].sort((a, b) => {
    if (sortBy === "title") return a.title.localeCompare(b.title);
    if (sortBy === "year_asc") return a.year - b.year;
    // Default: year descending, then title
    if (b.year !== a.year) return b.year - a.year;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Get unique years from publications list.
 */
export function getPublicationYears(pubs: Publication[]): number[] {
  const years = new Set(pubs.map((p) => p.year));
  return Array.from(years).sort((a, b) => b - a);
}
