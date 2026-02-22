import {
  FileText,
  Users,
  BookOpen,
  CheckCircle,
  Zap,
  Shield,
  Puzzle,
  Search,
  Database,
  GitBranch,
  MessageSquare,
  BarChart,
  FileSearch,
  Cloud,
  Server,
  Network,
  GraduationCap,
  Lock,
  Globe,
  Code,
  HeadphonesIcon,
  Lightbulb,
} from "lucide-react";

export const enterpriseContent = {
  hero: {
    headline: "Enterprise Judgments Analysis Solutions for Your Firm",
    subheadline:
      "Deploy Juddges's proven legal research platform in your infrastructure. Trusted by 50+ researchers analyzing 3M+ documents.",
    primaryCTA: { text: "Schedule a Demo", href: "#contact" },
    secondaryCTA: { text: "View Case Studies", href: "#case-studies" },
  },

  stats: [
    {
      value: "3M+",
      label: "Documents Processed",
      icon: FileText,
      description: "Legal documents indexed and searchable",
    },
    {
      value: "50+",
      label: "Active Researchers",
      icon: Users,
      description: "Researchers using the platform daily",
    },
    {
      value: "5+",
      label: "Research Publications",
      icon: BookOpen,
      description: "Academic papers enabled by our platform",
    },
    {
      value: "99.9%",
      label: "Uptime",
      icon: CheckCircle,
      description: "Production-grade reliability",
    },
  ],

  valueProps: [
    {
      icon: Zap,
      title: "Efficiency & Scale",
      description: "Transform your legal research workflow",
      features: [
        "Reduce legal research time by 70%",
        "Process thousands of documents in minutes",
        "AI-powered semantic search across your entire library",
        "Automated citation extraction and analysis",
      ],
    },
    {
      icon: Shield,
      title: "Security & Compliance",
      description: "Enterprise-grade security you can trust",
      features: [
        "GDPR-compliant architecture",
        "EU-hosted infrastructure options",
        "On-premise deployment available",
        "End-to-end encryption",
        "Role-based access control",
      ],
    },
    {
      icon: Puzzle,
      title: "Integration & Flexibility",
      description: "Seamlessly fits into your workflow",
      features: [
        "REST API for easy integration",
        "Custom schema development",
        "Compatible with major document management systems",
        "Flexible deployment options",
      ],
    },
  ],

  deploymentOptions: [
    {
      id: "cloud",
      title: "Cloud Deployment",
      description:
        "Fully managed infrastructure with automatic updates and scaling",
      icon: Cloud,
      features: [
        "Managed infrastructure and monitoring",
        "Automatic updates and patches",
        "Scalable resources on demand",
        "EU data residency guaranteed",
        "99.9% uptime SLA",
        "24/7 technical support",
      ],
      bestFor: "Firms wanting rapid deployment with minimal IT overhead",
    },
    {
      id: "on-premise",
      title: "On-Premise Deployment",
      description:
        "Complete control with deployment in your own infrastructure",
      icon: Server,
      features: [
        "Complete data sovereignty",
        "Air-gapped deployment options",
        "Custom security policies",
        "Local data processing",
        "Integration with existing systems",
        "Full infrastructure control",
      ],
      bestFor: "Organizations with strict data residency requirements",
      recommended: true,
    },
    {
      id: "hybrid",
      title: "Hybrid Solution",
      description: "Combine the benefits of both cloud and on-premise",
      icon: Network,
      features: [
        "Sensitive data on-premise",
        "Compute resources in cloud",
        "Flexible workload distribution",
        "Custom architecture design",
        "Optimized cost and performance",
        "Gradual migration path",
      ],
      bestFor: "Enterprises with complex infrastructure needs",
    },
  ],

  features: [
    {
      id: "search",
      title: "AI-Powered Search",
      description:
        "Semantic search that understands legal context and intent",
      icon: Search,
      details: [
        "Natural language queries",
        "Multi-language support (Polish, English, German, French)",
        "Citation extraction and linking",
        "Relevance ranking with AI",
        "Advanced filters and facets",
      ],
      tags: ["Core Feature", "AI-Powered"],
    },
    {
      id: "extraction",
      title: "Structured Data Extraction",
      description: "Transform unstructured documents into analyzable data",
      icon: Database,
      details: [
        "Custom schema creation",
        "Automated field extraction",
        "Validation and quality checks",
        "Export to JSON, CSV, Excel",
        "Batch processing",
      ],
      tags: ["Core Feature", "Automation"],
    },
    {
      id: "similarity",
      title: "Document Similarity & Clustering",
      description: "Discover patterns and relationships across documents",
      icon: GitBranch,
      details: [
        "Find related cases automatically",
        "Visual similarity graphs",
        "Pattern detection",
        "Precedent discovery",
        "Trend analysis",
      ],
      tags: ["Advanced", "Analytics"],
    },
    {
      id: "qa",
      title: "AI Assistant & Q&A",
      description: "Get instant answers with source citations",
      icon: MessageSquare,
      details: [
        "Legal question answering",
        "Source citation and verification",
        "Context-aware responses",
        "Custom knowledge bases",
        "Multi-turn conversations",
      ],
      tags: ["AI-Powered", "User-Friendly"],
    },
    {
      id: "analytics",
      title: "Analytics & Insights",
      description: "Understand trends and patterns in your document corpus",
      icon: BarChart,
      details: [
        "Topic modeling and trending topics",
        "Custom dashboard creation",
        "Automated reporting",
        "Data visualization",
        "Export and sharing",
      ],
      tags: ["Analytics", "Reporting"],
    },
    {
      id: "collections",
      title: "Collection Management",
      description: "Organize and collaborate on document collections",
      icon: FileSearch,
      details: [
        "Organize by case, practice area, or client",
        "Collaborative workflows",
        "Granular access controls",
        "Version tracking",
        "Audit logs",
      ],
      tags: ["Organization", "Collaboration"],
    },
  ],

  techStack: {
    frontend: [
      { name: "Next.js 15", description: "React framework for production" },
      { name: "TypeScript", description: "Type-safe development" },
      { name: "Tailwind CSS", description: "Modern styling" },
    ],
    backend: [
      { name: "FastAPI", description: "High-performance Python API" },
      { name: "LangChain", description: "LLM orchestration framework" },
      { name: "Pydantic", description: "Data validation" },
    ],
    data: [
      { name: "Supabase pgvector", description: "Vector database for semantic search" },
      { name: "PostgreSQL", description: "Relational data storage" },
      { name: "Redis", description: "Caching and queuing" },
    ],
    ai: [
      {
        name: "OpenAI GPT-4",
        description: "Language understanding and generation",
      },
      { name: "Custom Embeddings", description: "Domain-specific vectors" },
      { name: "Langfuse", description: "LLM observability" },
    ],
    infrastructure: [
      { name: "Docker", description: "Containerization" },
      { name: "Kubernetes", description: "Orchestration (optional)" },
      { name: "GitHub Actions", description: "CI/CD pipeline" },
    ],
  },

  securityFeatures: [
    "End-to-end encryption for data at rest and in transit",
    "Role-based access control (RBAC)",
    "Single Sign-On (SSO) integration",
    "Audit logging for all operations",
    "GDPR compliance tools and data export",
    "Regular security audits and penetration testing",
    "Automated backup and disaster recovery",
    "Network isolation and firewalls",
  ],

  integrations: [
    { name: "iManage", category: "Document Management", logo: null },
    { name: "NetDocuments", category: "Document Management", logo: null },
    { name: "SharePoint", category: "Document Management", logo: null },
    { name: "Custom REST APIs", category: "Custom", logo: null },
    { name: "Webhook Support", category: "Automation", logo: null },
  ],

  services: [
    {
      title: "Consultation & Planning",
      description:
        "We help you design the right solution for your organization",
      icon: Lightbulb,
      features: [
        "Infrastructure assessment",
        "Use case analysis and prioritization",
        "ROI modeling and projections",
        "Deployment strategy development",
        "Security and compliance review",
      ],
    },
    {
      title: "Custom Development",
      description: "Tailor the platform to your specific needs",
      icon: Code,
      features: [
        "Custom schema design and development",
        "Integration with existing systems",
        "UI/UX customization and white-labeling",
        "Workflow automation development",
        "Custom reporting and analytics",
      ],
    },
    {
      title: "Training & Onboarding",
      description: "Ensure your team gets the most from the platform",
      icon: GraduationCap,
      features: [
        "Administrator training",
        "End-user training programs",
        "Best practices workshops",
        "Comprehensive documentation",
        "Video tutorials and guides",
      ],
    },
    {
      title: "Ongoing Support",
      description: "We're with you every step of the way",
      icon: HeadphonesIcon,
      features: [
        "Technical support (email, chat, phone)",
        "System monitoring and maintenance",
        "Performance optimization",
        "Feature updates and enhancements",
        "Dedicated account management",
      ],
    },
  ],

  caseStudies: [
    {
      title: "Swiss Franc Loan Analysis",
      industry: "Banking Law",
      challenge:
        "A leading law firm needed to analyze thousands of Swiss Franc loan court cases to identify patterns and build stronger legal arguments for their clients.",
      solution:
        "Deployed Juddges with custom extraction schemas to automatically parse court judgments, extract key fields (loan terms, court decisions, legal reasoning), and visualize document similarity.",
      results: [
        {
          metric: "80%",
          value: "Time Saved",
          description: "Research time reduced from weeks to days",
        },
        {
          metric: "1,200+",
          value: "Cases Analyzed",
          description: "Comprehensive coverage of relevant precedents",
        },
        {
          metric: "15+",
          value: "Patterns Found",
          description: "New legal arguments discovered",
        },
      ],
      link: "/use-cases/swiss-franc",
    },
    {
      title: "Cross-Jurisdictional Tax Research",
      industry: "Tax Law",
      challenge:
        "Tax advisors needed to track regulatory changes and interpretations across multiple jurisdictions in real-time to provide accurate client guidance.",
      solution:
        "Implemented Juddges with automated document ingestion, multi-language processing, and custom alerts for regulatory changes.",
      results: [
        {
          metric: "95%",
          value: "Coverage",
          description: "Comprehensive tracking of all relevant sources",
        },
        {
          metric: "2hrs",
          value: "Alert Time",
          description: "Real-time notifications of new interpretations",
        },
        {
          metric: "60%",
          value: "Efficiency Gain",
          description: "Faster client response time",
        },
      ],
      link: "/use-cases/tax-interpretations",
    },
    {
      title: "UK Judgment Analysis",
      industry: "General Litigation",
      challenge:
        "Legal researchers needed better tools to analyze UK court judgments and identify precedents relevant to ongoing cases.",
      solution:
        "Deployed cloud-hosted Juddges with semantic search, citation extraction, and similarity clustering specialized for UK legal documents.",
      results: [
        {
          metric: "50K+",
          value: "Judgments Indexed",
          description: "Comprehensive UK case law coverage",
        },
        {
          metric: "3x",
          value: "Research Speed",
          description: "Faster precedent discovery",
        },
        {
          metric: "100%",
          value: "User Satisfaction",
          description: "High adoption rate among researchers",
        },
      ],
      link: "/use-cases/uk-judgments",
    },
  ],

  pricingTiers: [
    {
      name: "Pilot Program",
      description: "Perfect for proof of concept and evaluation",
      features: [
        "3-month engagement",
        "Up to 5 user seats",
        "Core features (search, Q&A, extraction)",
        "10,000 document limit",
        "Email support",
        "Basic training",
        "Cloud deployment only",
      ],
      cta: { text: "Start Pilot", href: "#contact" },
      highlighted: false,
    },
    {
      name: "Enterprise Deployment",
      description: "Full-featured solution for growing organizations",
      features: [
        "Unlimited user seats",
        "All features included",
        "Unlimited documents",
        "Custom integrations (up to 3)",
        "Priority support (24/7)",
        "Comprehensive training",
        "Choice of deployment (cloud, on-premise, hybrid)",
        "Quarterly business reviews",
      ],
      cta: { text: "Get Started", href: "#contact" },
      highlighted: true,
    },
    {
      name: "Custom Solutions",
      description: "Tailored for complex enterprise requirements",
      features: [
        "Everything in Enterprise",
        "Bespoke feature development",
        "White-label options",
        "Multi-tenant architecture",
        "Unlimited custom integrations",
        "Dedicated account team",
        "Custom SLA agreements",
        "Strategic partnership opportunities",
      ],
      cta: { text: "Contact Sales", href: "#contact" },
      highlighted: false,
    },
  ],

  faqs: [
    {
      question: "What languages does Juddges support?",
      answer:
        "Juddges currently supports Polish, English, German, and French for document processing and search. We can add support for additional languages based on your requirements.",
      category: "Features",
    },
    {
      question: "How is data security and privacy handled?",
      answer:
        "We implement enterprise-grade security including end-to-end encryption, role-based access control, audit logging, and GDPR compliance tools. For on-premise deployments, all data remains within your infrastructure. We can also sign custom DPAs and NDAs as needed.",
      category: "Security",
    },
    {
      question: "Can we deploy Juddges on our own infrastructure?",
      answer:
        "Yes, we offer on-premise deployment where the entire platform runs in your data center or private cloud. We provide Docker containers and comprehensive deployment documentation. Our team can assist with setup and configuration.",
      category: "Deployment",
    },
    {
      question: "What is the typical implementation timeline?",
      answer:
        "For cloud deployments, pilot programs can be launched within 2-4 weeks. Full enterprise deployments typically take 6-12 weeks depending on customization requirements and integration complexity. On-premise deployments may take 8-16 weeks.",
      category: "Implementation",
    },
    {
      question: "Do you provide training and ongoing support?",
      answer:
        "Yes, we provide comprehensive training for both administrators and end-users, including workshops, documentation, and video tutorials. Ongoing support is included in all plans, with 24/7 priority support for Enterprise customers.",
      category: "Support",
    },
    {
      question: "Can we customize the platform for our specific needs?",
      answer:
        "Absolutely. We offer custom schema development, UI customization, workflow automation, and integration with your existing systems. Our team works closely with you to understand your requirements and deliver tailored solutions.",
      category: "Customization",
    },
    {
      question: "How does pricing work?",
      answer:
        "Pricing depends on deployment type, number of users, document volume, and customization requirements. We offer flexible subscription models and can work within your budget. Contact us for a detailed quote based on your specific needs.",
      category: "Pricing",
    },
    {
      question:
        "What makes Juddges different from other legal AI tools?",
      answer:
        "Juddges is built on proven academic research and has processed over 3 million legal documents in production. Unlike consumer tools, we offer on-premise deployment, custom development, domain-specific AI models, and enterprise-grade security. Our platform is designed for legal professionals who need reliability, accuracy, and control.",
      category: "Product",
    },
    {
      question: "Can we integrate Juddges with our existing document management system?",
      answer:
        "Yes, Juddges provides a REST API and supports integration with major document management systems like iManage, NetDocuments, and SharePoint. We can also develop custom integrations for proprietary systems.",
      category: "Integration",
    },
    {
      question: "What kind of documents can Juddges process?",
      answer:
        "Juddges can process various legal document types including court judgments, legal opinions, contracts, regulations, tax interpretations, and more. We support PDF, DOCX, HTML, and plain text formats. Custom document type support can be added as needed.",
      category: "Features",
    },
  ],

  certifications: [
    {
      name: "GDPR Compliant",
      icon: Lock,
      description:
        "Full compliance with EU General Data Protection Regulation",
    },
    {
      name: "EU Hosted",
      icon: Globe,
      description: "Data centers located in the European Union",
    },
    {
      name: "Open Source",
      icon: Code,
      description: "Core components available for audit and customization",
    },
  ],

  team: {
    university: {
      name: "Wrocław University of Science and Technology",
      description:
        "Juddges is developed by researchers at one of Poland's leading technical universities, with expertise in natural language processing, machine learning, and legal technology.",
    },
    expertise: [
      "Natural Language Processing (NLP)",
      "Machine Learning & Deep Learning",
      "Legal Document Analysis",
      "Information Retrieval",
      "Knowledge Graphs",
      "Enterprise Software Architecture",
    ],
    publications: [
      {
        title:
          "AI-Powered Legal Document Analysis: Methods and Applications",
        link: "#",
      },
      {
        title: "Semantic Search in Legal Corpora: A Practical Approach",
        link: "#",
      },
    ],
  },
};
