"use client";

import React from "react";
import { Brain } from "lucide-react";
import { PageContainer, AIDisclaimerBadge } from "@/lib/styles/components";
import ResearchAssistant from "@/components/ResearchAssistant";

export default function ResearchAssistantPage() {
  return (
    <PageContainer width="medium" fillViewport>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Research Assistant
            </h1>
            <p className="text-sm text-muted-foreground">
              AI-powered research guidance that suggests related documents,
              identifies knowledge gaps, and recommends next research steps
            </p>
          </div>
        </div>
        <AIDisclaimerBadge />
      </div>

      {/* Research Assistant */}
      <ResearchAssistant showSearch showAnalyze />
    </PageContainer>
  );
}
