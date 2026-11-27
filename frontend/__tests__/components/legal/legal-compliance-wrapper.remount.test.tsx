import { act, render } from "@testing-library/react";
import React, { useEffect } from "react";

import { LegalComplianceWrapper } from "@/components/legal/legal-compliance-wrapper";
import { ExtractionJobClient } from "@/app/extractions/[id]/_components/ExtractionJobClient";

/**
 * #600: the wrapper used to return `<>{children}</>` while auth was pending
 * and `<>{children}<Modal/><Modal/></>` once the user resolved. AppLayoutWrapper
 * passes several siblings as `children` (an array), so the two shapes put that
 * array at different positions and React remounted the whole page subtree: the
 * extraction detail page ran its polling effect twice and aborted the first.
 */

let auth: { user: { id: string } | null; loading: boolean } = {
  user: null,
  loading: true,
};

jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
jest.mock("@/components/legal/professional-acknowledgment", () => ({
  ProfessionalAcknowledgment: () => null,
}));
jest.mock("@/components/onboarding/welcome-modal", () => ({
  WelcomeModal: () => null,
}));
jest.mock("@/lib/store/tourStore", () => ({
  useTourStore: (select: (s: unknown) => unknown) =>
    select({ isOpen: false, closeTour: () => {} }),
}));
jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            user_metadata: {
              professional_acknowledgment_accepted: true,
              onboarding_completed: true,
            },
          },
        },
      }),
    },
  }),
}));
jest.mock("@/lib/logger", () => {
  const log = { error: jest.fn(), child: jest.fn(() => ({ error: jest.fn() })) };
  return { __esModule: true, default: log, logger: log };
});
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const JOB_ID = "22222222-3333-4444-8555-666666666666";

function renderPage(page: React.ReactNode) {
  // Same shape AppLayoutWrapper hands the wrapper: sibling elements.
  return (
    <LegalComplianceWrapper>
      <div>{page}</div>
      <span data-testid="palette" />
      <span data-testid="pwa" />
    </LegalComplianceWrapper>
  );
}

describe("LegalComplianceWrapper children stability (#600)", () => {
  beforeEach(() => {
    auth = { user: null, loading: true };
  });

  it("does not remount sibling children when auth resolves", async () => {
    const log: string[] = [];
    function Probe() {
      useEffect(() => {
        log.push("mount");
        return () => {
          log.push("unmount");
        };
      }, []);
      return null;
    }

    const { rerender } = render(renderPage(<Probe />));
    auth = { user: { id: "u" }, loading: false };
    rerender(renderPage(<Probe />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(log).toEqual(["mount"]);
  });

  it("issues exactly one initial poll for the extraction detail page", async () => {
    const aborts: AbortSignal[] = [];
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.signal) aborts.push(init.signal);
      const body = String(url).includes("/results")
        ? {
            job_id: JOB_ID,
            offset: 0,
            limit: 20,
            total: 0,
            filtered_total: 0,
            counts: { completed: 0, failed: 0, other: 0 },
            results: [],
          }
        : { job_id: JOB_ID, status: "PENDING", results: [] };
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const page = (
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={{ job_id: JOB_ID, status: "PENDING" }}
      />
    );
    const { rerender } = render(renderPage(page));
    auth = { user: { id: "u" }, loading: false };
    rerender(renderPage(page));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const polls = fetchMock.mock.calls.filter(
      ([url]) => !String(url).includes("/results")
    );
    expect(polls).toHaveLength(1);
    expect(aborts.filter((signal) => signal.aborted)).toHaveLength(0);
  });
});
