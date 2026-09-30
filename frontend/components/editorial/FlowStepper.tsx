"use client";

/**
 * FlowStepper — "which persona flow am I in, and which step?" (#690).
 *
 * Reads the current pathname against lib/navigation/flows.ts and renders a
 * single hairline row: flow eyebrow · "Step n of m" · previous / next step
 * links. Renders nothing on routes outside every flow and for signed-out
 * visitors, so it is safe to mount once in AppLayoutWrapper.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/contexts/LanguageContext";
import { findFlowStep, visibleSteps } from "@/lib/navigation/flows";

import { Eyebrow } from "./Eyebrow";

/**
 * `useSearchParams` needs a Suspense boundary above it (same pattern as the
 * navbar in AppLayoutWrapper); the inner component does the reading so the
 * outer one can provide the boundary.
 */
export function FlowStepper(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <FlowStepperInner />
    </Suspense>
  );
}

function FlowStepperInner(): React.JSX.Element | null {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { user } = useAuth();
  const { t } = useTranslation();

  if (!user) return null;
  const isAdmin = user.app_metadata?.is_admin === true;
  const hit = findFlowStep(pathname ?? "", isAdmin, search ? `?${search}` : "");
  if (!hit) return null;

  const steps = visibleSteps(hit.flow, isAdmin);
  const prev = hit.index > 1 ? steps[hit.index - 2] : null;
  const next = hit.index < hit.total ? steps[hit.index] : null;

  return (
    <nav
      aria-label={t("navigation.flowLabel")}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[color:var(--rule)] bg-[color:var(--parchment)] px-6 py-2 font-mono text-xs text-[color:var(--ink-soft)]"
    >
      <Eyebrow>{t(hit.flow.labelKey)}</Eyebrow>
      <span aria-current="step">{t("navigation.flowStep", { n: hit.index, m: hit.total })}</span>
      <span className="ml-auto flex items-center gap-4">
        {prev && (
          <Link href={prev.href} className="hover:text-[color:var(--ink)]">
            ← {t("common.previous")}: {t(prev.labelKey)}
          </Link>
        )}
        {next && (
          <Link href={next.href} className="hover:text-[color:var(--ink)]">
            {t("common.next")}: {t(next.labelKey)} →
          </Link>
        )}
      </span>
    </nav>
  );
}
