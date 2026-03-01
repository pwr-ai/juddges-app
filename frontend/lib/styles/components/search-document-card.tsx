"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { SearchDocument } from "@/types/search";
import { DocumentCard } from "./document-card";
import type { SearchContextParams } from "./search/SearchResultsSection";

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
}: SearchDocumentCardProps): React.JSX.Element {
  const label = doc.title || doc.document_number || doc.document_id;

  return (
    <div className="rounded-xl border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelection(doc.document_id)}
          aria-label={`Select ${label}`}
        />
      </div>
      <DocumentCard document={doc} from="search" />
    </div>
  );
}
