import { render } from "@testing-library/react";

import { DocumentCard } from "@/lib/styles/components/document-card";
import { SearchDocumentCard } from "@/lib/styles/components/search-document-card";
import type { SearchDocument } from "@/types/search";

// SearchDocumentCard reads feedbackVotes and setFeedbackVote from the search store.
jest.mock("@/lib/store/searchStore", () => ({
  useSearchStore: (selector: (s: { feedbackVotes: Record<string, unknown>; setFeedbackVote: () => void }) => unknown) =>
    selector({ feedbackVotes: {}, setFeedbackVote: () => {} }),
}));

function makeDoc(overrides: Partial<SearchDocument> = {}): SearchDocument {
  return {
    document_id: "doc-1",
    title: "The Law",
    summary: "A summary of law.",
    date_issued: null,
    issuing_body: null,
    language: null,
    document_number: null,
    country: null,
    full_text: null,
    thesis: null,
    legal_references: null,
    legal_concepts: null,
    keywords: null,
    score: null,
    court_name: null,
    department_name: null,
    presiding_judge: null,
    judges: null,
    parties: null,
    outcome: null,
    legal_bases: null,
    extracted_legal_bases: null,
    references: null,
    factual_state: null,
    legal_state: null,
    ...overrides,
  } as unknown as SearchDocument;
}

describe("<DocumentCard>", () => {
  it("renders <mark> for highlighted.title from the server", () => {
    const { container } = render(
      <DocumentCard
        document={makeDoc({
          highlighted: { title: "The <mark>Law</mark>", summary: null },
        })}
        from="search"
      />
    );
    const mark = container.querySelector("mark");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe("Law");
  });

  it("renders <mark> for highlighted.summary from the server", () => {
    const { container } = render(
      <DocumentCard
        document={makeDoc({
          highlighted: { title: null, summary: "A summary of <mark>law</mark>." },
        })}
        from="search"
      />
    );
    expect(
      Array.from(container.querySelectorAll("mark")).map((m) => m.textContent)
    ).toContain("law");
  });

  it("falls back to client-side highlight when only query is provided", () => {
    const { container } = render(
      <DocumentCard
        document={makeDoc()}
        from="search"
        query="law"
      />
    );
    const marks = Array.from(container.querySelectorAll("mark")).map(
      (m) => m.textContent
    );
    // Title contains "Law" (capital) and summary contains "law" (lowercase)
    expect(marks).toContain("Law");
    expect(marks).toContain("law");
  });

  it("appends ?q= to the detail-page link when query is provided", () => {
    const { container } = render(
      <DocumentCard
        document={makeDoc({ document_id: "doc-42" })}
        from="search"
        query="law"
      />
    );
    const link = container.querySelector('a[href^="/documents/"]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toContain("q=law");
    expect(link?.getAttribute("href")).toContain("from=search");
  });

  it("omits ?q= when query is empty or whitespace", () => {
    const { container } = render(
      <DocumentCard document={makeDoc()} from="search" query="   " />
    );
    const link = container.querySelector('a[href^="/documents/"]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).not.toContain("q=");
  });

  it("keeps the summary highlight visible by trimming long leading text under line-clamp", () => {
    const longPrefix = "alpha bravo charlie delta echo foxtrot golf hotel india juliet ".repeat(4);
    const { container } = render(
      <DocumentCard
        document={makeDoc({
          highlighted: {
            title: null,
            summary: `${longPrefix}<mark>match</mark> trailing tail`,
          },
        })}
        from="search"
      />
    );
    const summaryP = container.querySelector("p.line-clamp-3") as HTMLElement | null;
    expect(summaryP).not.toBeNull();
    const inner = summaryP!.innerHTML;
    expect(inner).toContain("<mark>match</mark>");
    // Highlight must land near the start so line-clamp-3 cannot hide it.
    const markIdx = inner.indexOf("<mark>");
    expect(markIdx).toBeLessThan(80);
    expect(summaryP!.textContent?.startsWith("… ")).toBe(true);
  });

  it("does not trim the summary in the extended (non-clamped) view", () => {
    const longPrefix = "alpha bravo charlie delta echo foxtrot golf hotel india juliet ".repeat(4);
    const { container } = render(
      <DocumentCard
        document={makeDoc({
          highlighted: {
            title: null,
            summary: `${longPrefix}<mark>match</mark> trailing tail`,
          },
        })}
        from="search"
        showExtended
      />
    );
    const summaryP = container.querySelector("p.whitespace-pre-wrap") as HTMLElement | null;
    expect(summaryP).not.toBeNull();
    // Full original prefix is preserved when not clamped.
    expect(summaryP!.textContent?.startsWith("alpha bravo")).toBe(true);
  });

  it("renders plain title/summary when no highlight or query is provided", () => {
    const { container } = render(<DocumentCard document={makeDoc()} />);
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toContain("The Law");
    expect(container.textContent).toContain("A summary of law.");
  });
});

describe("<SearchDocumentCard>", () => {
  it("forwards searchContextParams.searchQuery as the query prop to DocumentCard", () => {
    const { container } = render(
      <SearchDocumentCard
        doc={makeDoc({ document_id: "doc-99" })}
        isSelected={false}
        onToggleSelection={() => {}}
        resultPosition={0}
        searchContextParams={{
          searchQuery: "law",
          searchMode: "rabbit",
          filters: {},
          totalResults: 1,
        }}
      />
    );
    const link = container.querySelector('a[href^="/documents/"]') as HTMLAnchorElement | null;
    expect(link?.getAttribute("href")).toContain("q=law");
  });
});
