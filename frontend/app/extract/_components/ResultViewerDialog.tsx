import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ExtractionResult } from "./types";

interface ResultViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedResult: ExtractionResult | null;
}

export function ResultViewerDialog({ open, onOpenChange, selectedResult }: ResultViewerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Extraction Result
          </DialogTitle>
        </DialogHeader>
        {selectedResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Document:</span>
                <span className="ml-2">
                  {selectedResult.documents
                    ? `Case ${selectedResult.documents.volume_number} (${selectedResult.documents.document_date})`
                    : selectedResult.document_id
                  }
                </span>
              </div>
              <div>
                <span className="font-medium">Completed:</span>
                <span className="ml-2">
                  {selectedResult.completed_at
                    ? new Date(selectedResult.completed_at).toLocaleString()
                    : 'N/A'
                  }
                </span>
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Extracted Data:</h4>
              <pre className={cn(
                "p-4 rounded-lg text-sm overflow-auto max-h-96",
                "bg-slate-50/50",
                "border border-slate-200/50"
              )}>
                {JSON.stringify(selectedResult.extracted_data, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
