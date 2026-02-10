"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ProfessionalAcknowledgment } from "./professional-acknowledgment";
import { WelcomeModal } from "@/components/onboarding/welcome-modal";
import { createClient } from "@/lib/supabase/client";
import logger from "@/lib/logger";

export function LegalComplianceWrapper({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [showAcknowledgment, setShowAcknowledgment] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const complianceLogger = logger.child("LegalComplianceWrapper");

  useEffect(() => {
    async function checkUserAcknowledgment() {
      if (loading || !user) {
        setIsChecking(false);
        return;
      }

      try {
        const supabase = createClient();
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (!currentUser) {
          setIsChecking(false);
          return;
        }

        // Check if user has accepted professional acknowledgment
        const hasAccepted =
          currentUser.user_metadata?.professional_acknowledgment_accepted === true;
        const hasSeenWelcome = currentUser.user_metadata?.onboarding_completed === true;

        if (!hasAccepted) {
          setShowAcknowledgment(true);
        } else if (!hasSeenWelcome) {
          setShowWelcome(true);
        }
      } catch (error) {
        complianceLogger.error("Error checking user acknowledgment", error);
      } finally {
        setIsChecking(false);
      }
    }

    checkUserAcknowledgment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const handleAcknowledgmentComplete = () => {
    setShowAcknowledgment(false);
    // After acknowledgment, show welcome modal
    setShowWelcome(true);
  };

  const handleWelcomeComplete = async () => {
    setShowWelcome(false);

    // Mark onboarding as completed
    try {
      const supabase = createClient();
      await supabase.auth.updateUser({
        data: {
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      complianceLogger.error("Error marking onboarding complete", error);
    }
  };

  // Don't render modals while checking or if no user
  if (isChecking || loading || !user) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <ProfessionalAcknowledgment
        open={showAcknowledgment}
        onOpenChange={(open) => {
          if (!open) {
            handleAcknowledgmentComplete();
          }
        }}
      />
      <WelcomeModal
        open={showWelcome}
        onOpenChange={setShowWelcome}
        onComplete={handleWelcomeComplete}
      />
    </>
  );
}
