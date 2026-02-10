import { LightCard } from "@/lib/styles/components/light-card";
import { Header } from "@/lib/styles/components/HeaderWithIcon";
import { SecondaryHeader } from "@/lib/styles/components/secondary-header";
import { SectionHeader } from "@/lib/styles/components/section-header";
import { Separator } from "@/components/ui/separator";
import { Shield, Lock, Eye, Database, Mail } from "lucide-react";
import React from "react";

export const metadata = {
  title: "Privacy Policy | Legal AI",
  description: "Privacy policy for Legal AI legal research platform",
};

export default function PrivacyPage(): React.ReactElement {
  return (
    <div className="container mx-auto px-6 py-12 md:px-8 lg:px-12 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Header
          icon={Shield}
          title="Privacy Policy"
          size="4xl"
          description={`Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`}
        />
      </div>

      {/* Introduction */}
      <LightCard padding="lg" className="mb-8">
        <p className="text-base leading-relaxed text-muted-foreground">
          Wrocław University of Science and Technology and collaborators (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operate the Legal AI platform.
          This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you
          use our research platform.
        </p>
      </LightCard>

      <div className="space-y-8">
        {/* Section 1: Information We Collect */}
        <section>
          <SecondaryHeader
            icon={Database}
            title="1. Information We Collect"
            className="mb-6"
          />
          <div className="space-y-4 text-muted-foreground">
            <div>
              <SectionHeader title="1.1 Personal Information" className="mb-2" />
              <p>We may collect the following personal information:</p>
              <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li>Email address and name (for account registration)</li>
                <li>University affiliation (for research purposes)</li>
                <li>Authentication credentials</li>
              </ul>
            </div>

            <div>
              <SectionHeader title="1.2 Usage Data" className="mb-2" />
              <p>We automatically collect certain information when you use our platform:</p>
              <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li>Search queries and document interactions</li>
                <li>Chat conversations with AI assistant</li>
                <li>Browser type and version</li>
                <li>IP address and device information</li>
                <li>Usage patterns and timestamps</li>
              </ul>
            </div>

            <div>
              <SectionHeader title="1.3 Research Data" className="mb-2" />
              <p>As a research platform, we may collect:</p>
              <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li>Anonymized usage patterns for research purposes</li>
                <li>Feedback and interaction data</li>
                <li>Document access patterns</li>
              </ul>
            </div>
          </div>
        </section>

        <Separator />

        {/* Section 2: How We Use Your Information */}
        <section>
          <SecondaryHeader
            icon={Eye}
            title="2. How We Use Your Information"
            className="mb-6"
          />
          <div className="space-y-4 text-muted-foreground">
            <p>We use the collected information for:</p>
            <ul className="list-disc list-inside ml-4 space-y-2">
              <li><strong>Platform Operation:</strong> To provide and maintain our services</li>
              <li><strong>User Authentication:</strong> To verify your identity and manage your account</li>
              <li><strong>Research Purposes:</strong> To conduct academic research on legal AI systems</li>
              <li><strong>Service Improvement:</strong> To analyze usage patterns and improve platform features</li>
              <li><strong>Communication:</strong> To send updates, security alerts, and support messages</li>
              <li><strong>Legal Compliance:</strong> To comply with applicable laws and regulations</li>
            </ul>
          </div>
        </section>

        <Separator />

        {/* Section 3: Data Storage and Security */}
        <section>
          <SecondaryHeader
            icon={Lock}
            title="3. Data Storage and Security"
            className="mb-6"
          />
          <div className="space-y-4 text-muted-foreground">
            <div>
              <SectionHeader title="3.1 Data Location" className="mb-2" />
              <p>
                All data is stored on servers located within the European Union, ensuring compliance with
                GDPR and EU data protection standards.
              </p>
            </div>

            <div>
              <SectionHeader title="3.2 Security Measures" className="mb-2" />
              <p>We implement industry-standard security measures including:</p>
              <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li>SSL/TLS encryption for data in transit</li>
                <li>Encrypted storage for sensitive data</li>
                <li>Regular security audits and updates</li>
                <li>Access controls and authentication</li>
                <li>Regular backups and disaster recovery procedures</li>
              </ul>
            </div>

            <div>
              <SectionHeader title="3.3 Data Retention" className="mb-2" />
              <p>
                We retain personal data only as long as necessary for the purposes outlined in this policy
                or as required by law. Research data may be retained indefinitely in anonymized form.
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Section 4: Data Sharing and Disclosure */}
        <section>
          <SecondaryHeader
            icon={Shield}
            title="4. Data Sharing and Disclosure"
            className="mb-6"
          />
          <div className="space-y-4 text-muted-foreground">
            <p>We do not sell your personal information. We may share data in the following circumstances:</p>
            <ul className="list-disc list-inside ml-4 space-y-2">
              <li><strong>Research Collaborators:</strong> Anonymized data may be shared with academic partners</li>
              <li><strong>Service Providers:</strong> Third-party services that help us operate the platform (with appropriate data processing agreements)</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our legal rights</li>
              <li><strong>University Requirements:</strong> As required for institutional research compliance</li>
            </ul>
          </div>
        </section>

        <Separator />

        {/* Section 5: Your Rights (GDPR) */}
        <section>
          <SecondaryHeader
            icon={Shield}
            title="5. Your Rights Under GDPR"
            className="mb-6"
          />
          <div className="space-y-4 text-muted-foreground">
            <p>As an EU-based service, we provide you with the following rights:</p>
            <ul className="list-disc list-inside ml-4 space-y-2">
              <li><strong>Right to Access:</strong> Request a copy of your personal data</li>
              <li><strong>Right to Rectification:</strong> Correct inaccurate or incomplete data</li>
              <li><strong>Right to Erasure:</strong> Request deletion of your personal data (&quot;right to be forgotten&quot;)</li>
              <li><strong>Right to Restriction:</strong> Restrict processing of your data</li>
              <li><strong>Right to Data Portability:</strong> Receive your data in a structured format</li>
              <li><strong>Right to Object:</strong> Object to processing based on legitimate interests</li>
              <li><strong>Right to Withdraw Consent:</strong> Withdraw consent at any time</li>
            </ul>
            <p className="mt-4">
              To exercise these rights, please contact us at{" "}
              <a href="mailto:lukasz.augustyniak@pwr.edu.pl" className="text-primary hover:underline">
                lukasz.augustyniak@pwr.edu.pl
              </a>
            </p>
          </div>
        </section>

        <Separator />

        {/* Section 6: Cookies and Tracking */}
        <section>
          <SecondaryHeader
            icon={Eye}
            title="6. Cookies and Tracking Technologies"
            className="mb-6"
          />
          <div className="space-y-4 text-muted-foreground">
            <p>We use cookies and similar technologies to:</p>
            <ul className="list-disc list-inside ml-4 space-y-2">
              <li>Maintain your session and preferences</li>
              <li>Analyze platform usage and performance</li>
              <li>Provide personalized features</li>
            </ul>
            <p className="mt-4">
              For detailed information, please see our{" "}
              <a href="/cookies" className="text-primary hover:underline">
                Cookie Policy
              </a>
              .
            </p>
          </div>
        </section>

        <Separator />

        {/* Section 7: Children's Privacy */}
        <section>
          <SecondaryHeader
            icon={Shield}
            title="7. Children's Privacy"
            className="mb-6"
          />
          <div className="space-y-4 text-muted-foreground">
            <p>
              Our platform is designed for academic and professional use. We do not knowingly collect
              information from children under 16. If you believe we have collected such information,
              please contact us immediately.
            </p>
          </div>
        </section>

        <Separator />

        {/* Section 8: Changes to Policy */}
        <section>
          <SecondaryHeader
            icon={Database}
            title="8. Changes to This Policy"
            className="mb-6"
          />
          <div className="space-y-4 text-muted-foreground">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any significant
              changes by posting a notice on our platform or sending an email to registered users. Your
              continued use of the platform after such modifications constitutes acceptance of the updated policy.
            </p>
          </div>
        </section>

        <Separator />

        {/* Section 9: Contact Information */}
        <section>
          <SecondaryHeader
            icon={Mail}
            title="9. Contact Us"
            className="mb-6"
          />
          <LightCard padding="md">
            <p className="text-sm mb-4">For questions about this Privacy Policy or to exercise your rights, contact us at:</p>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Email:</strong>{" "}
                <a href="mailto:lukasz.augustyniak@pwr.edu.pl" className="text-primary hover:underline">
                  lukasz.augustyniak@pwr.edu.pl
                </a>
              </p>
              <p>
                <strong>Address:</strong> Wrocław University of Science and Technology, Wybrzeże Wyspiańskiego 27, 50-370 Wrocław, Poland
              </p>
            </div>
          </LightCard>
        </section>
      </div>

      {/* Legal Notice */}
      <p className="mt-8 text-sm text-muted-foreground">
        This Privacy Policy is governed by Polish and EU law. Any disputes shall be resolved in accordance
        with the laws of Poland and the European Union.
      </p>
    </div>
  );
}
