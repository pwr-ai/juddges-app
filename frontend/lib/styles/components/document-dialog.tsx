/**
 * Document Dialog Component
 * Dialog for displaying full document text with highlighted chunks
 * Used in search results to show document details
 */

"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/lib/styles/components";
import { SearchDocument, SearchChunk } from "@/types/search";
import { HighlightedText } from "./highlighted-text";

// Helper function
const formatDate = (dateString: string): string => !dateString ? "": dateString.split("")[0];

export interface DocumentDialogProps {
 isOpen: boolean;
 onClose: (val: boolean) => void;
 document: SearchDocument | null;
 chunks: SearchChunk[];
}

export const DocumentDialog = ({ isOpen, onClose, document, chunks }: DocumentDialogProps): React.JSX.Element => (
 <Dialog open={isOpen} onOpenChange={onClose}>
 <DialogContent className="min-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
 {document && (
 <>
 <DialogHeader>
 <DialogTitle className="text-lg flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span>
 Case {document.document_number || document.document_id}
 {document.date_issued && ` (${formatDate(document.date_issued)})`}
 </span>
 {/* Polish flag */}
 <span className="inline-block"title="Poland">
 🇵🇱
 </span>
 </div>

 {document.legal_references && document.legal_references.length > 0 && (
 <div className="flex flex-wrap gap-1">
 {document.legal_references.map((ref, idx) => (
 <Badge key={idx} className="text-xs font-normal">{ref.text}</Badge>
 ))}
 </div>
 )}
 </DialogTitle>
 </DialogHeader>

 <div className="overflow-y-auto flex-1 p-4 mt-2 bg-slate-50 text-sm rounded">
 <HighlightedText text={document.full_text || ""} chunks={chunks} />
 </div>
 </>
 )}
 </DialogContent>
 </Dialog>
);
