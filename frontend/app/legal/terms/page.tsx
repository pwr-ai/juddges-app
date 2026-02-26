import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileText, AlertTriangle, Users, Scale, Shield } from "lucide-react";
import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | JuDDGES",
  description: "Terms of service for JuDDGES judgments analysis platform",
};

export default function TermsPage() {
  return (
    <div className="container mx-auto px-6 py-12 md:px-8 lg:px-12 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Badge variant="outline" className="mb-4">
          <FileText className="size-3 mr-1.5" />
          Terms of Service
        </Badge>
        <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
        <p className="text-muted-foreground">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Introduction */}
      <Card className="p-6 mb-8 bg-muted/30">
        <p className="text-sm">
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of the JuDDGES platform operated by
          Wrocław University of Science and Technology and collaborators. By accessing or using our platform, you agree to be
          bound by these Terms.
        </p>
      </Card>

      {/* Important Legal Notice */}
      <Card className="p-6 mb-8 border-amber-500/50 bg-amber-500/10">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">Important Legal Notice</h3>
            <p className="text-sm text-muted-foreground">
              JuDDGES is a research platform providing AI-powered legal information for educational and research
              purposes only. This platform does not provide legal advice and should not be used as a substitute
              for consultation with a qualified attorney. Always consult a licensed legal professional for advice
              regarding your specific legal matters.{" "}
              <Link href="/legal/disclaimer" className="text-primary hover:underline font-semibold">
                Read full disclaimer
              </Link>
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-8">
        {/* Section 1: Acceptance of Terms */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">1. Acceptance of Terms</h2>
          </div>
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
          <div className="flex items-center gap-2 mb-4">
            <Scale className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">2. Platform Purpose and Scope</h2>
          </div>
          <div className="space-y-4 text-muted-foreground">
            <div>
              <h3 className="font-medium text-foreground mb-2">2.1 Research Platform</h3>
              <p>
                JuDDGES is an academic research platform designed to support legal research and education through
                AI-powered analysis of court judgments and tax law documents.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">2.2 Not Legal Advice</h3>
              <p>
                The platform provides information and analysis tools but does not provide legal advice, opinions,
                or recommendations. All content is for informational and educational purposes only.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">2.3 AI-Generated Content</h3>
              <p>
                AI-generated summaries, analyses, and responses may contain errors, inaccuracies, or outdated
                information. Users must independently verify all information before relying on it.
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* NEW SECTION: Professional Use Limitations */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">3. Professional Use Limitations</h2>
          </div>
          <div className="space-y-4 text-muted-foreground">
            <div>
              <h3 className="font-medium text-foreground mb-2">3.1 No Attorney-Client Relationship</h3>
              <p>
                Use of this platform does <strong className="text-destructive">not</strong> create an attorney-client
                relationship between you and the platform operators, developers, or any associated parties.
                Attorney-client privilege does not apply to any information shared through this platform.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">3.2 Professional Responsibility</h3>
              <p>
                If you are a legal or tax professional, you acknowledge that:
              </p>
              <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li>You remain solely responsible for your professional conduct and work product</li>
                <li>You must verify all AI outputs against primary legal sources</li>
                <li>Use of AI tools does not diminish your professional obligations</li>
                <li>You must comply with your jurisdiction&apos;s professional conduct rules</li>
                <li>You are responsible for maintaining appropriate malpractice insurance</li>
              </ul>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">3.3 AI Limitations and Risks</h3>
              <p>
                You acknowledge that AI systems may:
              </p>
              <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li>Generate false or misleading information (&quot;hallucinations&quot;)</li>
                <li>Provide outdated or jurisdiction-inappropriate content</li>
                <li>Fail to understand context or nuances of your specific situation</li>
                <li>Exhibit biases present in training data</li>
                <li>Make errors in legal analysis or citation</li>
              </ul>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">3.4 Confidentiality Obligations</h3>
              <p>
                Do not submit confidential client information, privileged communications, or sensitive data
                without proper authorization and compliance with applicable data protection laws. You are
                responsible for ensuring compliance with GDPR, attorney-client privilege requirements,
                and other confidentiality obligations.
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Section 4: User Eligibility and Accounts */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Users className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">4. User Eligibility and Accounts</h2>
          </div>
          <div className="space-y-4 text-muted-foreground">
            <div>
              <h3 className="font-medium text-foreground mb-2">4.1 Eligibility</h3>
              <p>
                To use this platform, you must be at least 18 years old and capable of forming a binding contract.
                By using the platform, you represent that you meet these requirements.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">4.2 Account Registration</h3>
              <p>You agree to:</p>
              <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li>Provide accurate and complete registration information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Notify us immediately of any unauthorized access</li>
                <li>Be responsible for all activities under your account</li>
              </ul>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">4.3 Account Termination</h3>
              <p>
                We reserve the right to suspend or terminate accounts that violate these Terms or engage in
                inappropriate conduct.
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Section 5: Acceptable Use */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">5. Acceptable Use Policy</h2>
          </div>
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

        {/* Section 6: Intellectual Property */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">6. Intellectual Property</h2>
          </div>
          <div className="space-y-4 text-muted-foreground">
            <div>
              <h3 className="font-medium text-foreground mb-2">6.1 Platform Ownership</h3>
              <p>
                All content, features, and functionality of the JuDDGES platform, including but not limited to
                software, text, graphics, logos, and design, are owned by Wrocław University of Science and
                Technology and collaborators and are protected by copyright and other intellectual property laws.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">6.2 Legal Documents</h3>
              <p>
                Court judgments and legal documents available on the platform are public domain or used with
                appropriate permissions. Original database compilation, AI analysis, and platform features are
                proprietary.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">6.3 Open Source Components</h3>
              <p>
                Certain components of the platform are open source. See our{" "}
                <a href="https://github.com/pwr-ai/legal-ai" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  GitHub repository
                </a>
                {" "}for licenses and attribution.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">6.4 User-Generated Content</h3>
              <p>
                By using the platform, you grant us a non-exclusive, worldwide license to use, store, and process
                your queries and interactions for research and platform improvement purposes.
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Section 7: Disclaimers and Limitations */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">7. Disclaimers and Limitations of Liability</h2>
          </div>
          <div className="space-y-4 text-muted-foreground">
            <div>
              <h3 className="font-medium text-foreground mb-2">7.1 &quot;As Is&quot; Provision</h3>
              <p>
                The platform is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express
                or implied, including but not limited to warranties of merchantability, fitness for a particular
                purpose, or non-infringement.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">7.2 No Warranty of Accuracy</h3>
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
              <h3 className="font-medium text-foreground mb-2">7.3 Limitation of Liability</h3>
              <p>
                To the maximum extent permitted by law, Wrocław University of Science and Technology shall not be
                liable for any indirect, incidental, special, consequential, or punitive damages resulting from
                your use or inability to use the platform, including but not limited to professional malpractice
                claims, loss of business, or reputational harm.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">7.4 Research Platform</h3>
              <p>
                This is an experimental research platform. Features may change, be discontinued, or contain errors.
                Use at your own risk.
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Section 8: Data and Privacy */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Scale className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">8. Data and Privacy</h2>
          </div>
          <div className="space-y-4 text-muted-foreground">
            <p>
              Your use of the platform is subject to our{" "}
              <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>, which is incorporated
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

        {/* Section 9: Modification and Termination */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">9. Modification and Termination</h2>
          </div>
          <div className="space-y-4 text-muted-foreground">
            <div>
              <h3 className="font-medium text-foreground mb-2">9.1 Changes to Terms</h3>
              <p>
                We reserve the right to modify these Terms at any time. We will notify users of material changes
                via email or platform notice. Continued use after changes constitutes acceptance of the modified Terms.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">9.2 Platform Changes</h3>
              <p>
                We may modify, suspend, or discontinue any aspect of the platform at any time without prior notice.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">9.3 Termination</h3>
              <p>
                Either party may terminate your access to the platform at any time. Upon termination, your right
                to use the platform ceases immediately.
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Section 10: Governing Law */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Scale className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">10. Governing Law and Jurisdiction</h2>
          </div>
          <div className="space-y-4 text-muted-foreground">
            <p>
              These Terms are governed by the laws of Poland and the European Union, without regard to conflict
              of law principles. Any disputes arising from these Terms or your use of the platform shall be subject
              to the exclusive jurisdiction of the courts of Wrocław, Poland.
            </p>
          </div>
        </section>

        <Separator />

        {/* Section 11: Miscellaneous */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">11. Miscellaneous</h2>
          </div>
          <div className="space-y-4 text-muted-foreground">
            <div>
              <h3 className="font-medium text-foreground mb-2">11.1 Entire Agreement</h3>
              <p>
                These Terms, together with the Privacy Policy and Legal Disclaimer, constitute the entire agreement between you and
                Wrocław University of Science and Technology regarding the platform.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">11.2 Severability</h3>
              <p>
                If any provision of these Terms is found to be unenforceable, the remaining provisions will remain
                in full force and effect.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">11.3 No Waiver</h3>
              <p>
                Our failure to enforce any provision of these Terms shall not constitute a waiver of that provision
                or any other provision.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-2">11.4 Assignment</h3>
              <p>
                You may not assign or transfer these Terms or your rights under them without our prior written consent.
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Section 12: Contact */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Users className="size-5 text-primary" />
            <h2 className="text-2xl font-semibold">12. Contact Information</h2>
          </div>
          <div className="space-y-4 text-muted-foreground">
            <p>For questions about these Terms, contact us at:</p>
            <Card className="p-4 mt-4 bg-muted/20">
              <div className="space-y-2 text-sm">
                <p><strong>Email:</strong> <a href="mailto:lukasz.augustyniak@pwr.edu.pl" className="text-primary hover:underline">lukasz.augustyniak@pwr.edu.pl</a></p>
                <p><strong>Address:</strong> Wrocław University of Science and Technology, Wybrzeże Wyspiańskiego 27, 50-370 Wrocław, Poland</p>
              </div>
            </Card>
          </div>
        </section>
      </div>

      {/* Acknowledgment */}
      <Card className="mt-8 p-6 bg-muted/30 border-border/50">
        <h3 className="font-semibold mb-2">Acknowledgment</h3>
        <p className="text-sm text-muted-foreground">
          By using the JuDDGES platform, you acknowledge that you have read these Terms of Service and agree to be
          bound by them. If you do not agree to these Terms, please discontinue use of the platform immediately.
        </p>
      </Card>
    </div>
  );
}
