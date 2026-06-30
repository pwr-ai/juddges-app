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
 FolderOpen,
 FileJson,
 PanelsTopLeft,
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
"Your companion for judicial-decision research across Polish and England & Wales case law. Here is a quick tour of what you can do.",
 icon: Brain,
 features: [
"AI-assisted analysis of court judgments",
"Hybrid search across the full corpus",
"Tools built for legal researchers and practitioners",
"Secure, compliant, and citation-grounded",
 ],
 color: "text-oxblood",
 },
 {
 title: "Search",
 description:
"Find judgments with text, semantic, or hybrid search — phrase a query as you would ask a colleague.",
 icon: FileSearch,
 features: [
"Text mode for exact phrases and citations",
"Semantic mode surfaces related legal concepts",
"Hybrid mode blends both for the best recall",
"Filter by jurisdiction (PL · UK), court, date, and language",
 ],
 color: "text-oxblood",
 },
 {
 title: "Chat",
 description:
"Ask questions about judgments in natural language and get answers grounded in source documents.",
 icon: MessageSquare,
 features: [
"Ask in plain language — Polish or English",
"Get summaries, explanations, and comparisons",
"Every answer cites the source judgments",
"Always verify AI output against primary sources",
 ],
 color: "text-gold",
 },
 {
 title: "Collections",
 description:
"Save and organize important judgments into reusable research sets that persist across sessions.",
 icon: FolderOpen,
 features: [
"Group judgments by case, topic, or project",
"Add results from search or the document view",
"Rename, reorder, and edit collections inline",
"Collections feed into extraction pipelines",
 ],
 color: "text-oxblood",
 },
 {
 title: "Schema extraction",
 description:
"Extract structured data from judgments using a coding schema — turn free text into analysable fields.",
 icon: FileJson,
 features: [
"Start from the base coding schema or define your own",
"Extract dates, parties, outcomes, and citations",
"Run extraction over a single judgment or a collection",
"Export results for downstream analysis",
 ],
 color: "text-gold",
 },
 {
 title: "Find your way around",
 description:
"Every feature lives in the sidebar — search, chat, collections, extraction, precedents, and argumentation analysis.",
 icon: PanelsTopLeft,
 features: [
"Use the left sidebar to switch between tools",
"Precedent search and argumentation analysis sit here too",
"Re-open this tour any time from the Help page",
"Your work stays available across sessions",
 ],
 color: "text-ink-soft",
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
 color: "text-oxblood",
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
 <div className={`p-2 rounded-lg bg-gold-soft/50 ${step.color}`}>
 <StepIcon className="h-6 w-6"/>
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
 <Progress value={progress} className="h-2"/>
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
 <Button type="button"variant="outline"onClick={handlePrevious} className="gap-2">
 <ChevronLeft className="h-4 w-4"/>
 Previous
 </Button>
 )}
 <Button type="button"variant="ghost"onClick={handleSkip}>
 Skip Tour
 </Button>
 <Button type="button"onClick={handleNext} className="gap-2">
 {currentStep < onboardingSteps.length - 1 ? (
 <>
 Next
 <ChevronRight className="h-4 w-4"/>
 </>
 ) : (
 <>
 Get Started
 <Check className="h-4 w-4"/>
 </>
 )}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}
