"use client";

import Link from "next/link";
import { ExternalLink, Trash2 } from "lucide-react";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cleanDocumentIdForUrl } from "@/lib/document-utils";
import type { SearchDocument } from "@/types/search";

export interface DocumentCardProps {
  document: SearchDocument;
  onSaveToCollection?: (documentId: string) => void;
  onRemove?: (documentId: string) => void;
  showRemoveButton?: boolean;
  showExtended?: boolean;
  from?: string;
  chatId?: string;
}

function buildDocumentHref(documentId: string, from?: string, chatId?: string): string {
  const cleanId = cleanDocumentIdForUrl(documentId);
  const params = new URLSearchParams();
  if (from) {
    params.set("from ", from);
  }
  if (chatId) {
    params.set("chatId", chatId);
  }
  const suffix = params.toString();
  return suffix ? `/documents/${cleanId}?${suffix}` : `/documents/${cleanId}`;
}

function formatDocumentType(type?: string | null): string {
  if (!type) return "Document";
  if (type === "judgment" || type === "judgement") return "Judgment";
  return type.replace(/_/g, " ");
}

/** Returns a short jurisdiction label from a country code or jurisdiction string */
function formatJurisdiction(doc: SearchDocument): string | null {
  // Check the issuing_body.jurisdiction, country, or infer from court_name
  const jurisdiction = doc.issuing_body?.jurisdiction || doc.country;
  if (!jurisdiction) return null;

  const code = jurisdiction.toUpperCase();
  if (code === "PL" || code === "POLAND") return "PL";
  if (code === "UK" || code === "GB" || code === "UNITED KINGDOM" || code === "GREAT BRITAIN") return "UK";
  return code.length <= 3 ? code : code.slice(0, 2);
}

/** Returns a human-readable language label */
function formatLanguage(lang?: string | null): string | null {
  if (!lang) return null;
  const code = lang.toLowerCase();
  if (code === "pl" || code === "polish") return "PL";
  if (code === "en" || code === "english") return "EN";
  if (code === "de" || code === "german") return "DE";
  if (code === "fr" || code === "french") return "FR";
  return lang.toUpperCase().slice(0, 2);
}

export function DocumentCard({
  document,
  onSaveToCollection,
  onRemove,
  showRemoveButton = false,
  showExtended = false,
  from,
  chatId,
}: DocumentCardProps): React.JSX.Element {
  const title = document.title || document.document_number || document.document_id;
  const summary = document.summary || document.thesis || "No summary available.";
  const href = buildDocumentHref(document.document_id, from, chatId);
  const jurisdictionLabel = formatJurisdiction(document);
  const languageLabel = formatLanguage(document.language);

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm leading-5">{title}</CardTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            {jurisdictionLabel && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {jurisdictionLabel}
              </Badge>
            )}
            {languageLabel && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {languageLabel}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              {formatDocumentType(document.document_type)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {(document.court_name || document.issuing_body?.name) && (
          <p className="text-xs text-muted-foreground">
            {document.court_name || document.issuing_body?.name}
          </p>
        )}
        {document.date_issued && (
          <p className="text-xs text-muted-foreground">{document.date_issued}</p>
        )}
        <p className={showExtended ? "text-sm whitespace-pre-wrap" : "text-sm line-clamp-3"}>
          {summary}
        </p>
      </CardContent>
      <CardFooter className="flex items-center gap-2">
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link href={href} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            View
          </Link>
        </Button>
        {onSaveToCollection && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSaveToCollection(document.document_id)}
          >
            Save
          </Button>
        )}
        {showRemoveButton && onRemove && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onRemove(document.document_id)}
            aria-label="Remove document"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
