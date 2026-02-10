import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, type LucideIcon } from "lucide-react";

interface Certification {
  name: string;
  icon: LucideIcon;
  description: string;
}

interface SecuritySectionProps {
  certifications: Certification[];
  securityFeatures: string[];
  title?: string;
  subtitle?: string;
}

export function SecuritySection({
  certifications,
  securityFeatures,
  title,
  subtitle,
}: SecuritySectionProps) {
  return (
    <section className="py-20 md:py-24 bg-muted/20">
      <div className="container mx-auto px-6 md:px-8 lg:px-12 max-w-7xl">
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

        {/* Certifications */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {certifications.map((cert, index) => {
            const Icon = cert.icon;

            return (
              <Card
                key={index}
                className="text-center hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <CardContent className="p-6">
                  <div className="inline-flex p-4 rounded-full bg-primary/10 text-primary mb-4">
                    <Icon className="size-8" />
                  </div>
                  <h3 className="font-semibold mb-2">{cert.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {cert.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Security features */}
        <Card className="border-primary/20">
          <CardContent className="p-8 md:p-12">
            <h3 className="text-2xl font-bold mb-8 text-center">
              Enterprise Security Features
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
              {securityFeatures.map((feature, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Check className="size-5 text-chart-2 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>

            {/* Trust badge */}
            <div className="mt-10 pt-8 border-t border-border">
              <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
                <Badge variant="secondary" className="text-xs">
                  SOC 2 Type II (In Progress)
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Regular Security Audits
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Penetration Testing
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  24/7 Security Monitoring
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
