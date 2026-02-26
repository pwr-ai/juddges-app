import { Metadata } from "next";
import { AlertTriangle, Scale, Shield, FileText, Globe, Calendar } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Legal Disclaimer | JuDDGES",
  description:
    "Important legal disclaimers and limitations regarding the use of JuDDGES platform.",
};

export default function DisclaimerPage() {
  const lastUpdated = "October 12, 2025";

  return (
    <div className="container max-w-5xl py-12 px-4 md:px-6">
      {/* Header */}
      <div className="space-y-4 mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <span>/</span>
          <span>Legal Disclaimer</span>
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Legal Disclaimer</h1>
          <p className="text-lg text-muted-foreground">
            Important information about AI-generated content and professional responsibilities
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Last updated: {lastUpdated}</span>
          </div>
        </div>
      </div>

      {/* Critical Warning */}
      <Alert className="mb-8 border-amber-500/50 bg-amber-500/10 dark:bg-amber-500/5">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
        <AlertDescription className="text-sm">
          <span className="font-semibold text-amber-900 dark:text-amber-200 block mb-2">
            Critical Professional Notice
          </span>
          <p className="text-amber-800 dark:text-amber-300">
            This platform uses artificial intelligence to assist with legal and tax research. All
            AI-generated content must be independently verified by qualified professionals before
            being relied upon. This tool does not provide legal or tax advice.
          </p>
        </AlertDescription>
      </Alert>

      {/* Main Content */}
      <div className="space-y-8">
        {/* No Legal Advice */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Scale className="h-6 w-6 text-primary" />
              <CardTitle>No Legal or Tax Advice</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p>
              The JuDDGES platform provides <strong>information and research tools only</strong>.
              Nothing provided by this platform constitutes legal advice, tax advice, or professional
              counsel of any kind.
            </p>
            <p>
              You should not rely on AI-generated content as a substitute for professional advice from
              a qualified attorney, tax professional, or other licensed professional. The AI system:
            </p>
            <ul>
              <li>Cannot understand the full context of your specific situation</li>
              <li>May produce outdated, incomplete, or incorrect information</li>
              <li>Does not take into account jurisdiction-specific rules or recent changes</li>
              <li>Cannot replace human professional judgment and expertise</li>
            </ul>
          </CardContent>
        </Card>

        {/* Professional Responsibility */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-primary" />
              <CardTitle>Professional Responsibility and Liability</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p>
              <strong>You are solely responsible</strong> for verifying all AI-generated content
              before using it in any professional, legal, or tax-related context. This includes:
            </p>
            <ul>
              <li>Independently verifying all citations, case law, and statutory references</li>
              <li>Checking for recent updates, amendments, or changes in law</li>
              <li>Ensuring compliance with applicable professional conduct rules</li>
              <li>Maintaining appropriate professional liability insurance</li>
              <li>Exercising independent professional judgment in all matters</li>
            </ul>
            <div className="bg-muted p-4 rounded-lg border border-border mt-4">
              <p className="font-semibold mb-2">For Legal Professionals:</p>
              <p className="text-sm">
                Use of this tool does not diminish your professional responsibilities under
                applicable rules of professional conduct. You remain fully responsible for the
                competence, diligence, and quality of your work product.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* No Attorney-Client Relationship */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-primary" />
              <CardTitle>No Attorney-Client Relationship or Privilege</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p>
              Use of this platform <strong>does not create</strong> an attorney-client relationship
              between you and the platform operators, developers, or any associated parties.
            </p>
            <p className="text-destructive font-semibold">
              Attorney-client privilege does not apply to information shared on this platform.
            </p>
            <p>Do not submit:</p>
            <ul>
              <li>Confidential client information without proper authorization</li>
              <li>Attorney work product or privileged communications</li>
              <li>Sensitive personal or financial information</li>
              <li>Trade secrets or proprietary business information</li>
            </ul>
            <p>
              Ensure compliance with your jurisdiction&apos;s confidentiality and data protection
              requirements before uploading any documents or information.
            </p>
          </CardContent>
        </Card>

        {/* AI Limitations */}
        <Card>
          <CardHeader>
            <CardTitle>AI System Limitations and Risks</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p>Artificial intelligence systems have inherent limitations. Our AI may:</p>
            <ul>
              <li>
                <strong>Generate hallucinations:</strong> Create plausible-sounding but entirely
                false information, citations, or case law
              </li>
              <li>
                <strong>Misinterpret context:</strong> Fail to understand nuances or specific
                circumstances of your query
              </li>
              <li>
                <strong>Provide outdated information:</strong> Reference laws, regulations, or cases
                that have been modified or overturned
              </li>
              <li>
                <strong>Miss jurisdiction-specific rules:</strong> Fail to account for local laws,
                regulations, or court rules
              </li>
              <li>
                <strong>Exhibit bias:</strong> Reflect biases present in training data
              </li>
            </ul>
            <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg mt-4">
              <p className="font-semibold text-destructive mb-2">Critical Reminder:</p>
              <p className="text-sm">
                Always verify AI outputs against primary sources. Never rely solely on AI-generated
                content for legal or tax decisions.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Data Usage and Privacy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-primary" />
              <CardTitle>Data Usage and Privacy</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p>
              Information you submit to this platform may be processed, stored, and used to improve
              our services. Please review our{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              for details on data handling.
            </p>
            <p>
              <strong>Important:</strong> Do not upload confidential, privileged, or sensitive
              information unless you have obtained appropriate consent and ensured compliance with
              applicable data protection laws (GDPR, CCPA, etc.).
            </p>
          </CardContent>
        </Card>

        {/* Jurisdiction-Specific Notices */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Globe className="h-6 w-6 text-primary" />
              <CardTitle>Jurisdiction-Specific Notices</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p>
              Legal and tax requirements vary significantly by jurisdiction. This platform may
              reference laws from multiple jurisdictions, but:
            </p>
            <ul>
              <li>Information may not be applicable to your specific jurisdiction</li>
              <li>Local rules and regulations always take precedence</li>
              <li>You must verify compliance with local professional conduct rules</li>
              <li>Unauthorized practice of law regulations may apply in your jurisdiction</li>
            </ul>
            <p>
              Consult with a licensed professional in your jurisdiction before taking any action
              based on information from this platform.
            </p>
          </CardContent>
        </Card>

        {/* Limitation of Liability */}
        <Card>
          <CardHeader>
            <CardTitle>Limitation of Liability</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p>
              To the fullest extent permitted by law, the operators of this platform disclaim all
              liability for:
            </p>
            <ul>
              <li>Errors, omissions, or inaccuracies in AI-generated content</li>
              <li>Reliance on information provided by the platform</li>
              <li>Professional misconduct or malpractice claims arising from platform use</li>
              <li>Losses or damages resulting from use of the platform</li>
            </ul>
            <p>
              <strong>You use this platform at your own risk.</strong> We strongly recommend
              maintaining appropriate professional liability insurance.
            </p>
          </CardContent>
        </Card>

        {/* Contact and Questions */}
        <Card>
          <CardHeader>
            <CardTitle>Questions or Concerns</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              If you have questions about this disclaimer or the appropriate use of our platform,
              please contact us or consult with a qualified professional.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild variant="default">
                <Link href="/contact">Contact Us</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/terms">View Terms of Service</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="mt-12 pt-8 border-t border-border">
        <p className="text-sm text-muted-foreground text-center">
          By using the JuDDGES platform, you acknowledge that you have read, understood,
          and agree to be bound by this disclaimer.
        </p>
      </div>
    </div>
  );
}
