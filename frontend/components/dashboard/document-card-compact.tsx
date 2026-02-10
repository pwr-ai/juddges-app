import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Calendar,
  FileText,
  Info,
  ExternalLink
} from "lucide-react";
import { cleanDocumentIdForUrl } from "@/lib/document-utils";

function formatDocumentType(type: string): string {
  const typeMap: Record<string, string> = {
    judgment: "Judgment",
    tax_interpretation: "Tax Interpretation",
    legal_act: "Legal Act",
    regulation: "Regulation",
  };
  return typeMap[type] || type;
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "No date";
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  } catch {
    return "Invalid date";
  }
}

interface DocumentCardCompactProps {
  title?: string;
  documentNumber?: string;
  type: string;
  documentId?: string;
  date?: string | null;
  aiSummary?: string | null;
  topics?: string[] | null;
  jurisdiction?: string | null;
  language?: string;
  onPreview?: () => void;
  onSave?: () => void;
  onExport?: () => void;
}

export function DocumentCardCompact({
  title,
  documentNumber,
  type,
  documentId,
  date,
  aiSummary,
  topics,
  jurisdiction,
  language = "pl",
  onPreview,
  onSave,
  onExport
}: DocumentCardCompactProps) {
  const handleViewFull = () => {
    if (!documentId) return;
    const cleanedId = cleanDocumentIdForUrl(documentId);
    window.open(`/documents/${cleanedId}`, '_blank');
  };
  // Determine document type
  const docType = type?.toLowerCase().replace(/[_\s]/g, '') || '';
  const isTaxInterpretation = docType.includes('taxinterpretation');
  const isJudgment = docType.includes('judgment');
  
  // Determine background color based on document type
  const getCardBackground = () => {
    if (isTaxInterpretation) {
      return 'bg-gradient-to-br from-amber-50/60 via-amber-50/40 to-orange-50/30 dark:from-[#03DAC6]/25 dark:via-[#03DAC6]/15 dark:to-[#014444]/20';
    } else if (isJudgment) {
      return 'bg-gradient-to-br from-blue-50/60 via-blue-50/40 to-indigo-50/30 dark:from-primary/10 dark:via-primary/5 dark:to-primary/3';
    }
    return 'bg-gradient-to-br from-slate-50/70 via-slate-50/50 to-slate-100/40 dark:from-slate-900 dark:via-slate-900/50 dark:to-slate-800/30';
  };
  
  // Get metadata box background
  const getMetadataBackground = () => {
    if (isTaxInterpretation) {
      return 'bg-gradient-to-br from-amber-50 via-amber-100/80 to-orange-100/60 dark:from-[#014444]/90 dark:via-[#013333]/80 dark:to-[#014444]/70 border-amber-200/50 dark:border-[#013333]';
    } else if (isJudgment) {
      return 'bg-gradient-to-br from-blue-50 via-blue-100/80 to-indigo-100/60 dark:from-primary/10 dark:via-primary/5 dark:to-primary/3 border-blue-200/50 dark:border-primary/20';
    }
    return 'bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200/90 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 border-slate-200/80 dark:border-slate-800';
  };
  
  // Get icon background
  const getIconBackground = () => {
    if (isTaxInterpretation) {
      return 'bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 dark:from-[#03DAC6] dark:via-[#02C4B3] dark:to-[#018786] shadow-md shadow-amber-500/20 dark:shadow-[#03DAC6]/30';
    } else if (isJudgment) {
      return 'bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 shadow-md shadow-blue-500/20';
    }
    return 'bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 shadow-md shadow-blue-500/20';
  };
  
  // Get keyword badge background
  const getKeywordBadgeBackground = () => {
    if (isTaxInterpretation) {
      return 'bg-gradient-to-r from-amber-50/90 to-orange-50/70 dark:from-[#03DAC6]/20 dark:to-[#014444] border-amber-200/60 dark:border-[#03DAC6]/40 text-amber-800 dark:text-[#03DAC6] hover:from-amber-100/90 hover:to-amber-50/80 dark:hover:from-[#02C4B3]/30 dark:hover:to-[#013333] shadow-sm hover:shadow-md';
    } else if (isJudgment) {
      return 'bg-gradient-to-r from-blue-50/90 to-indigo-50/70 dark:from-blue-950/30 dark:to-indigo-950/20 border-blue-200/60 dark:border-blue-800/40 text-blue-800 dark:text-blue-300 hover:from-blue-100/90 hover:to-blue-50/80 dark:hover:from-blue-900/40 dark:hover:to-blue-950/30 shadow-sm hover:shadow-md';
    }
    return 'bg-gradient-to-r from-slate-50/90 to-slate-100/70 dark:from-slate-800/40 dark:to-slate-700/30 border-slate-200/60 dark:border-slate-700/40 text-slate-800 dark:text-slate-300 hover:from-slate-100/90 hover:to-slate-50/80 dark:hover:from-slate-700/50 dark:hover:to-slate-800/40 shadow-sm hover:shadow-md';
  };
  
  // Get date badge background
  const getDateBadgeBackground = () => {
    if (isTaxInterpretation) {
      return 'bg-gradient-to-r from-amber-50/90 to-orange-50/70 dark:from-[#03DAC6]/20 dark:to-[#014444] border-amber-200/60 dark:border-[#03DAC6]/40 text-amber-800 dark:text-[#03DAC6] shadow-sm hover:shadow-md';
    } else if (isJudgment) {
      return 'bg-gradient-to-r from-blue-50/90 to-indigo-50/70 dark:from-blue-900/40 dark:to-indigo-900/30 border-blue-200/60 dark:border-blue-700/50 text-blue-800 dark:text-blue-200 shadow-sm hover:shadow-md';
    }
    return 'bg-gradient-to-r from-slate-50/90 to-slate-100/70 dark:from-slate-700/50 dark:to-slate-600/40 border-slate-200/60 dark:border-slate-600/50 text-slate-800 dark:text-slate-200 shadow-sm hover:shadow-md';
  };
  
  // Get hover border color
  const getHoverBorderColor = () => {
    if (isTaxInterpretation) {
      return 'hover:border-amber-500/50 dark:hover:border-[#03DAC6]/50';
    } else if (isJudgment) {
      return 'hover:border-blue-500/50 dark:hover:border-blue-500/30';
    }
    return 'hover:border-blue-500/50 dark:hover:border-blue-500/30';
  };
  
  // Get button colors
  const getButtonColors = () => {
    if (isTaxInterpretation) {
      return {
        primary: 'bg-gradient-to-r from-amber-600 to-orange-600 dark:from-[#03DAC6] dark:to-[#018786] hover:from-amber-700 hover:to-orange-700 dark:hover:from-[#02C4B3] dark:hover:to-[#017575]',
        outline: 'border-amber-300 dark:border-[#03DAC6]/50 hover:border-amber-500 dark:hover:border-[#03DAC6] hover:bg-amber-50 dark:hover:bg-[#03DAC6]/20'
      };
    } else if (isJudgment) {
      return {
        primary: 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700',
        outline: 'border-blue-300 dark:border-blue-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30'
      };
    }
    return {
      primary: 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700',
      outline: 'border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30'
    };
  };
  
  // Get footer background
  const getFooterBackground = () => {
    if (isTaxInterpretation) {
      return 'bg-gradient-to-r from-amber-50/90 via-amber-100/70 to-orange-100/50 dark:from-[#03DAC6]/25 dark:via-[#03DAC6]/15 dark:to-[#014444]/20 border-amber-200/30 dark:border-[#03DAC6]/40';
    } else if (isJudgment) {
      return 'bg-gradient-to-r from-blue-50/90 via-blue-100/70 to-indigo-100/50 dark:from-primary/10 dark:via-primary/5 dark:to-primary/3 border-blue-200/30 dark:border-primary/20';
    }
    return 'bg-gradient-to-r from-slate-50 via-slate-100 to-slate-200/80 dark:from-slate-900/40 dark:via-slate-900/30 dark:to-slate-800/20 border-slate-200/50 dark:border-slate-800/50';
  };
  
  const buttonColors = getButtonColors();

  return (
    <Card className={cn(
      "group hover:shadow-xl transition-all duration-300 border-slate-200 dark:border-slate-700 overflow-hidden",
      getCardBackground(),
      getHoverBorderColor(),
      "py-3 gap-0 flex flex-col h-full min-h-[360px] rounded-xl"
    )}>
      <CardHeader className="pb-2 space-y-1.5 px-4 pt-3 flex-shrink-0 overflow-hidden">
        {/* Document Type - Subtle header text */}
        {type && (
          <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
            {type.replace('_', ' ')}
          </div>
        )}
        
        {/* Document Title */}
        <div className="flex items-center justify-between gap-2 overflow-hidden">
          <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
            <div className={cn("flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center", getIconBackground())}>
              <FileText className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <CardTitle className="text-sm font-semibold truncate transition-colors group-hover:text-primary">
                {documentNumber || title || (documentId && !documentId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ? documentId : null) || 'Untitled Document'}
              </CardTitle>
            </div>
          </div>
        </div>

        {/* Flag and Date */}
        <div className="flex items-center justify-end gap-1 flex-wrap">
          {date && (
            <div className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-all", getDateBadgeBackground())}>
              <Calendar className="h-3.5 w-3.5" />
              <span>{formatDate(date)}</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-4 py-3 flex-1 flex flex-col gap-3">
        {/* Metadata Section */}
        {aiSummary || topics ? (
          <div className="space-y-2">
            {aiSummary && (
              <div className={cn("space-y-2 text-xs rounded-lg p-3 border shadow-sm", getMetadataBackground())}>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    AI Summary
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                  {aiSummary}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className={cn("space-y-2 text-xs rounded-lg p-3 border shadow-sm", getMetadataBackground())}>
            <div className="flex items-center gap-2">
              <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <span className="text-xs font-medium text-foreground">Metadata not available</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed pl-5">
              We're continuously working on improving our features and expanding metadata coverage.
            </p>
          </div>
        )}

        {/* Keywords/Tags */}
        {topics && topics.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Keywords</div>
            <div className="flex flex-wrap gap-1.5 items-start">
              {topics.slice(0, 5).map((topic, index) => (
                <Badge 
                  key={index} 
                  variant="secondary" 
                  className={cn("text-xs px-2.5 py-1 rounded-md border font-medium leading-snug whitespace-normal break-words inline-block transition-all", getKeywordBadgeBackground())}
                  style={{ maxWidth: '100%' }}
                >
                  {topic}
                </Badge>
              ))}
              {topics.length > 5 && (
                <Badge 
                  variant="secondary" 
                  className={cn("text-xs px-2.5 py-1 rounded-md border whitespace-nowrap cursor-pointer transition-all font-medium", getKeywordBadgeBackground())}
                >
                  +{topics.length - 5} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>

      {/* Footer with action buttons */}
      {documentId && (
        <CardFooter className={cn("flex items-center gap-2 px-4 pt-2 pb-2 border-t mt-auto flex-shrink-0", getFooterBackground())}>
          <Button 
            variant="default" 
            size="sm" 
            onClick={handleViewFull}
            className={cn("flex-1 h-8 shadow-lg hover:shadow-xl group/btn transition-all", buttonColors.primary)}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5 group-hover/btn:scale-110 group-hover/btn:rotate-12 transition-all" />
            Open
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
