import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp } from "lucide-react";

interface CaseStudyResult {
  metric: string;
  value: string;
  description: string;
}

interface CaseStudyCardProps {
  title: string;
  industry: string;
  challenge: string;
  solution: string;
  results: CaseStudyResult[];
  link?: string;
}

export function CaseStudyCard({
  title,
  industry,
  challenge,
  solution,
  results,
  link,
}: CaseStudyCardProps) {
  return (
    <Card className="group hover:shadow-xl transition-all duration-300 h-full flex flex-col">
      <CardHeader>
        <Badge variant="secondary" className="w-fit mb-3">
          {industry}
        </Badge>
        <CardTitle className="text-2xl group-hover:text-primary transition-colors">
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-6">
        {/* Challenge */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Challenge
          </h4>
          <p className="text-sm leading-relaxed">{challenge}</p>
        </div>

        {/* Solution */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Solution
          </h4>
          <p className="text-sm leading-relaxed">{solution}</p>
        </div>

        {/* Results */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide flex items-center gap-2">
            <TrendingUp className="size-4" />
            Results
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {results.map((result, index) => (
              <div
                key={index}
                className="bg-muted/30 rounded-lg p-4 border border-border"
              >
                <div className="text-2xl font-bold text-primary mb-1">
                  {result.metric}
                </div>
                <div className="text-xs font-medium text-foreground mb-1">
                  {result.value}
                </div>
                <div className="text-xs text-muted-foreground">
                  {result.description}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Link */}
        {link && (
          <div className="mt-auto pt-4">
            <Button variant="ghost" asChild className="group/btn p-0 h-auto">
              <Link href={link} className="flex items-center gap-2">
                <span>Read full case study</span>
                <ArrowRight className="size-4 group-hover/btn:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CaseStudiesProps {
  caseStudies: Array<{
    title: string;
    industry: string;
    challenge: string;
    solution: string;
    results: CaseStudyResult[];
    link?: string;
  }>;
  title?: string;
  subtitle?: string;
}

export function CaseStudies({
  caseStudies,
  title,
  subtitle,
}: CaseStudiesProps) {
  return (
    <section id="case-studies" className="py-20 md:py-24">
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

        {/* Case studies grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
          {caseStudies.map((caseStudy, index) => (
            <CaseStudyCard key={index} {...caseStudy} />
          ))}
        </div>
      </div>
    </section>
  );
}
