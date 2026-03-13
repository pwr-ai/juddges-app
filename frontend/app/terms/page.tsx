"use client";

import { LightCard } from "@/lib/styles/components/light-card";
import { Header } from "@/lib/styles/components/HeaderWithIcon";
import { SecondaryHeader } from "@/lib/styles/components/secondary-header";
import { SectionHeader } from "@/lib/styles/components/section-header";
import { Separator } from "@/components/ui/separator";
import { FileText, AlertTriangle, Users, Scale } from "lucide-react";
import React from "react";

export default function TermsPage(): React.ReactElement {
 return (
 <div className="container mx-auto px-6 py-12 md:px-8 lg:px-12 max-w-4xl">
 {/* Header */}
 <div className="mb-8">
 <Header
 icon={FileText}
 title="Terms of Service"
 size="4xl"
 description={`Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`}
 />
 </div>

 {/* Introduction */}
 <LightCard padding="lg"className="mb-8">
 <p className="text-base leading-relaxed text-muted-foreground">
 These Terms of Service (&quot;Terms&quot;) govern your access to and use of the JuDDGES platform operated by
 Wrocław University of Science and Technology and collaborators. By accessing or using our platform, you agree to be
 bound by these Terms.
 </p>
 </LightCard>

 {/* Important Legal Notice */}
 <LightCard
 padding="lg"
 className="mb-8 border-2 border-amber-500 bg-amber-500/20 ring-2 ring-amber-500/20 shadow-lg [&>div:first-child]:bg-gradient-to-br [&>div:first-child]:from-amber-500/15 [&>div:first-child]:via-amber-400/8 [&>div:first-child]:via-transparent [&>div:first-child]:to-amber-500/10"
 >
 <div className="flex items-start gap-3 relative z-10">
 <AlertTriangle className="size-6 text-amber-600 mt-0.5 flex-shrink-0"/>
 <div className="space-y-2">
 <h3 className="font-semibold text-amber-900">Important Legal Notice</h3>
 <p className="text-sm text-amber-800">
 JuDDGES is a research platform providing AI-powered legal information for educational and research
 purposes only. This platform does not provide legal advice and should not be used as a substitute
 for consultation with a qualified attorney. Always consult a licensed legal professional for advice
 regarding your specific legal matters.
 </p>
 </div>
 </div>
 </LightCard>

 <div className="space-y-8">
 {/* Section 1: Acceptance of Terms */}
 <section>
 <SecondaryHeader
 icon={FileText}
 title="1. Acceptance of Terms"
 className="mb-4"
 />
 <div className="space-y-4 text-muted-foreground">
 <p>
 By creating an account or using the JuDDGES platform, you acknowledge that you have read,
 understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree
 to these Terms, you must not access or use the platform.
 </p>
 </div>
 </section>

 <Separator />

 {/* Section 2: Platform Purpose and Scope */}
 <section>
 <SecondaryHeader
 icon={Scale}
 title="2. Platform Purpose and Scope"
 className="mb-4"
 />
 <div className="space-y-4 text-muted-foreground">
 <div>
 <SectionHeader title="2.1 Research Platform"className="mb-2"/>
 <p>
 JuDDGES is an academic research platform designed to support legal research and education through
 AI-powered analysis of court judgments and legal documents.
 </p>
 </div>

 <div>
 <SectionHeader title="2.2 Not Legal Advice"className="mb-2"/>
 <p>
 The platform provides information and analysis tools but does not provide legal advice, opinions,
 or recommendations. All content is for informational and educational purposes only.
 </p>
 </div>

 <div>
 <SectionHeader title="2.3 AI-Generated Content"className="mb-2"/>
 <p>
 AI-generated summaries, analyses, and responses may contain errors, inaccuracies, or outdated
 information. Users must independently verify all information before relying on it.
 </p>
 </div>
 </div>
 </section>

 <Separator />

 {/* Section 3: User Eligibility and Accounts */}
 <section>
 <SecondaryHeader
 icon={Users}
 title="3. User Eligibility and Accounts"
 className="mb-4"
 />
 <div className="space-y-4 text-muted-foreground">
 <div>
 <SectionHeader title="3.1 Eligibility"className="mb-2"/>
 <p>
 To use this platform, you must be at least 18 years old and capable of forming a binding contract.
 By using the platform, you represent that you meet these requirements.
 </p>
 </div>

 <div>
 <SectionHeader title="3.2 Account Registration"className="mb-2"/>
 <p>You agree to:</p>
 <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
 <li>Provide accurate and complete registration information</li>
 <li>Maintain the security of your account credentials</li>
 <li>Notify us immediately of any unauthorized access</li>
 <li>Be responsible for all activities under your account</li>
 </ul>
 </div>

 <div>
 <SectionHeader title="3.3 Account Termination"className="mb-2"/>
 <p>
 We reserve the right to suspend or terminate accounts that violate these Terms or engage in
 inappropriate conduct.
 </p>
 </div>
 </div>
 </section>

 <Separator />

 {/* Section 4: Acceptable Use */}
 <section>
 <SecondaryHeader
 icon={AlertTriangle}
 title="4. Acceptable Use Policy"
 className="mb-4"
 />
 <div className="space-y-4 text-muted-foreground">
 <p>You agree NOT to:</p>
 <ul className="list-disc list-inside ml-4 space-y-2">
 <li>Use the platform for any unlawful purpose or in violation of any regulations</li>
 <li>Attempt to gain unauthorized access to any part of the platform</li>
 <li>Interfere with or disrupt the platform&apos;s operation or security</li>
 <li>Use automated tools to scrape or download bulk data without permission</li>
 <li>Misrepresent your identity or affiliation</li>
 <li>Upload malicious code, viruses, or harmful content</li>
 <li>Reverse engineer or attempt to extract source code</li>
 <li>Use the platform to provide legal services to third parties</li>
 <li>Redistribute or resell access to the platform</li>
 </ul>
 </div>
 </section>

 <Separator />

 {/* Section 5: Intellectual Property */}
 <section>
 <SecondaryHeader
 icon={FileText}
 title="5. Intellectual Property"
 className="mb-4"
 />
 <div className="space-y-4 text-muted-foreground">
 <div>
 <SectionHeader title="5.1 Platform Ownership"className="mb-2"/>
 <p>
 All content, features, and functionality of the JuDDGES platform, including but not limited to
 software, text, graphics, logos, and design, are owned by Wrocław University of Science and
 Technology and collaborators and are protected by copyright and other intellectual property laws.
 </p>
 </div>

 <div>
 <SectionHeader title="5.2 Legal Documents"className="mb-2"/>
 <p>
 Court judgments and legal documents available on the platform are public domain or used with
 appropriate permissions. Original database compilation, AI analysis, and platform features are
 proprietary.
 </p>
 </div>

 <div>
 <SectionHeader title="5.3 Open Source Components"className="mb-2"/>
 <p>
 Certain components of the platform are open source. See our{""}
 <a href="https://github.com/pwr-ai/legal-ai"className="text-primary hover:underline"target="_blank"rel="noopener noreferrer">
 GitHub repository
 </a>
 {""}for licenses and attribution.
 </p>
 </div>

 <div>
 <SectionHeader title="5.4 User-Generated Content"className="mb-2"/>
 <p>
 By using the platform, you grant us a non-exclusive, worldwide license to use, store, and process
 your queries and interactions for research and platform improvement purposes.
 </p>
 </div>
 </div>
 </section>

 <Separator />

 {/* Section 6: Disclaimers and Limitations */}
 <section>
 <SecondaryHeader
 icon={AlertTriangle}
 title="6. Disclaimers and Limitations of Liability"
 className="mb-4"
 />
 <div className="space-y-4 text-muted-foreground">
 <div>
 <SectionHeader title="6.1 &quot;As Is&quot; Provision"className="mb-2"/>
 <p>
 The platform is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express
 or implied, including but not limited to warranties of merchantability, fitness for a particular
 purpose, or non-infringement.
 </p>
 </div>

 <div>
 <SectionHeader title="6.2 No Warranty of Accuracy"className="mb-2"/>
 <p>
 We do not warrant that:
 </p>
 <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
 <li>The platform will be error-free or uninterrupted</li>
 <li>Information provided is accurate, complete, or current</li>
 <li>AI-generated content is reliable or suitable for your purposes</li>
 <li>Defects will be corrected</li>
 </ul>
 </div>

 <div>
 <SectionHeader title="6.3 Limitation of Liability"className="mb-2"/>
 <p>
 To the maximum extent permitted by law, Wrocław University of Science and Technology shall not be
 liable for any indirect, incidental, special, consequential, or punitive damages resulting from
 your use or inability to use the platform.
 </p>
 </div>

 <div>
 <SectionHeader title="6.4 Research Platform"className="mb-2"/>
 <p>
 This is an experimental research platform. Features may change, be discontinued, or contain errors.
 Use at your own risk.
 </p>
 </div>
 </div>
 </section>

 <Separator />

 {/* Section 7: Data and Privacy */}
 <section>
 <SecondaryHeader
 icon={Scale}
 title="7. Data and Privacy"
 className="mb-4"
 />
 <div className="space-y-4 text-muted-foreground">
 <p>
 Your use of the platform is subject to our{""}
 <a href="/privacy"className="text-primary hover:underline">Privacy Policy</a>, which is incorporated
 into these Terms by reference. By using the platform, you consent to our collection and use of data
 as described in the Privacy Policy.
 </p>
 <p>
 For research purposes, we may use anonymized usage data and interaction patterns. This data helps
 improve AI systems and contributes to academic research in legal technology.
 </p>
 </div>
 </section>

 <Separator />

 {/* Section 8: Modification and Termination */}
 <section>
 <SecondaryHeader
 icon={FileText}
 title="8. Modification and Termination"
 className="mb-4"
 />
 <div className="space-y-4 text-muted-foreground">
 <div>
 <SectionHeader title="8.1 Changes to Terms"className="mb-2"/>
 <p>
 We reserve the right to modify these Terms at any time. We will notify users of material changes
 via email or platform notice. Continued use after changes constitutes acceptance of the modified Terms.
 </p>
 </div>

 <div>
 <SectionHeader title="8.2 Platform Changes"className="mb-2"/>
 <p>
 We may modify, suspend, or discontinue any aspect of the platform at any time without prior notice.
 </p>
 </div>

 <div>
 <SectionHeader title="8.3 Termination"className="mb-2"/>
 <p>
 Either party may terminate your access to the platform at any time. Upon termination, your right
 to use the platform ceases immediately.
 </p>
 </div>
 </div>
 </section>

 <Separator />

 {/* Section 9: Governing Law */}
 <section>
 <SecondaryHeader
 icon={Scale}
 title="9. Governing Law and Jurisdiction"
 className="mb-4"
 />
 <div className="space-y-4 text-muted-foreground">
 <p>
 These Terms are governed by the laws of Poland and the European Union, without regard to conflict
 of law principles. Any disputes arising from these Terms or your use of the platform shall be subject
 to the exclusive jurisdiction of the courts of Wrocław, Poland.
 </p>
 </div>
 </section>

 <Separator />

 {/* Section 10: Miscellaneous */}
 <section>
 <SecondaryHeader
 icon={FileText}
 title="10. Miscellaneous"
 className="mb-4"
 />
 <div className="space-y-4 text-muted-foreground">
 <div>
 <SectionHeader title="10.1 Entire Agreement"className="mb-2"/>
 <p>
 These Terms, together with the Privacy Policy, constitute the entire agreement between you and
 Wrocław University of Science and Technology regarding the platform.
 </p>
 </div>

 <div>
 <SectionHeader title="10.2 Severability"className="mb-2"/>
 <p>
 If any provision of these Terms is found to be unenforceable, the remaining provisions will remain
 in full force and effect.
 </p>
 </div>

 <div>
 <SectionHeader title="10.3 No Waiver"className="mb-2"/>
 <p>
 Our failure to enforce any provision of these Terms shall not constitute a waiver of that provision
 or any other provision.
 </p>
 </div>

 <div>
 <SectionHeader title="10.4 Assignment"className="mb-2"/>
 <p>
 You may not assign or transfer these Terms or your rights under them without our prior written consent.
 </p>
 </div>
 </div>
 </section>

 <Separator />

 {/* Section 11: Contact */}
 <section>
 <SecondaryHeader
 icon={Users}
 title="11. Contact Information"
 className="mb-4"
 />
 <div className="space-y-4 text-muted-foreground">
 <p>For questions about these Terms, contact us at:</p>
 <LightCard padding="md"className="mt-4">
 <div className="space-y-2 text-sm">
 <p><strong>Email:</strong> <a href="mailto:lukasz.augustyniak@pwr.edu.pl"className="text-primary hover:underline">lukasz.augustyniak@pwr.edu.pl</a></p>
 <p><strong>Address:</strong> Wrocław University of Science and Technology, Wybrzeże Wyspiańskiego 27, 50-370 Wrocław, Poland</p>
 </div>
 </LightCard>
 </div>
 </section>
 </div>

 {/* Acknowledgment */}
 <LightCard padding="lg"className="mt-8">
 <h3 className="font-semibold text-foreground mb-3">Acknowledgment</h3>
 <p className="text-base leading-relaxed text-muted-foreground">
 By using the JuDDGES platform, you acknowledge that you have read these Terms of Service and agree to be
 bound by them. If you do not agree to these Terms, please discontinue use of the platform immediately.
 </p>
 </LightCard>
 </div>
 );
}
