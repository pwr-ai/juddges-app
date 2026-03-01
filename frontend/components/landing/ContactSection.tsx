"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Phone, Calendar, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface ContactSectionProps {
  title?: string;
  subtitle?: string;
}

export function ContactSection({
  title,
  subtitle,
}: ContactSectionProps): React.JSX.Element {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    message: "",
    website: "",
  });

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to submit form');
      }

      setIsSuccess(true);
      toast.success(data.message || "Thank you! We'll be in touch soon.");

      // Reset form
      setFormData({ name: "", email: "", company: "", message: "", website: "" });
    } catch (error) {
      console.error("Contact form submission error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <section id="contact" className="py-20 md:py-24">
      <div className="container mx-auto px-6 md:px-8 lg:px-12 max-w-6xl">
        {/* Section header */}
        {(title || subtitle) && (
          <div className="text-center mb-16">
            {title && (
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{title}</h2>
            )}
            {subtitle && (
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                {subtitle}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Form */}
          <div>
            <Card>
              <CardContent className="p-8">
                {isSuccess ? (
                  <div className="text-center py-12">
                    <CheckCircle className="size-16 text-chart-2 mx-auto mb-4" />
                    <h3 className="text-2xl font-bold mb-2">
                      Message Sent!
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Thank you for reaching out. Our team will contact you
                      within 24 hours.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setIsSuccess(false)}
                    >
                      Send Another Message
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Honeypot field - should remain empty */}
                    <div className="hidden" aria-hidden="true">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        name="website"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={formData.website}
                        onChange={handleChange}
                        disabled={isSubmitting}
                      />
                    </div>

                    {/* Name */}
                    <div className="space-y-2">
                      <Label htmlFor="name">
                        Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        name="name"
                        type="text"
                        placeholder="John Doe"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        disabled={isSubmitting}
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                      <Label htmlFor="email">
                        Email <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="john@lawfirm.com"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        disabled={isSubmitting}
                      />
                    </div>

                    {/* Company */}
                    <div className="space-y-2">
                      <Label htmlFor="company">
                        Company <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="company"
                        name="company"
                        type="text"
                        placeholder="Law Firm LLC"
                        required
                        value={formData.company}
                        onChange={handleChange}
                        disabled={isSubmitting}
                      />
                    </div>

                    {/* Message */}
                    <div className="space-y-2">
                      <Label htmlFor="message">
                        Message <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id="message"
                        name="message"
                        placeholder="Tell us about your needs and how we can help..."
                        required
                        rows={5}
                        value={formData.message}
                        onChange={handleChange}
                        disabled={isSubmitting}
                      />
                    </div>

                    {/* Privacy notice */}
                    <p className="text-xs text-muted-foreground">
                      By submitting this form, you agree to our{" "}
                      <a href="/privacy" className="underline hover:text-foreground">
                        Privacy Policy
                      </a>{" "}
                      and consent to be contacted about JuDDGES
                      solutions.
                    </p>

                    {/* Submit button */}
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Sending..." : "Send Message"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Alternative Contact Methods */}
          <div className="space-y-8">
            <div>
              <h3 className="text-2xl font-bold mb-4">
                Prefer to reach out directly?
              </h3>
              <p className="text-muted-foreground mb-8">
                Choose the method that works best for you. Our team is ready to
                discuss your specific needs and answer any questions.
              </p>
            </div>

            {/* Contact options */}
            <div className="space-y-4">
              {/* Email */}
              <Card className="hover:shadow-lg transition-shadow">
                <CardContent className="flex items-start gap-4 p-6">
                  <div className="p-3 rounded-lg bg-primary/10 text-primary">
                    <Mail className="size-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Email Us</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Get a response within 24 hours
                    </p>
                    <a
                      href="mailto:enterprise@legal-ai.augustyniak.ai"
                      className="text-sm text-primary hover:underline"
                    >
                      enterprise@legal-ai.augustyniak.ai
                    </a>
                  </div>
                </CardContent>
              </Card>

              {/* Phone */}
              <Card className="hover:shadow-lg transition-shadow">
                <CardContent className="flex items-start gap-4 p-6">
                  <div className="p-3 rounded-lg bg-primary/10 text-primary">
                    <Phone className="size-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Call Us</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Monday - Friday, 9:00 AM - 5:00 PM CET
                    </p>
                    <a
                      href="tel:+48123456789"
                      className="text-sm text-primary hover:underline"
                    >
                      +48 123 456 789
                    </a>
                  </div>
                </CardContent>
              </Card>

              {/* Schedule */}
              <Card className="hover:shadow-lg transition-shadow">
                <CardContent className="flex items-start gap-4 p-6">
                  <div className="p-3 rounded-lg bg-primary/10 text-primary">
                    <Calendar className="size-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Schedule a Demo</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Book a personalized walkthrough
                    </p>
                    <a
                      href="#"
                      className="text-sm text-primary hover:underline"
                    >
                      View available times
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Trust badge */}
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="size-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">
                      Enterprise-grade support
                    </p>
                    <p>
                      Our team has supported 50+ research institutions and
                      organizations. We understand the unique challenges of
                      deploying AI in legal environments.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
