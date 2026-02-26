"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import logger from "@/lib/logger";

interface ProfessionalAcknowledgmentProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ProfessionalAcknowledgment({
  open,
  onOpenChange,
}: ProfessionalAcknowledgmentProps) {
  const [accepted, setAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const modalLogger = logger.child("ProfessionalAcknowledgment");

  const handleAccept = async () => {
    if (!accepted) {
      toast.error("Please accept the terms to continue");
      return;
    }

    setIsLoading(true);
    modalLogger.info("User accepting professional acknowledgment");

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("User not authenticated");
      }

      // Update user metadata to record acknowledgment
      const { error } = await supabase.auth.updateUser({
        data: {
          professional_acknowledgment_accepted: true,
          professional_acknowledgment_accepted_at: new Date().toISOString(),
        },
      });

      if (error) throw error;

      modalLogger.info("Professional acknowledgment accepted", { userId: user.id });
      toast.success("Terms accepted successfully");

      // Close modal and refresh
      onOpenChange?.(false);
      router.refresh();
    } catch (error) {
      modalLogger.error("Error accepting acknowledgment", error);
      toast.error("Failed to save acknowledgment. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const terms = [
    {
      icon: AlertTriangle,
      title: "AI Assistance, Not Legal Advice",
      description:
        "This tool provides AI-powered assistance for research and analysis. It does not provide legal advice and should not be relied upon as a substitute for professional judgment.",
      color: "text-amber-600 dark:text-amber-500",
    },
    {
      icon: Shield,
      title: "Professional Responsibility",
      description:
        "You are solely responsible for verifying all AI-generated outputs before using them in any professional or legal context. Always apply your professional judgment.",
      color: "text-blue-600 dark:text-blue-500",
    },
    {
      icon: AlertTriangle,
      title: "No Attorney-Client Privilege",
      description:
        "Use of this tool does not create an attorney-client relationship, and communications through this platform may not be privileged or confidential.",
      color: "text-red-600 dark:text-red-500",
    },
    {
      icon: CheckCircle2,
      title: "Verification Required",
      description:
        "All AI-generated content must be independently verified. The AI may produce incomplete, incorrect, or outdated information. Professional verification is mandatory.",
      color: "text-green-600 dark:text-green-500",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Professional Use Acknowledgment
          </DialogTitle>
          <DialogDescription className="text-base pt-2">
            Before using JuDDGES, please review and acknowledge these important
            professional responsibility terms.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {terms.map((term, index) => (
            <div
              key={index}
              className="flex gap-4 p-4 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex-shrink-0 mt-0.5">
                <term.icon className={`h-5 w-5 ${term.color}`} />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-foreground">{term.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {term.description}
                </p>
              </div>
            </div>
          ))}

          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-6">
            <p className="text-sm text-foreground font-medium mb-2">Important Reminders:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>AI outputs are for research and reference only</li>
              <li>Always verify information with primary sources</li>
              <li>Maintain professional liability insurance</li>
              <li>Follow your jurisdiction&apos;s professional conduct rules</li>
            </ul>
          </div>

          <div className="flex items-start gap-3 pt-4">
            <Checkbox
              id="accept-terms"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
              disabled={isLoading}
              aria-label="Accept professional acknowledgment terms"
            />
            <Label
              htmlFor="accept-terms"
              className="text-sm font-medium leading-relaxed cursor-pointer select-none"
            >
              I understand and accept these terms. I acknowledge that this tool provides AI
              assistance, not legal advice, and that I am responsible for verifying all AI outputs
              before use. I understand that attorney-client privilege may not apply, and that this
              does not replace my professional judgment.
            </Label>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            onClick={handleAccept}
            disabled={!accepted || isLoading}
            className="w-full sm:w-auto"
          >
            {isLoading ? "Accepting..." : "Accept and Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
