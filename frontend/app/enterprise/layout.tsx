import React from "react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI-Tax Enterprise | Legal AI Solutions for Law Firms & Organizations",
  description:
    "Deploy proven legal AI technology in your infrastructure. Process millions of documents, automate research, extract structured data. Cloud, on-premise, or hybrid deployment options available.",
  keywords:
    "enterprise legal AI, law firm technology, legal document analysis, GDPR legal tech, AI-powered legal research, document extraction, legal automation",
  authors: [
    { name: "AI-Tax Team", url: "https://ai-tax.example.com" },
  ],
  openGraph: {
    title: "AI-Tax Enterprise | Legal AI Solutions for Law Firms",
    description:
      "Deploy AI-Tax's proven legal research platform in your infrastructure. Trusted by 50+ researchers analyzing 3M+ documents.",
    type: "website",
    url: "https://ai-tax.example.com/enterprise",
    siteName: "AI-Tax Enterprise",
    images: [
      {
        url: "/og-image-enterprise.png",
        width: 1200,
        height: 630,
        alt: "AI-Tax Enterprise Solutions",
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI-Tax Enterprise | Legal AI Solutions",
    description:
      "Deploy proven legal AI technology in your infrastructure. Cloud, on-premise, or hybrid deployment.",
    images: ["/og-image-enterprise.png"],
    creator: "@aitax",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://ai-tax.example.com/enterprise",
  },
  category: "Legal Technology",
};

export default function EnterpriseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* JSON-LD Structured Data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "AI-Tax Enterprise",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description:
              "Enterprise legal AI platform for document analysis, semantic search, and structured data extraction",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
            },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: "4.8",
              ratingCount: "50",
            },
            featureList: [
              "AI-Powered Semantic Search",
              "Structured Data Extraction",
              "Document Similarity Analysis",
              "Multi-language Support",
              "On-Premise Deployment",
              "GDPR Compliance",
            ],
            provider: {
              "@type": "Organization",
              name: "Wrocław University of Science and Technology",
              url: "https://pwr.edu.pl",
            },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "What languages does AI-Tax support?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "AI-Tax currently supports Polish, English, German, and French for document processing and search. We can add support for additional languages based on your requirements.",
                },
              },
              {
                "@type": "Question",
                name: "Can we deploy AI-Tax on our own infrastructure?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes, we offer on-premise deployment where the entire platform runs in your data center or private cloud. We provide Docker containers and comprehensive deployment documentation.",
                },
              },
              {
                "@type": "Question",
                name: "How is data security and privacy handled?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "We implement enterprise-grade security including end-to-end encryption, role-based access control, audit logging, and GDPR compliance tools. For on-premise deployments, all data remains within your infrastructure.",
                },
              },
            ],
          }),
        }}
      />
      {children}
    </>
  );
}
