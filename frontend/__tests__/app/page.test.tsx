import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import HomePage from "@/app/page";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  useDashboardResearchActivity,
  useDashboardStats,
} from "@/lib/api/dashboard";

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/contexts/LanguageContext", () => ({
  useTranslation: jest.fn(),
}));

jest.mock("@/lib/api/dashboard", () => ({
  useDashboardResearchActivity: jest.fn(),
  useDashboardStats: jest.fn(),
}));

jest.mock("@/components/landing/LandingPage", () => ({
  LandingPage: () => <div>Public landing page</div>,
}));

const successfulQuery = (data: unknown) => ({
  data,
  error: null,
  isError: false,
  isLoading: false,
});

describe("HomePage dashboard", () => {
  beforeAll(() => {
    class MockIntersectionObserver {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    }

    Object.defineProperty(window, "IntersectionObserver", {
      writable: true,
      value: MockIntersectionObserver,
    });
  });

  beforeEach(() => {
    window.localStorage.setItem("onboarding-dismissed", "true");
    jest.mocked(useAuth).mockReturnValue({
      user: { id: "user-1" },
      loading: false,
    } as ReturnType<typeof useAuth>);
    jest.mocked(useTranslation).mockReturnValue({
      t: (key: string) =>
        ({
          "dashboard.databaseOverview": "Database Overview",
          "dashboard.judgments": "Judgments",
          "dashboard.viewAll": "View all",
          "dashboard.failedToLoadStats": "Failed to load statistics",
        })[key] ?? key,
    } as ReturnType<typeof useTranslation>);
    jest.mocked(useDashboardStats).mockReturnValue(
      successfulQuery({
        total_judgments: 12_000,
        jurisdictions: { PL: 6_000, UK: 6_000 },
        computed_at: "2026-09-15T08:00:00Z",
      }) as ReturnType<typeof useDashboardStats>,
    );
    jest.mocked(useDashboardResearchActivity).mockReturnValue(
      successfulQuery({
        collectionCount: 2,
        documentCount: 7,
        recentCollections: [
          {
            id: "collection-1",
            name: "AI liability",
            documentCount: 5,
            updatedAt: "2026-09-15T09:00:00Z",
          },
        ],
        recentSearches: [
          {
            query: "duty of care",
            hit_count: 42,
            created_at: "2026-09-15T10:00:00Z",
          },
        ],
        collectionsUnavailable: false,
        searchesUnavailable: false,
      }) as ReturnType<typeof useDashboardResearchActivity>,
    );
  });

  it("makes the research workflow and continuation actions explicit", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Continue your research" }),
    ).toBeInTheDocument();
    expect(screen.getByText("01 · Plan")).toBeInTheDocument();
    expect(screen.getByText("02 · Search")).toBeInTheDocument();
    expect(screen.getByText("03 · Analyze")).toBeInTheDocument();

    const searchLinks = screen.getAllByRole("link", { name: /search judgments/i });
    expect(searchLinks[0]).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: /duty of care/i })).toHaveAttribute(
      "href",
      "/search?q=duty%20of%20care",
    );
    expect(screen.getByRole("link", { name: /AI liability/i })).toHaveAttribute(
      "href",
      "/collections/collection-1",
    );
  });

  it("labels the corpus total as judgments, not recent judgments", () => {
    render(<HomePage />);

    expect(screen.getByText("Judgments")).toBeInTheDocument();
    expect(screen.queryByText("Recent Judgments")).not.toBeInTheDocument();
  });

  it("keeps available activity visible when one source fails", () => {
    jest.mocked(useDashboardResearchActivity).mockReturnValue(
      successfulQuery({
        collectionCount: 1,
        documentCount: 5,
        recentCollections: [
          {
            id: "collection-1",
            name: "AI liability",
            documentCount: 5,
            updatedAt: "2026-09-15T09:00:00Z",
          },
        ],
        recentSearches: [],
        collectionsUnavailable: false,
        searchesUnavailable: true,
      }) as ReturnType<typeof useDashboardResearchActivity>,
    );

    render(<HomePage />);

    expect(screen.getByText(/search history is temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /AI liability/i })).toBeInTheDocument();
  });
});
