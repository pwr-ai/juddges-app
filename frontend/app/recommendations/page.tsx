"use client";

import React from "react";
import { Lightbulb } from "lucide-react";
import { PageContainer, AIDisclaimerBadge } from "@/lib/styles/components";
import SmartRecommendations from "@/components/SmartRecommendations";

export default function RecommendationsPage() {
  return (
    <PageContainer width="medium" fillViewport>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Lightbulb className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Smart Recommendations
            </h1>
            <p className="text-sm text-muted-foreground">
              Discover relevant documents based on your research context, search
              history, and viewing patterns
            </p>
          </div>
        </div>
        <AIDisclaimerBadge />
      </div>

      {/* Recommendations */}
      <SmartRecommendations strategy="auto" limit={15} showSearch />
    </PageContainer>
  );
}
