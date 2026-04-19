"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { SearchDocument } from "@/types/search";
import { DocumentCard } from "./document-card";
import type { SearchContextParams } from "./search/SearchResultsSection";
import { SearchResultFeedback } from "./search-result-feedback";
import type { SearchFeedbackContext } from "./search-result-feedback";
import { useSearchStore } from "@/lib/store/searchStore";

export interface SearchDocumentCardProps {
  doc: SearchDocument;
  isSelected: boolean;
  onToggleSelection: (documentId: string) => void;
  resultPosition: number;
  searchContextParams?: SearchContextParams;
}

export function SearchDocumentCard({
  doc,
  isSelected,
  onToggleSelection,
  resultPosition,
  searchContextParams,
}: SearchDocumentCardProps): React.JSX.Element {
  const label = doc.title || doc.document_number || doc.document_id;

  const feedbackVotes = useSearchStore((state) => state.feedbackVotes);
  const setFeedbackVote = useSearchStore((state) => state.setFeedbackVote);
  const persistedRating = feedbackVotes[doc.document_id] ?? null;

  // Build the search context required by SearchResultFeedback
  const feedbackContext: SearchFeedbackContext | null = searchContextParams
    ? {
        filters: {
          courts: (searchContextParams.filters?.["issuing_bodies"] as string[] | undefined) ?? [],
          date_from: (searchContextParams.filters?.["date_from"] as string | null) ?? null,
          date_to: (searchContextParams.filters?.["date_to"] as string | null) ?? null,
          document_types: (searchContextParams.filters?.["document_types"] as string[] | undefined) ?? [],
          languages: (searchContextParams.filters?.["languages"] as string[] | undefined) ?? [],
          keywords: (searchContextParams.filters?.["keywords"] as string[] | undefined) ?? [],
          legal_concepts: (searchContextParams.filters?.["legal_concepts"] as string[] | undefined) ?? [],
          issuing_bodies: (searchContextParams.filters?.["issuing_bodies"] as string[] | undefined) ?? [],
        },
        search_params: {
          mode: (searchContextParams.searchMode as SearchFeedbackContext["search_params"]["mode"]) ?? "rabbit",
        },
        result_context: {
          total_results: searchContextParams.totalResults ?? 0,
          position: resultPosition,
        },
        document: {
          document_id: doc.document_id,
          document_number: doc.document_number ?? null,
          title: doc.title ?? null,
          document_type: doc.document_type ?? null,
          court: doc.court_name ?? (doc.issuing_body?.name ?? null),
          date: doc.date_issued ?? null,
          language: doc.language ?? null,
          country: doc.country ?? null,
        },
        interaction: {
          search_timestamp: searchContextParams.searchTimestamp ?? new Date().toISOString(),
        },
      }
    : null;

  return (
    <div className="rounded-xl border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelection(doc.document_id)}
          aria-label={`Select ${label}`}
        />
        {feedbackContext && (
          <SearchResultFeedback
            documentId={doc.document_id}
            searchQuery={searchContextParams?.searchQuery ?? ""}
            resultPosition={resultPosition}
            searchContext={feedbackContext}
            initialRating={persistedRating}
            onFeedbackSubmit={(rating) => setFeedbackVote(doc.document_id, rating)}
            onFeedbackRevoke={() => setFeedbackVote(doc.document_id, null)}
          />
        )}
      </div>
      <DocumentCard document={doc} from="search" />
    </div>
  );
}
