/**
 * Single source of truth for project-level content shown on the public
 * landing page and on /team: people, partners, outputs, publications (#759).
 */

export interface TeamMember {
  name: string;
  role: string;
  /** Institution shown in compact views (landing). */
  affiliation: string;
  description: string;
  /** Optional: members without a photo render initials. */
  image?: string;
  linkedin?: string;
  email?: string;
}

export const teamMembers: TeamMember[] = [
  {
    name: "Łukasz Augustyniak",
    role: "Lead AI Architect",
    affiliation: "Wrocław University of Science and Technology",
    description:
      "Lead AI architect and lawyer by training, specializing in natural language processing, machine learning, and sentiment analysis. Combines technical AI expertise with legal knowledge to bridge cutting-edge technology with regulatory frameworks. Published researcher with expertise in transfer learning and text classification.",
    image: "/team/lukasz-augustyniak.jpg",
    linkedin: "https://www.linkedin.com/in/lukaszaugustyniak/",
    email: "lukasz.augustyniak@pwr.edu.pl",
  },
  {
    name: "Prof. Tomasz Kajdanowicz",
    role: "Supervisor & Project Leader",
    affiliation: "Wrocław University of Science and Technology",
    description:
      "Professor at Wrocław University of Science and Technology and Founder of handling.ai. Experienced researcher and practitioner in machine learning, data science, social network analysis, and collective classification. Leads research projects bridging academic excellence with real-world AI applications in legal and tax domains.",
    image: "/team/tomasz-kajdanowicz.jpg",
    linkedin: "https://www.linkedin.com/in/kajdanowicz/",
    email: "tomasz.kajdanowicz@pwr.edu.pl",
  },
  {
    name: "Albert Sawczyn",
    role: "PhD Student & Developer",
    affiliation: "Wrocław University of Science and Technology",
    description:
      "PhD student at Wrocław University of Science and Technology (2021-2025) specializing in AI and machine learning. Contributes to research on graph-level representations, knowledge graphs, and fact-checking systems for large language models. Co-author of FactSelfCheck and other innovative NLP solutions.",
    image: "/team/albert-sawczyn.jpg",
    linkedin: "https://www.linkedin.com/in/albert-sawczyn/",
    email: "albert.sawczyn@pwr.edu.pl",
  },
  {
    name: "Jakub Binkowski",
    role: "PhD Student & Developer",
    affiliation: "Wrocław University of Science and Technology",
    description:
      "PhD student in Large Language Models and Graph Representation Learning at Wrocław University of Science and Technology. Recently defended thesis on unsupervised graph representation learning. Specializes in hallucination detection in LLMs, spectral graph theory, and multiplex network embeddings. Author of LapEigvals method and contributor to PLLuM project.",
    image: "/team/jakub-binkowski.jpg",
    linkedin: "https://www.linkedin.com/in/jakub-binkowski/",
    email: "jakub.binkowski@pwr.edu.pl",
  },
  {
    name: "Kamil Tagowski",
    role: "Researcher",
    affiliation: "Wrocław University of Science and Technology",
    description:
      "Researcher at Wrocław University of Science and Technology working on the JuDDGES data and extraction pipeline. Co-author of Schematize and the Juddges App software release.",
  },
  {
    name: "Prof. Michał Bernaczyk",
    role: "Legal Expert",
    affiliation: "University of Wrocław, Faculty of Law",
    description:
      "Professor in the Department of Constitutional Law at the University of Wrocław. Provides legal-domain expertise for the project's annotation schemas and evaluation.",
  },
  {
    name: "Krzysztof Kamiński",
    role: "Judiciary Partner",
    affiliation: "Court of Appeal in Wrocław",
    description:
      "Brings the perspective of the Polish judiciary to the project, grounding the platform in how courts actually produce and use judgments.",
  },
];

export const projectFunding = {
  funder: "CHIST-ERA",
  call: 'ORD 2023 ("Open & Re-usable Research Data & Software")',
  coordinator: "Prof. Tomasz Kajdanowicz (Wrocław Tech)",
  siteUrl: "https://juddges-project.eu/",
} as const;

export interface Partner {
  name: string;
  country: string;
  description: string;
  /** Consortium members are funded partners; the rest collaborate. */
  consortium: boolean;
  url?: string;
}

export const partners: Partner[] = [
  {
    name: "Wrocław University of Science and Technology (Wrocław Tech)",
    country: "Poland",
    description:
      "Department of Artificial Intelligence. Project coordinator; national funder NCN (National Science Centre).",
    consortium: true,
  },
  {
    name: "Middlesex University London",
    country: "United Kingdom",
    description:
      "Decision psychology and data science (Prof. Mandeep K. Dhami, Prof. David Windridge).",
    consortium: true,
  },
  {
    name: "Université Claude Bernard Lyon 1",
    country: "France",
    description:
      "ELICO lab, open science and research data (Prof. Cherifa Boukacem-Zeghmouri). ANR grant ANR-23-CHRO-0001.",
    consortium: true,
    url: "https://anr.fr/Projet-ANR-23-CHRO-0001",
  },
  {
    name: "University of Wrocław",
    country: "Poland",
    description: "Faculty of Law (Prof. Michał Bernaczyk).",
    consortium: false,
  },
  {
    name: "Court of Appeal in Wrocław",
    country: "Poland",
    description: "Judiciary collaborator (Krzysztof Kamiński).",
    consortium: false,
  },
];

