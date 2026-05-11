"use client";

import { useState } from "react";
import Link from "next/link";
import {
 HelpCircle,
 Search,
 BookOpen,
 MessageSquare,
 Database,
 Sparkles,
 FileText,
 Settings,
 Shield,
 Mail,
} from "lucide-react";

import {
 PageContainer,
 Header,
 Badge,
 LightCard,
 SecondaryHeader,
 PrimaryButton,
 SecondaryButton,
} from "@/lib/styles/components";
import { SearchInput } from "@/lib/styles/components/search-input";
import {
 Accordion,
 AccordionContent,
 AccordionItem,
 AccordionTrigger,
} from "@/lib/styles/components/accordion";

export default function HelpPage() {
 const [searchQuery, setSearchQuery] = useState("");

 const categories = [
 {
 id: "getting-started",
 title: "Getting Started",
 icon: BookOpen,
 questions: [
 {
 q: "I'm new — where should I start? ",
 a: "Take the in-app onboarding tour at /onboarding. It's a three-step walk-through with screenshots covering search, collections, and the base coding schema — about 20 minutes end to end. The long-form version with extra context lives in the docs site under Tutorials → First 30 minutes.",
 },
 {
 q: "What is JuDDGES? ",
 a: "JuDDGES (Judicial Decision Data Gathering, Encoding, and Sharing) is an open-source research platform developed by Wroclaw University of Science and Technology that provides AI-powered legal document analysis and research tools for court judgments. It combines advanced natural language processing with a comprehensive database of legal documents from Poland and England & Wales.",
 },
 {
 q: "How do I create an account? ",
 a: "Currently, JuDDGES is in research beta. Account access is provided to academic researchers and collaborators. To request access, please contact us at lukasz.augustyniak@pwr.edu.pl with your academic affiliation and research interests.",
 },
 {
 q: "Is JuDDGES free to use? ",
 a: "Yes, JuDDGES is free for academic and research purposes. The platform is funded by Wroclaw University of Science and Technology as part of the JuDDGES research project.",
 },
	 {
	 q: "What kind of legal documents can I find on JuDDGES? ",
	 a: "The platform contains court judgments and related legal materials for research and analysis. The database is continuously updated with new documents from official sources.",
	 },
 ],
 },
 {
 id: "search",
 title: "Search & Discovery",
 icon: Search,
 questions: [
 {
 q: "What's the difference between Rabbit and Thinking search modes? ",
 a: "Rabbit mode provides fast, simple keyword-based searches ideal for quick lookups. Thinking mode uses advanced AI reasoning to understand complex queries, analyze context, and provide more nuanced results. Use Rabbit for straightforward searches and Thinking for complex legal research questions.",
 },
	 {
	 q: "How do I search for specific document types? ",
	 a: "Use the filters in the search interface to narrow down by document type, jurisdiction, date range, and language. You can also use advanced search operators in your query.",
	 },
 {
 q: "Can I save my search results? ",
 a: "Yes, you can save individual documents to collections for later reference. Collections allow you to organize documents by topic, case, or research project.",
 },
 {
 q: "How recent is the document database? ",
 a: "The database is updated regularly with new documents. The homepage shows statistics including the most recent update date. New judgments are typically added within 1-2 weeks of publication.",
 },
 ],
 },
 {
 id: "ai-assistant",
 title: "AI Assistant & Chat",
 icon: MessageSquare,
 questions: [
 {
 q: "How does the AI chat assistant work? ",
 a: "The AI assistant uses advanced language models trained on legal documents to answer questions, summarize content, and provide analysis. It retrieves relevant documents from the database and uses them to generate informed responses.",
 },
 {
 q: "Can I trust the AI's legal advice? ",
 a: "No. The AI assistant provides information and analysis for research and educational purposes only. It does NOT provide legal advice and should never be used as a substitute for consultation with a qualified attorney. Always verify information with legal professionals.",
 },
	 {
	 q: "What can I ask the AI assistant? ",
	 a: "You can ask about legal concepts, request document summaries, compare cases, analyze legal arguments, or research specific issues in case law. The AI works best with specific, well-formulated questions related to judgments and legal reasoning.",
	 },
 {
 q: "How many documents does the AI consider in its responses? ",
 a: "By default, the AI assistant retrieves and considers up to 20 relevant documents when generating responses. This ensures comprehensive coverage while maintaining response quality.",
 },
 ],
 },
 {
 id: "data-extraction",
 title: "Data Extraction & Schemas",
 icon: Database,
 questions: [
 {
 q: "What is data extraction? ",
 a: "Data extraction allows you to automatically extract structured information from legal documents using custom schemas. For example, you can extract party names, dates, legal citations, or specific clauses from judgments.",
 },
 {
 q: "How do I create a custom schema? ",
 a: "Navigate to the Schemas section and create a new schema by defining the fields you want to extract. You can specify field types (text, date, number), descriptions, and validation rules. The AI will then extract these fields from documents you select.",
 },
 {
 q: "Can I export extracted data? ",
 a: "Yes, extracted data can be exported in various formats including CSV, JSON, and XML for further analysis in other tools or databases.",
 },
 {
 q: "What languages are supported for extraction? ",
 a: "Currently, the platform primarily supports Polish legal documents, but the extraction system can work with documents in multiple languages depending on the AI model configuration.",
 },
 ],
 },
 {
 id: "features",
 title: "Platform Features",
 icon: Sparkles,
 questions: [
 {
 q: "What are Collections? ",
 a: "Collections allow you to organize and group documents by topic, case, or research project. You can create multiple collections, add documents to them, and share them with collaborators.",
 },
 {
 q: "How do document summaries work? ",
 a: "AI-generated summaries provide concise overviews of legal documents, highlighting key points, decisions, and legal reasoning. Summaries are automatically generated when you view a document.",
 },
 {
 q: "Can I compare multiple documents? ",
 a: "Yes, you can use the AI assistant to compare documents by asking specific comparison questions, or use the compare feature (coming soon) to view side-by-side analysis of multiple judgments.",
 },
 {
 q: "What citation formats are supported? ",
 a: "Documents include standard legal citations following Polish legal citation conventions. You can export citations in various academic formats.",
 },
 ],
 },
 {
 id: "privacy",
 title: "Privacy & Security",
 icon: Shield,
 questions: [
 {
 q: "Is my data secure? ",
 a: "Yes. All data is stored on EU-hosted servers with SSL encryption. We follow GDPR requirements and industry best practices for data security. See our Privacy Policy for details.",
 },
 {
 q: "What data do you collect? ",
 a: "We collect account information (email, name), usage data (searches, chat interactions), and research data (anonymized usage patterns). This helps us improve the platform and conduct academic research.",
 },
 {
 q: "Are my searches private? ",
 a: "Your searches are associated with your account for personalization and research purposes, but are not shared publicly. Anonymized search patterns may be used for research.",
 },
 {
 q: "Can I delete my account and data? ",
 a: "Yes. You have the right to request deletion of your account and personal data under GDPR. Contact lukasz.augustyniak@pwr.edu.pl to exercise this right.",
 },
 ],
 },
 {
 id: "technical",
 title: "Technical Support",
 icon: Settings,
 questions: [
 {
 q: "The platform is loading slowly. What should I do? ",
 a: "Slow loading can be caused by network issues or high server load. Try refreshing the page, clearing your browser cache, or accessing the platform during off-peak hours. If issues persist, contact lukasz.augustyniak@pwr.edu.pl.",
 },
 {
 q: "I found a bug. How do I report it? ",
 a: "Please report bugs via lukasz.augustyniak@pwr.edu.pl or open an issue on our GitHub repository at github.com/pwr-ai/juddges-app. Include steps to reproduce, expected behavior, and any error messages.",
 },
 {
 q: "Which browsers are supported? ",
 a: "JuDDGES works best on modern browsers including Chrome, Firefox, Safari, and Edge (latest versions). We recommend keeping your browser updated for optimal performance and security.",
 },
 {
 q: "Can I use the platform on mobile devices? ",
 a: "Yes, the platform is responsive and works on mobile devices, though some features are optimized for desktop use. We recommend tablets or larger screens for the best experience.",
 },
 ],
 },
 ];

 const filteredCategories = categories.map((category) => ({
 ...category,
 questions: category.questions.filter(
 (q) =>
 searchQuery === ""||
 q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
 q.a.toLowerCase().includes(searchQuery.toLowerCase())
 ),
 })).filter((category) => category.questions.length > 0);

 return (
 <PageContainer width="medium"className="py-12">
 {/* Header */}
 <div className="mb-16 text-center">
 <Badge variant="outline"className="mb-6 mx-auto">
 <HelpCircle className="size-3 mr-1.5"/>
 Help Center
 </Badge>
 <Header
 title="How can we help you? "
 size="4xl"
 description="Find answers to common questions about using JuDDGES, or contact our support team for personalized assistance."
 className="items-center text-center"
 />

 {/* Search */}
 <div className="max-w-2xl mx-auto mt-10">
 <SearchInput
 placeholder="Search help articles..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 size="xl"
 showGlow={true}
 />
 </div>
 </div>

 {/* Quick Links */}
 <div className="grid md:grid-cols-3 gap-6 mb-16">
 <LightCard padding="lg"className="hover:shadow-lg transition-all duration-200 border-2 hover:border-primary/20 cursor-pointer"onClick={() => window.location.href = '/contact'}>
 <div className="flex flex-col h-full">
 <MessageSquare className="size-10 text-primary mb-4"/>
 <h3 className="font-semibold text-lg mb-3">Contact Support</h3>
 <p className="text-sm text-muted-foreground leading-relaxed">
 Get personalized help from our team
 </p>
 </div>
 </LightCard>

 <LightCard padding="lg"className="hover:shadow-lg transition-all duration-200 border-2 hover:border-primary/20 cursor-pointer"onClick={() => window.location.href = '/about'}>
 <div className="flex flex-col h-full">
 <BookOpen className="size-10 text-primary mb-4"/>
 <h3 className="font-semibold text-lg mb-3">About the Project</h3>
 <p className="text-sm text-muted-foreground leading-relaxed">
 Learn about the JuDDGES research project
 </p>
 </div>
 </LightCard>

 <LightCard padding="lg"className="hover:shadow-lg transition-all duration-200 border-2 hover:border-primary/20 cursor-pointer"onClick={() => window.open('https://github.com/pwr-ai/juddges-app', '_blank')}>
 <div className="flex flex-col h-full">
 <FileText className="size-10 text-primary mb-4"/>
 <h3 className="font-semibold text-lg mb-3">Documentation</h3>
 <p className="text-sm text-muted-foreground leading-relaxed">
 View technical documentation on GitHub
 </p>
 </div>
 </LightCard>
 </div>

 {/* FAQ Sections */}
 <div className="space-y-12">
 {filteredCategories.length === 0 ? (
 <LightCard padding="lg"className="text-center">
 <Search className="size-12 text-muted-foreground mx-auto mb-4"/>
 <h3 className="text-xl font-semibold mb-3">No results found</h3>
 <p className="text-muted-foreground">
 Try different keywords or{""}
 <Link href="/contact"className="text-primary hover:underline">
 contact support
 </Link>
 </p>
 </LightCard>
 ) : (
 filteredCategories.map((category) => (
 <div key={category.id}>
 <SecondaryHeader
 icon={category.icon}
 title={category.title}
 className="mb-6"
 showBorder={false}
 />

 <Accordion type="multiple"className="space-y-3">
 {category.questions.map((question, idx) => (
 <AccordionItem
 key={idx}
 value={`${category.id}-${idx}`}
 className="border rounded-xl bg-gradient-to-br from-blue-50/60 via-indigo-50/30 to-purple-50/20 backdrop-blur-sm border-blue-200/50 shadow-sm px-6 py-2 transition-all duration-300"
 >
 <AccordionTrigger className="hover:no-underline hover:bg-transparent text-left py-5 group">
 <span className="font-medium text-base group-hover:text-primary transition-colors">{question.q}</span>
 </AccordionTrigger>
 <AccordionContent className="text-muted-foreground pt-2 pb-5 text-base leading-relaxed">
 {question.a}
 </AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </div>
 ))
 )}
 </div>

 {/* Still Need Help */}
 <LightCard padding="lg"className="mt-16 bg-muted/30 text-center">
 <h2 className="text-3xl font-semibold mb-4">Still need help?</h2>
 <p className="text-muted-foreground mb-8 max-w-2xl mx-auto text-lg leading-relaxed">
 Can&apos;t find what you&apos;re looking for? Our support team is ready to assist you with
 any questions or issues you may have.
 </p>
 <div className="flex flex-wrap justify-center gap-4">
 <PrimaryButton
 size="lg"
 onClick={() => window.location.href = '/contact'}
 >
 Contact Support
 </PrimaryButton>
 <SecondaryButton
 size="lg"
 icon={Mail}
 onClick={() => window.location.href = 'mailto:lukasz.augustyniak@pwr.edu.pl'}
 >
 Email Us
 </SecondaryButton>
 </div>
 </LightCard>
 </PageContainer>
 );
}
