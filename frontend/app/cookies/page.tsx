import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Cookie, Shield, Settings, Info } from "lucide-react";

export default function CookiePolicyPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Badge variant="outline" className="mb-4">
          <Cookie className="h-3 w-3 mr-1" />
          Cookie Policy
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Cookie Policy
        </h1>
        <p className="text-lg text-muted-foreground">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Notice */}
      <Alert className="mb-8">
        <Info className="h-4 w-4" />
        <AlertDescription>
          This Cookie Policy explains how JuDDGES uses cookies and similar technologies to recognize you when you visit our platform.
          It explains what these technologies are and why we use them, as well as your rights to control our use of them.
        </AlertDescription>
      </Alert>

      {/* Content Sections */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cookie className="h-5 w-5" />
              What are cookies?
            </CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert">
            <p>
              Cookies are small data files that are placed on your computer or mobile device when you visit a website.
              Cookies are widely used by website owners to make their websites work, or to work more efficiently,
              as well as to provide reporting information.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              How we use cookies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Essential Cookies</h3>
              <p className="text-sm text-muted-foreground">
                These cookies are necessary for the website to function and cannot be switched off in our systems.
                They are usually only set in response to actions made by you, such as setting your privacy preferences,
                logging in, or filling in forms.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Performance Cookies</h3>
              <p className="text-sm text-muted-foreground">
                These cookies allow us to count visits and traffic sources so we can measure and improve the performance
                of our site. They help us to know which pages are the most and least popular and see how visitors move
                around the site.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Functional Cookies</h3>
              <p className="text-sm text-muted-foreground">
                These cookies enable the website to provide enhanced functionality and personalization. They may be set
                by us or by third-party providers whose services we have added to our pages.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Your Cookie Choices
            </CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert">
            <p>
              You have the right to decide whether to accept or reject cookies. You can exercise your cookie preferences
              by clicking on the appropriate opt-out links provided in the cookie banner or by adjusting your browser settings.
            </p>
            <p>
              Most web browsers allow some control of most cookies through the browser settings. However, if you use your
              browser settings to block all cookies (including essential cookies) you may not be able to access all or
              parts of our website.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Third-Party Services</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert">
            <p>
              We use the following third-party services that may set cookies:
            </p>
            <ul>
              <li><strong>Supabase:</strong> For authentication and user management</li>
              <li><strong>Analytics:</strong> To understand how visitors interact with our website</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-4">
              Each of these services has its own cookie policy, and we recommend reviewing their policies for more information.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Updates to this Policy</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert">
            <p>
              We may update this Cookie Policy from time to time to reflect changes in the cookies we use or for other
              operational, legal, or regulatory reasons. Please revisit this Cookie Policy regularly to stay informed
              about our use of cookies and related technologies.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact Us</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              If you have any questions about our use of cookies or other technologies, please contact us:
            </p>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Email:</strong>{" "}
                <a href="mailto:privacy@legal-ai.augustyniak.ai" className="text-primary hover:underline">
                  privacy@legal-ai.augustyniak.ai
                </a>
              </p>
              <p>
                <strong>Institution:</strong> Wrocław University of Science and Technology
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
