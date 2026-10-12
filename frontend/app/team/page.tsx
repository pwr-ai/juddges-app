"use client";

import { useState } from "react";
import Image from "next/image";
import { Mail, Users, ArrowRight } from "lucide-react";
import { LinkedinIcon } from "@/components/icons/brand";
import { teamMembers, type TeamMember } from "@/lib/project-content";
import { Header, Badge, LightCard, VariantButton, PageContainer, SecondaryHeader } from "@/lib/styles/components";

function TeamMemberCard({ member }: { member: TeamMember }) {
 const [imageError, setImageError] = useState(false);
 const initials = member.name
 .split(" ")
 .map((word) => word[0])
 .join("")
 .toUpperCase()
 .slice(0, 2);

 return (
 <LightCard padding="lg"className="overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full">
 <div className="flex flex-col items-center text-center flex-1">
 <div className="relative w-32 h-32 mb-6">
 {member.image && !imageError ? (
 <Image
 src={member.image}
 alt={`${member.name} - ${member.role}`}
 fill
 className="object-cover rounded-full"
 sizes="128px"
 onError={() => setImageError(true)}
 />
 ) : (
 <div className="w-full h-full rounded-full bg-parchment-deep border border-rule flex items-center justify-center text-2xl font-bold text-ink">
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
 <VariantButton intent="secondary"
 size="sm"
 className="flex-1 !h-9 !min-h-[36px] !max-h-[36px]"
 onClick={() => window.open(member.linkedin, '_blank')}
 >
 <LinkedinIcon className="h-4 w-4 mr-2"/>
 LinkedIn
 </VariantButton>
 )}
 {member.email && (
 <VariantButton intent="secondary"
 size="sm"
 className="flex-1 !h-9 !min-h-[36px] !max-h-[36px]"
 onClick={() => window.location.href = `mailto:${member.email}`}
 >
 <Mail className="h-4 w-4 mr-2"/>
 Email
 </VariantButton>
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
 <div className="flex flex-col items-center justify-center text-center">
 <h2 className="text-3xl font-bold mb-6 text-ink font-display">
 Join Our Team
 </h2>
 <p className="text-muted-foreground mb-8 max-w-2xl mx-auto text-base leading-relaxed text-justify">
 We&apos;re always looking for talented researchers and engineers interested in AI and legal technology.
 If you&apos;re passionate about advancing legal research through artificial intelligence, we&apos;d love to hear from you.
 </p>
 <VariantButton intent="secondary"
 size="md"
 icon={ArrowRight}
 onClick={() => window.location.href = '/contact'}
 >
 Get in Touch
 </VariantButton>
 </div>
 </LightCard>
 </PageContainer>
 );
}
