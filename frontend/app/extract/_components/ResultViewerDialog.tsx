import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExtractionResult } from "./types";

interface ResultViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedResult: ExtractionResult | null;
}

export function ResultViewerDialog({ open, onOpenChange, selectedResult }: ResultViewerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-parchment border border-rule rounded-none shadow-lg p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-ink text-lg">
            <Eye className="h-5 w-5 text-oxblood" />
            Extraction Result
          </DialogTitle>
        </DialogHeader>
        {selectedResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-ink-soft">Document:</span>
                <span className="ml-2 font-mono text-xs text-ink">
                  {selectedResult.documents
                    ? `Case ${selectedResult.documents.volume_number} (${selectedResult.documents.document_date})`
                    : selectedResult.document_id
                  }
                </span>
              </div>
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-ink-soft">Completed:</span>
                <span className="ml-2 font-mono text-xs text-ink">
                  {selectedResult.completed_at
                    ? new Date(selectedResult.completed_at).toLocaleString()
                    : 'N/A'
                  }
                </span>
              </div>
            </div>
            <div>
              <h4 className="font-mono text-xs uppercase tracking-wider text-ink-soft mb-2">Extracted Data</h4>
              <pre className="p-4 rounded-none text-sm font-mono overflow-auto max-h-96 bg-parchment-deep border border-rule text-ink">
                {JSON.stringify(selectedResult.extracted_data, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
