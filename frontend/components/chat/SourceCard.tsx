// components/chat/SourceCard.tsx

import React from 'react';
import { SearchDocument, DocumentType } from '@/types/search';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { AlertTriangle, ExternalLink, BookmarkPlus, FileText, Scale, Calculator, Bug, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { cleanDocumentIdForUrl } from '@/lib/document-utils';
import { cn } from '@/lib/utils';

interface SourceCardProps {
  document: SearchDocument;
  onSaveToCollection?: (documentId: string) => void;
}

// Get icon and color based on document type
function getDocumentTypeInfo(type: string) {
  switch (type) {
    case DocumentType.JUDGMENT:
      return {
        icon: Scale,
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-gradient-to-br from-blue-100/90 via-indigo-100/70 to-blue-100/90 dark:from-blue-950/60 dark:via-indigo-950/50 dark:to-blue-950/60',
        iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-blue-400 dark:to-indigo-500',
        hoverBorder: 'hover:border-blue-500/50 dark:hover:border-primary/50',
        label: 'Judgment',
      };
    case DocumentType.TAX_INTERPRETATION: 
      return {
        icon: Calculator,
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-gradient-to-br from-amber-100/90 via-orange-100/70 to-amber-100/90 dark:from-amber-950/60 dark:via-orange-950/50 dark:to-amber-950/60',
        iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600 dark:from-[#03DAC6] dark:to-[#014444]',
        hoverBorder: 'hover:border-amber-500/50 dark:hover:border-[#03DAC6]/50',
        label: 'Tax Interpretation',
      };
    case DocumentType.ERROR:
      return {
        icon: Bug,
        color: 'text-red-700 dark:text-red-300',
        bgColor: 'bg-red-50 dark:bg-red-950',
        iconBg: 'bg-gradient-to-br from-red-500 to-red-600 dark:from-red-400 dark:to-red-500',
        hoverBorder: 'hover:border-red-500/50 dark:hover:border-red-500/50',
        label: 'Error',
      };
    default:
      return {
        icon: FileText,
        color: 'text-slate-600 dark:text-slate-400',
        bgColor: 'bg-gradient-to-br from-slate-50/70 via-slate-50/50 to-slate-100/40 dark:from-slate-900 dark:via-slate-900/50 dark:to-slate-800/30',
        iconBg: 'bg-gradient-to-br from-slate-500 to-slate-600 dark:from-slate-400 dark:to-slate-500',
        hoverBorder: 'hover:border-slate-500/50 dark:hover:border-slate-500/50',
        label: 'Document',
      };
  }
}

export function SourceCard({ document, onSaveToCollection }: SourceCardProps) {
  // Get icon and color based on document type
  const typeInfo = getDocumentTypeInfo(document.document_type);
  const Icon = typeInfo.icon;
  const isDocumentFetched = typeInfo.label !== 'Error';

  // Format date if available
  const formattedDate = document.date_issued
    ? format(new Date(document.date_issued), 'MMM dd, yyyy')
    : null;

  // Get preview text (first 150 characters of summary)
  const previewText = document.summary
    ? document.summary.length > 150
      ? document.summary.slice(0, 150) + '...'
      : document.summary
    : 'No summary available';

  return (
    <Card className={cn(
      "group relative hover:shadow-xl transition-all duration-300 border-slate-200 dark:border-slate-700 overflow-hidden",
      typeInfo.bgColor,
      typeInfo.hoverBorder,
      "py-3 gap-0 flex flex-col h-full rounded-xl"
    )}>
      {/* Enhanced gradient overlay */}
      <div className={cn(
        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl -z-10",
        typeInfo.label === 'Judgment'
          ? "bg-gradient-to-br from-blue-500/20 via-indigo-500/15 to-blue-500/20 dark:from-blue-500/30 dark:via-indigo-500/25 dark:to-blue-500/30"
          : typeInfo.label === 'Tax Interpretation'
          ? "bg-gradient-to-br from-amber-500/20 via-orange-500/15 to-amber-500/20 dark:from-amber-500/30 dark:via-orange-500/25 dark:to-amber-500/30"
          : "bg-gradient-to-br from-slate-500/10 via-slate-500/5 to-slate-500/10 dark:from-slate-500/20 dark:via-slate-500/15 dark:to-slate-500/20"
      )} />
      <CardHeader className="pb-2 space-y-1.5 px-4 pt-3 flex-shrink-0 overflow-hidden">
        {/* Document Type and Date Badge - Same level */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
            {typeInfo.label}
          </div>
          {formattedDate && (
            <div className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-all",
              typeInfo.label === 'Judgment' 
                ? "bg-gradient-to-r from-blue-50/90 to-indigo-50/70 dark:from-primary/10 dark:via-primary/5 dark:to-primary/3 border-blue-200/50 dark:border-primary/30 text-blue-700 dark:text-blue-300"
                : typeInfo.label === 'Tax Interpretation'
                ? "bg-gradient-to-r from-amber-50/90 to-orange-50/70 dark:from-[#03DAC6]/20 dark:via-[#03DAC6]/10 dark:to-[#014444]/20 border-amber-200/50 dark:border-[#03DAC6]/30 text-amber-700 dark:text-amber-300"
                : "bg-gradient-to-r from-slate-50/90 to-slate-100/70 dark:from-slate-800/50 dark:via-slate-800/30 dark:to-slate-700/50 border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-300"
            )}>
              <Calendar className="h-3.5 w-3.5" />
              <span>{formattedDate}</span>
            </div>
          )}
        </div>
        
        {/* Document Title */}
        <div className="flex items-center justify-between gap-2 overflow-hidden">
          <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
            <div className={cn("flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center", typeInfo.iconBg)}>
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <h4 className="text-sm font-semibold truncate transition-colors group-hover:text-primary">
                {document.document_number || document.title || document.document_id}
              </h4>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 py-3 flex-1 flex flex-col gap-3">
        {/* Preview text */}
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-3">
          {previewText}
        </p>

        {/* Error warning */}
        {!isDocumentFetched && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-xs border",
              (document as any)?._isWeaviateError
                ? "border-red-300/50 bg-red-50/80 dark:bg-red-950/60 dark:border-red-500/40 text-red-900 dark:text-red-200"
                : "border-amber-300/50 bg-amber-50/80 dark:bg-amber-950/60 dark:border-amber-500/40 text-amber-900 dark:text-amber-200"
            )}
            role="alert"
            title={
              (document as any)?._isWeaviateError
                ? "The document database is temporarily unavailable. Please try again later."
                : "Document may not exist or is AI-generated noise. Verify manually."
            }
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              {(document as any)?._isWeaviateError
                ? "Source information cannot be loaded. The document database is temporarily unavailable."
                : "May be hallucinated. Verify manually."}
            </span>
          </div>
        )}
      </CardContent>

      <CardFooter className={cn(
        "px-4 pb-3 pt-0 flex items-center gap-2",
        typeInfo.label === 'Judgment'
          ? "bg-gradient-to-t from-blue-50/50 via-transparent to-transparent dark:from-primary/5 dark:via-transparent dark:to-transparent"
          : typeInfo.label === 'Tax Interpretation'
          ? "bg-gradient-to-t from-amber-50/50 via-transparent to-transparent dark:from-[#03DAC6]/10 dark:via-transparent dark:to-transparent"
          : "bg-gradient-to-t from-slate-50/50 via-transparent to-transparent dark:from-slate-800/30 dark:via-transparent dark:to-transparent"
      )}>
        {isDocumentFetched && (
          <>
            <Link
              href={`/documents/${cleanDocumentIdForUrl(document.document_id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button 
                variant="outline" 
                size="sm" 
                className={cn(
                  "group/btn relative h-8 text-xs w-full overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-md",
                  typeInfo.label === 'Judgment'
                    ? "bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-blue-200/50 dark:border-primary/30 hover:border-blue-400 dark:hover:border-primary/50 text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200"
                    : typeInfo.label === 'Tax Interpretation'
                    ? "bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-amber-200/50 dark:border-[#03DAC6]/30 hover:border-amber-400 dark:hover:border-[#03DAC6]/50 text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200"
                    : "bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border-slate-200/50 dark:border-slate-700/50 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                )}
              >
                {/* Gradient overlay on hover */}
                <div className={cn(
                  "absolute inset-0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300 -z-10",
                  typeInfo.label === 'Judgment'
                    ? "bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-blue-50/80 dark:from-blue-900/40 dark:via-indigo-900/30 dark:to-blue-900/40"
                    : typeInfo.label === 'Tax Interpretation'
                    ? "bg-gradient-to-r from-amber-50/80 via-orange-50/60 to-amber-50/80 dark:from-amber-900/40 dark:via-orange-900/30 dark:to-amber-900/40"
                    : "bg-gradient-to-r from-slate-50/80 via-slate-100/60 to-slate-50/80 dark:from-slate-800/40 dark:via-slate-700/30 dark:to-slate-800/40"
                )} />
                
                {/* Content */}
                <span className="relative z-10 flex items-center justify-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5 transition-transform duration-300 group-hover/btn:scale-110 group-hover/btn:translate-x-0.5" />
                  View Full
                </span>
              </Button>
            </Link>
            {onSaveToCollection && (
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "group/btn relative h-8 text-xs px-3 overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-md",
                  typeInfo.label === 'Judgment'
                    ? "bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-blue-200/50 dark:border-primary/30 hover:border-blue-400 dark:hover:border-primary/50 text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200"
                    : typeInfo.label === 'Tax Interpretation'
                    ? "bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-amber-200/50 dark:border-[#03DAC6]/30 hover:border-amber-400 dark:hover:border-[#03DAC6]/50 text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200"
                    : "bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                )}
                onClick={() => onSaveToCollection(document.document_id)}
              >
                {/* Gradient overlay on hover */}
                <div className={cn(
                  "absolute inset-0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300 -z-10",
                  typeInfo.label === 'Judgment'
                    ? "bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-blue-50/80 dark:from-blue-900/40 dark:via-indigo-900/30 dark:to-blue-900/40"
                    : typeInfo.label === 'Tax Interpretation'
                    ? "bg-gradient-to-r from-amber-50/80 via-orange-50/60 to-amber-50/80 dark:from-amber-900/40 dark:via-orange-900/30 dark:to-amber-900/40"
                    : "bg-gradient-to-r from-slate-50/80 via-slate-100/60 to-slate-50/80 dark:from-slate-800/40 dark:via-slate-700/30 dark:to-slate-800/40"
                )} />
                
                {/* Content */}
                <span className="relative z-10 flex items-center gap-1.5">
                  <BookmarkPlus className="h-3.5 w-3.5 transition-transform duration-300 group-hover/btn:scale-110 group-hover/btn:rotate-12" />
                  Save
                </span>
              </Button>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
}
