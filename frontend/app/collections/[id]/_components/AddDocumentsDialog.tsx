import { FC } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VariantButton } from "@/lib/styles/components";

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
        <VariantButton
          intent="glass"
          className="w-auto shrink-0 h-9 px-6"
        >
          <Plus className="h-4 w-4" />
          Add Documents
        </VariantButton>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] [&>button:last-child]:hidden">
        <DialogPrimitive.Close asChild>
          <VariantButton intent="icon"
            icon={X}
            onClick={() => {}}
            variant="muted"
            size="md"
            aria-label="Close"
            className="absolute top-4 right-4 z-50 !h-10 !w-10 !p-2"
          />
        </DialogPrimitive.Close>
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-br from-foreground via-primary to-primary bg-clip-text text-transparent">
            Add Documents to Collection
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            Enter document IDs to add them to this collection. You can add multiple IDs separated by commas, spaces, or new lines.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="document-ids">Document IDs</Label>
            <Textarea
              id="document-ids"
              placeholder="Enter document IDs (one per line, or comma/space separated)&#10;Example:&#10;II FSK 1234/21&#10;II FSK 5678/22&#10;0111-KDIB1-2.4010.123.2023.1.ANK"
              value={newDocumentIds}
              onChange={(e) => setNewDocumentIds(e.target.value)}
              rows={6}
              className="border-slate-200/50 focus:border-primary/30 focus:ring-2 focus:ring-primary/20 hover:border-primary/20 bg-white/80 backdrop-blur-md shadow-lg hover:shadow-xl rounded-xl transition-all duration-300 resize-none font-mono text-sm"
            />
            {newDocumentIds.trim() && (
              <p className="text-xs text-muted-foreground">
                {newDocumentIds.split(/[\n,\s]+/).filter(id => id.trim().length > 0).length} document ID(s) detected
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <VariantButton intent="secondary"
              onClick={() => {
                setNewDocumentIds("");
                onOpenChange(false);
              }}
              size="sm"
            >
              Cancel
            </VariantButton>
            <VariantButton
              intent="glass"
              onClick={onAddDocuments}
              disabled={!newDocumentIds.trim() || isAdding}
              isLoading={isAdding}
              className="w-auto shrink-0 h-9 px-6"
            >
              Add Documents
            </VariantButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddDocumentsDialog;