export interface ProjectOutput {
  title: string;
  description: string;
  /** Primary link (repository, hub page, package). */
  url?: string;
  doi?: string;
}

export const huggingFaceOrgUrl = "https://huggingface.co/JuDDGES";

export const outputs: ProjectOutput[] = [
  {
    title: "JuDDGES/pl-court-raw",
    description: "Open dataset on Hugging Face.",
    url: "https://huggingface.co/datasets/JuDDGES/pl-court-raw",
    doi: "10.57967/hf/4700",
  },
  {
    title: "JuDDGES/pl-court-instruct",
    description: "Open dataset on Hugging Face.",
    url: "https://huggingface.co/datasets/JuDDGES/pl-court-instruct",
    doi: "10.57967/hf/4699",
  },
  {
    title: "JuDDGES/pl-court-graph",
    description: "Open dataset on Hugging Face.",
    url: "https://huggingface.co/datasets/JuDDGES/pl-court-graph",
    doi: "10.57967/hf/4701",
  },
  {
    title: "JuDDGES/en-court-instruct",
    description: "Open dataset on Hugging Face.",
    url: "https://huggingface.co/datasets/JuDDGES/en-court-instruct",
    doi: "10.57967/hf/4697",
  },
  {
    title: "JuDDGES/pl-appealcourt-criminal",
    description: "Open dataset on Hugging Face.",
    url: "https://huggingface.co/datasets/JuDDGES/pl-appealcourt-criminal",
    doi: "10.57967/hf/8772",
  },
  {
    title: "JuDDGES/en-appealcourt",
    description: "Open dataset on Hugging Face.",
    url: "https://huggingface.co/datasets/JuDDGES/en-appealcourt",
    doi: "10.57967/hf/8773",
  },
  {
    title: "Juddges App",
    description: "Open-source platform (Apache-2.0), archived on Zenodo.",
    url: "https://github.com/pwr-ai/juddges-app",
    doi: "10.5281/zenodo.19911856",
  },
  {
    title: "JuDDGES research codebase",
    description: "Data fetching, instruction datasets, fine-tuning and evaluation.",
    url: "https://github.com/pwr-ai/JuDDGES",
  },
  {
    title: "Schematize",
    description:
      "Agentic schema-generation system (PyPI package `schematize`).",
    url: "https://github.com/pwr-ai/schematize",
  },
];

export interface Publication {
  title: string;
  authors: string;
  venue: string;
  year: string;
  url: string;
}

export const publications: Publication[] = [
  {
    title:
      "Bridging AI and Law: A Scalable Multi-Agent Platform for Quantitative Legal Analytics Across Millions of Documents",
    authors:
      "Augustyniak, Binkowski, Sawczyn, Tagowski, Janiak, Bystroński, Piotrowski, Bernaczyk, Kamiński, Szymczak, Kajdanowicz",
    venue: "Bridge between Artificial Intelligence and Law (OpenReview)",
    year: "2026",
    url: "https://openreview.net/forum?id=hWjsyTSWrY",
  },
  {
    title:
      "Schematize: An Agentic System for Generating and Refining Information-Extraction Schemas for Legal Research",
    authors:
      "Sawczyn, Binkowski, Tagowski, Augustyniak, Kaczmarek-Templin, Kajdanowicz",
    venue: "EMNLP 2026 System Demonstrations (accepted)",
    year: "2026",
    url: "https://arxiv.org/abs/2609.22209",
  },
  {
    title: "Juddges App",
    authors:
      "Augustyniak, Binkowski, Sawczyn, Tagowski, Bernaczyk, Kamiński, Kajdanowicz",
    venue: "Software, Zenodo",
    year: "2026",
    url: "https://doi.org/10.5281/zenodo.19911856",
  },
];

export const partnerPublications: Publication[] = [
  {
    title:
      "The Application of Pre-trained Transformer Models to UK Court of Appeal Legal Judgments",
    authors: "Abbas, Zia, Tirunagari, Chennareddy, Dhami, Windridge",
    venue: "Springer",
    year: "2026",
    url: "https://doi.org/10.1007/978-981-95-4963-4_21",
  },
  {
    title: "Judges on Trial: The Future of Research on Judicial Decision-Making",
    authors: "Dhami, Kajdanowicz, Windridge, Boukacem-Zeghmouri",
    venue: "BIG IDEAS in Forensic Psychology, Wiley",
    year: "2025",
    url: "https://doi.org/10.5281/zenodo.15658177",
  },
];
