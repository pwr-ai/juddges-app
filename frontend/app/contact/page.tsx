"use client";

import { Mail, MapPin, Phone, Github, Globe, HelpCircle } from "lucide-react";
import {
  PageContainer,
  Header,
  Badge,
  LightCard,
  SecondaryHeader,
  SecondaryButton,
} from "@/lib/styles/components";

export default function ContactPage() {
  return (
    <PageContainer width="standard" className="py-12">
      {/* Header */}
      <div className="mb-16 text-center">
        <Badge variant="outline" className="mb-6 mx-auto">
          <Mail className="size-3 mr-1.5" />
          Get in Touch
        </Badge>
        <Header
          title="Contact Us"
          size="4xl"
          description="Have questions about JuDDGES? We're here to help. Reach out to our team for support, collaboration opportunities, or research inquiries."
          className="items-center text-center"
        />
      </div>

      <div className="grid gap-10">
        {/* Contact Information */}
        <div className="space-y-6">
          {/* Primary Contact */}
          <LightCard padding="lg">
            <SecondaryHeader
              icon={Mail}
              title="Primary Contact"
              className="mb-6"
              showBorder={false}
            />
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-base mb-1">Łukasz Augustyniak</p>
                <p className="text-muted-foreground mb-2">Project Lead</p>
                <a
                  href="mailto:lukasz.augustyniak@pwr.edu.pl"
                  className="text-primary hover:underline transition-colors"
                >
                  lukasz.augustyniak@pwr.edu.pl
                </a>
              </div>
            </div>
          </LightCard>

          {/* University Address */}
          <LightCard padding="lg">
            <SecondaryHeader
              icon={MapPin}
              title="Address"
              className="mb-6"
              showBorder={false}
            />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-base text-foreground">
                Wrocław University of Science and Technology
              </p>
              <p className="text-muted-foreground">Wybrzeże Wyspiańskiego 27</p>
              <p className="text-muted-foreground">50-370 Wrocław, Poland</p>
            </div>
          </LightCard>

          {/* Research Contact */}
          <LightCard padding="lg">
            <SecondaryHeader
              icon={Phone}
              title="Research Collaboration"
              className="mb-6"
              showBorder={false}
            />
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium mb-1">General Inquiries & Research</p>
                <a
                  href="mailto:lukasz.augustyniak@pwr.edu.pl"
                  className="text-primary hover:underline transition-colors"
                >
                  lukasz.augustyniak@pwr.edu.pl
                </a>
              </div>
              <div>
                <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                  For all inquiries including technical support, data privacy, and research collaboration,
                  please contact the project lead directly.
                </p>
              </div>
            </div>
          </LightCard>

          {/* Social & Links */}
          <LightCard padding="lg">
            <SecondaryHeader
              title="Connect With Us"
              className="mb-6"
              showBorder={false}
            />
            <div className="flex flex-col gap-3">
              <a
                href="https://github.com/laugustyniak/legal-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
              >
                <Github className="size-6 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium text-sm mb-1">GitHub Repository</p>
                  <p className="text-xs text-muted-foreground">
                    View source code and contribute
                  </p>
                </div>
              </a>

              <a
                href="https://pwr.edu.pl"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
              >
                <Globe className="size-6 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium text-sm mb-1">University Website</p>
                  <p className="text-xs text-muted-foreground">
                    Learn more about WUST
                  </p>
                </div>
              </a>
            </div>
          </LightCard>
        </div>
      </div>

      {/* FAQ Section */}
      <LightCard padding="lg" className="mt-16 bg-muted/30">
        <SecondaryHeader
          title="Frequently Asked Questions"
          className="mb-8"
          showBorder={false}
        />
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="font-medium mb-3 text-base">How quickly will I get a response?</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We aim to respond to all inquiries within 2-3 business days. For urgent technical issues,
              please use the support email for faster assistance.
            </p>
          </div>

          <div>
            <h3 className="font-medium mb-3 text-base">Can I collaborate on research?</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Yes! We welcome research collaborations. Please contact Dr. Augustyniak directly with
              your research proposal and background.
            </p>
          </div>

          <div>
            <h3 className="font-medium mb-3 text-base">Is the platform available for commercial use?</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              JuDDGES is primarily a research platform. For commercial inquiries or licensing,
              please contact us at lukasz.augustyniak@pwr.edu.pl.
            </p>
          </div>

          <div>
            <h3 className="font-medium mb-3 text-base">How can I report a bug or issue?</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Technical issues can be reported via lukasz.augustyniak@pwr.edu.pl or by opening an issue
              on our GitHub repository.
            </p>
          </div>
        </div>
      </LightCard>

      {/* Help Center Link */}
      <div className="mt-12 text-center">
        <p className="text-sm text-muted-foreground mb-6">
          Looking for immediate answers? Check out our comprehensive Help Center.
        </p>
        <SecondaryButton
          size="lg"
          icon={HelpCircle}
          onClick={() => window.location.href = '/help'}
        >
          Visit Help Center
        </SecondaryButton>
      </div>
    </PageContainer>
  );
}
