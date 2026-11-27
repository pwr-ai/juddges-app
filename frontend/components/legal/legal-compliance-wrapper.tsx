"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ProfessionalAcknowledgment } from "./professional-acknowledgment";
import { WelcomeModal } from "@/components/onboarding/welcome-modal";
import { useTourStore } from "@/lib/store/tourStore";
import { createClient } from "@/lib/supabase/client";
import logger from "@/lib/logger";

export function LegalComplianceWrapper({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [showAcknowledgment, setShowAcknowledgment] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  // Manual "Show tour" re-trigger (e.g. from the Help page), independent of the
  // first-visit Supabase metadata gate below.
  const tourOpen = useTourStore((s) => s.isOpen);
  const closeTour = useTourStore((s) => s.closeTour);
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

  // The tree shape must not depend on auth state. This used to return
  // `<>{children}</>` while checking and `<>{children}<Modal/>...</>` after:
  // callers pass several siblings as `children` (an array), which sat at a
  // different position in the two shapes, so React unmounted and remounted the
  // whole page subtree once auth resolved (#600). Keep `children` at index 0 of
  // one fragment and only toggle the trailing slot.
  const showModals = !(isChecking || loading || !user);

  return (
    <>
      {children}
      {showModals ? (
        <>
          <ProfessionalAcknowledgment
            open={showAcknowledgment}
            onOpenChange={(open) => {
              if (!open) {
                handleAcknowledgmentComplete();
              }
            }}
          />
          <WelcomeModal
            open={showWelcome || tourOpen}
            onOpenChange={(open) => {
              setShowWelcome(open);
              if (!open) {
                closeTour();
              }
            }}
            onComplete={handleWelcomeComplete}
          />
        </>
      ) : null}
    </>
  );
}
