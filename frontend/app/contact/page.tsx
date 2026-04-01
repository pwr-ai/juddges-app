"use client";

import { useState } from "react";
import { Mail, MapPin, Phone, Github, Globe, HelpCircle, Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import {
  PageContainer,
  Header,
  Badge,
  LightCard,
  SecondaryHeader,
  SecondaryButton,
} from "@/lib/styles/components";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type FormStatus = "idle" | "submitting" | "success" | "error";

interface FieldErrors {
  name?: string;
  email?: string;
  company?: string;
  message?: string;
}

function validateForm(data: { name: string; email: string; company: string; message: string }): FieldErrors {
  const errors: FieldErrors = {};
  if (data.name.length < 2) errors.name = "Name must be at least 2 characters";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = "Please enter a valid email address";
  if (data.company.length < 2) errors.company = "Company must be at least 2 characters";
  if (data.message.length < 10) errors.message = "Message must be at least 10 characters";
  return errors;
}

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [serverError, setServerError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setServerError("");

    const errors = validateForm({ name, email, company, message });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setStatus("submitting");

    try {
      const formData = new FormData(e.currentTarget as HTMLFormElement);
      const website = formData.get("website") as string || undefined;

      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, message, website }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setStatus("error");
        setServerError(data.message || "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setName("");
      setEmail("");
      setCompany("");
      setMessage("");
    } catch {
      setStatus("error");
      setServerError("Network error. Please check your connection and try again.");
    }
  }

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

      <div className="grid lg:grid-cols-2 gap-10">
        {/* Contact Form */}
        <div>
          <LightCard padding="lg">
            <SecondaryHeader
              icon={Send}
              title="Send a Message"
              className="mb-6"
              showBorder={false}
            />

            {status === "success" ? (
              <div className="flex flex-col items-center py-8 text-center gap-3">
                <CheckCircle className="size-10 text-green-500" />
                <p className="font-medium text-base">Message sent!</p>
                <p className="text-sm text-muted-foreground">
                  Thank you for reaching out. We&apos;ll get back to you within 2-3 business days.
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setStatus("idle")}
                >
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={120}
                    aria-invalid={!!fieldErrors.name}
                  />
                  {fieldErrors.name && (
                    <p className="text-xs text-destructive">{fieldErrors.name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={254}
                    aria-invalid={!!fieldErrors.email}
                  />
                  {fieldErrors.email && (
                    <p className="text-xs text-destructive">{fieldErrors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company">Company / Organization</Label>
                  <Input
                    id="company"
                    placeholder="Your company or institution"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    maxLength={160}
                    aria-invalid={!!fieldErrors.company}
                  />
                  {fieldErrors.company && (
                    <p className="text-xs text-destructive">{fieldErrors.company}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    placeholder="How can we help you? "
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={5000}
                    rows={5}
                    aria-invalid={!!fieldErrors.message}
                  />
                  {fieldErrors.message && (
                    <p className="text-xs text-destructive">{fieldErrors.message}</p>
                  )}
                </div>

                {/* Honeypot - hidden from users, catches bots */}
                <div className="absolute opacity-0 -z-10" aria-hidden="true" tabIndex={-1}>
                  <input name="website" type="text" autoComplete="off" tabIndex={-1} />
                </div>

                {serverError && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="size-4 mt-0.5 shrink-0" />
                    <p>{serverError}</p>
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={status === "submitting"}>
                  {status === "submitting" ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="size-4 mr-2" />
                      Send Message
                    </>
                  )}
                </Button>
              </form>
            )}
          </LightCard>
        </div>

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
                href="https://github.com/pwr-ai/juddges-app"
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
