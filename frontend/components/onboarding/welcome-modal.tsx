"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  FileSearch,
  Brain,
  MessageSquare,
  Shield,
  ChevronRight,
  ChevronLeft,
  Check,
} from "lucide-react";

interface WelcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ElementType;
  features: string[];
  color: string;
}

const onboardingSteps: OnboardingStep[] = [
  {
    title: "Welcome to JuDDGES",
    description:
      "Your intelligent companion for judgments analysis and legal research. Let's take a quick tour of what you can do.",
    icon: Brain,
    features: [
      "AI-powered legal document analysis",
      "Smart search across court judgments and tax laws",
      "Professional-grade research tools",
      "Secure and compliant platform",
    ],
    color: "text-blue-600 dark:text-blue-500",
  },
  {
    title: "Intelligent Search",
    description:
      "Find relevant legal documents and case law with powerful AI-enhanced search capabilities.",
    icon: FileSearch,
    features: [
      "Natural language queries in multiple languages",
      "Semantic search finds related concepts",
      "Filter by jurisdiction, date, and document type",
      "Save and organize search results in collections",
    ],
    color: "text-green-600 dark:text-green-500",
  },
  {
    title: "AI Chat Assistant",
    description:
      "Ask questions and get AI-powered insights about legal documents and tax regulations.",
    icon: MessageSquare,
    features: [
      "Ask questions in plain language",
      "Get summaries and explanations",
      "Receive citations to source documents",
      "Remember: Always verify AI outputs professionally",
    ],
    color: "text-purple-600 dark:text-purple-500",
  },
  {
    title: "Professional Responsibility",
    description:
      "Important reminders about using AI in your professional practice.",
    icon: Shield,
    features: [
      "AI provides assistance, not legal advice",
      "Always verify outputs against primary sources",
      "Maintain professional liability insurance",
      "Follow your jurisdiction's conduct rules",
    ],
    color: "text-amber-600 dark:text-amber-500",
  },
];

export function WelcomeModal({ open, onOpenChange, onComplete }: WelcomeModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    onComplete?.();
    onOpenChange(false);
  };

  const step = onboardingSteps[currentStep];
  const progress = ((currentStep + 1) / onboardingSteps.length) * 100;
  const StepIcon = step.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-primary/10 ${step.color}`}>
                <StepIcon className="h-6 w-6" />
              </div>
              {step.title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-base pt-2">{step.description}</DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                Step {currentStep + 1} of {onboardingSteps.length}
              </span>
              <span className="text-sm font-medium text-primary">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Features List */}
          <div className="space-y-3">
            {step.features.map((feature, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <div className="flex-shrink-0 mt-0.5">
                  <Check className={`h-5 w-5 ${step.color}`} />
                </div>
                <p className="text-sm text-foreground leading-relaxed">{feature}</p>
              </div>
            ))}
          </div>

          {/* Step Indicators */}
          <div className="flex justify-center gap-2 mt-6">
            {onboardingSteps.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentStep
                    ? "w-8 bg-primary"
                    : index < currentStep
                    ? "w-2 bg-primary/50"
                    : "w-2 bg-muted"
                }`}
                aria-label={`Go to step ${index + 1}`}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {currentStep > 0 && (
            <Button type="button" variant="outline" onClick={handlePrevious} className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={handleSkip}>
            Skip Tour
          </Button>
          <Button type="button" onClick={handleNext} className="gap-2">
            {currentStep < onboardingSteps.length - 1 ? (
              <>
                Next
                <ChevronRight className="h-4 w-4" />
              </>
            ) : (
              <>
                Get Started
                <Check className="h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
