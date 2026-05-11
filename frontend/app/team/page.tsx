"use client";

import { useState } from "react";
import Image from "next/image";
import { Linkedin, Mail, Users, ArrowRight } from "lucide-react";
import {
 Header,
 Badge,
 LightCard,
 SecondaryButton,
 PrimaryButton,
 PageContainer,
 SecondaryHeader,
} from "@/lib/styles/components";

interface TeamMember {
 name: string;
 role: string;
 description: string;
 image: string;
 linkedin?: string;
 email?: string;
}

const teamMembers: TeamMember[] = [
 {
 name: "Łukasz Augustyniak",
 role: "Lead AI Architect",
 description: "Lead AI architect and lawyer by training, specializing in natural language processing, machine learning, and sentiment analysis. Combines technical AI expertise with legal knowledge to bridge cutting-edge technology with regulatory frameworks. Published researcher with expertise in transfer learning and text classification.",
 image: "/team/lukasz-augustyniak.jpg",
 linkedin: "https://www.linkedin.com/in/lukaszaugustyniak/",
 email: "lukasz.augustyniak@pwr.edu.pl"
 },
 {
 name: "Prof. Tomasz Kajdanowicz",
 role: "Supervisor & Project Leader",
 description: "Professor at Wrocław University of Science and Technology and Founder of handling.ai. Experienced researcher and practitioner in machine learning, data science, social network analysis, and collective classification. Leads research projects bridging academic excellence with real-world AI applications in legal and tax domains.",
 image: "/team/tomasz-kajdanowicz.jpg",
 linkedin: "https://www.linkedin.com/in/kajdanowicz/",
 email: "tomasz.kajdanowicz@pwr.edu.pl"
 },
 {
 name: "Albert Sawczyn",
 role: "PhD Student & Developer",
 description: "PhD student at Wrocław University of Science and Technology (2021-2025) specializing in AI and machine learning. Contributes to research on graph-level representations, knowledge graphs, and fact-checking systems for large language models. Co-author of FactSelfCheck and other innovative NLP solutions.",
 image: "/team/albert-sawczyn.jpg",
 linkedin: "https://www.linkedin.com/in/albert-sawczyn/",
 email: "albert.sawczyn@pwr.edu.pl"
 },
 {
 name: "Jakub Binkowski",
 role: "PhD Student & Developer",
 description: "PhD student in Large Language Models and Graph Representation Learning at Wrocław University of Science and Technology. Recently defended thesis on unsupervised graph representation learning. Specializes in hallucination detection in LLMs, spectral graph theory, and multiplex network embeddings. Author of LapEigvals method and contributor to PLLuM project.",
 image: "/team/jakub-binkowski.jpg",
 linkedin: "https://www.linkedin.com/in/jakub-binkowski/",
 email: "jakub.binkowski@pwr.edu.pl"
 }
];

function TeamMemberCard({ member }: { member: TeamMember }) {
 const [imageError, setImageError] = useState(false);
 const initials = member.name
 .split("")
 .map((word) => word[0])
 .join("")
 .toUpperCase()
 .slice(0, 2);

 return (
 <LightCard padding="lg"className="overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full">
 <div className="flex flex-col items-center text-center flex-1">
 <div className="relative w-32 h-32 mb-6">
 {!imageError ? (
 <Image
 src={member.image}
 alt={`${member.name} - ${member.role}`}
 fill
 className="object-cover rounded-full"
 sizes="128px"
 onError={() => setImageError(true)}
 />
 ) : (
 <div className="w-full h-full rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
 {initials}
 </div>
 )}
 </div>
 <h3 className="text-xl font-bold mb-2">{member.name}</h3>
 <Badge variant="secondary"className="mb-4">
 {member.role}
 </Badge>
 <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-1 text-justify">
 {member.description}
 </p>

 {/* Contact Links */}
 <div className="flex gap-2 w-full mt-auto">
 {member.linkedin && (
 <SecondaryButton
 size="sm"
 className="flex-1 !h-9 !min-h-[36px] !max-h-[36px]"
 onClick={() => window.open(member.linkedin, '_blank')}
 >
 <Linkedin className="h-4 w-4 mr-2"/>
 LinkedIn
 </SecondaryButton>
 )}
 {member.email && (
 <SecondaryButton
 size="sm"
 className="flex-1 !h-9 !min-h-[36px] !max-h-[36px]"
 onClick={() => window.location.href = `mailto:${member.email}`}
 >
 <Mail className="h-4 w-4 mr-2"/>
 Email
 </SecondaryButton>
 )}
 </div>
 </div>
 </LightCard>
 );
}

export default function TeamPage() {
 return (
 <PageContainer width="standard"className="py-12">
 {/* Header */}
 <div className="mb-16">
 <Badge variant="outline"className="mb-6">
 Our Team
 </Badge>
 <Header
 icon={Users}
 title="Meet the Research Team"
 size="4xl"
 description="A dedicated team of researchers and engineers from Wrocław University of Science and Technology working to advance AI-powered legal research and document analysis."
 />
 </div>

 {/* Team Grid */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
 {teamMembers.map((member, index) => (
 <TeamMemberCard key={index} member={member} />
 ))}
 </div>

 {/* Join Section */}
 <LightCard padding="lg"className="text-center">
 <div className="flex flex-col items-center justify-center text-center py-6">
 <h2 className="text-3xl font-bold mb-6 bg-gradient-to-br from-foreground via-primary to-primary bg-clip-text text-transparent">
 Join Our Team
 </h2>
 <p className="text-muted-foreground mb-8 max-w-2xl mx-auto text-base leading-relaxed text-justify">
 We&apos;re always looking for talented researchers and engineers interested in AI and legal technology.
 If you&apos;re passionate about advancing legal research through artificial intelligence, we&apos;d love to hear from you.
 </p>
 <SecondaryButton
 size="md"
 icon={ArrowRight}
 onClick={() => window.location.href = '/contact'}
 >
 Get in Touch
 </SecondaryButton>
 </div>
 </LightCard>
 </PageContainer>
 );
}
