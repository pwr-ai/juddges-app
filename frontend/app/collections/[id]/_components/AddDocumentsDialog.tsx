import { FC } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface AddDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newDocumentIds: string;
  setNewDocumentIds: (value: string) => void;
  onAddDocuments: () => void;
  isAdding: boolean;
}

/** Dialog (with trigger button) for adding documents to the collection by ID. */
const AddDocumentsDialog: FC<AddDocumentsDialogProps> = ({
  open,
  onOpenChange,
  newDocumentIds,
  setNewDocumentIds,
  onAddDocuments,
  isAdding,
}) => {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) {
          // Clear input when dialog closes
          setNewDocumentIds("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep font-mono text-xs gap-1.5 h-9 px-4">
          <Plus className="h-4 w-4" />
          Add Documents
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] [&>button:last-child]:hidden rounded-none border-rule bg-parchment">
        <DialogPrimitive.Close asChild>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="absolute top-4 right-4 p-1.5 text-ink-soft hover:text-ink transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogPrimitive.Close>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-semibold text-ink">
            Add Documents to Collection
          </DialogTitle>
          <DialogDescription className="text-xs text-ink-soft leading-relaxed">
            Enter document IDs to add them to this collection. You can add multiple IDs separated by commas, spaces, or new lines.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="document-ids" className="text-xs font-mono text-ink">Document IDs</Label>
            <Textarea
              id="document-ids"
              placeholder="Enter document IDs (one per line, or comma/space separated)&#10;Example:&#10;II FSK 1234/21&#10;II FSK 5678/22&#10;0111-KDIB1-2.4010.123.2023.1.ANK"
              value={newDocumentIds}
              onChange={(e) => setNewDocumentIds(e.target.value)}
              rows={6}
              className="rounded-none border-rule bg-parchment text-ink focus-visible:border-ink font-mono text-xs resize-none"
            />
            {newDocumentIds.trim() && (
              <p className="text-xs font-mono text-ink-soft">
                {newDocumentIds.split(/[\n,\s]+/).filter(id => id.trim().length > 0).length} document ID(s) detected
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNewDocumentIds("");
                onOpenChange(false);
              }}
              className="rounded-none border-rule text-ink font-mono text-xs hover:border-ink hover:bg-parchment-deep"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onAddDocuments}
              disabled={!newDocumentIds.trim() || isAdding}
              className="rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep font-mono text-xs"
            >
              {isAdding ? "Adding..." : "Add Documents"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddDocumentsDialog;
