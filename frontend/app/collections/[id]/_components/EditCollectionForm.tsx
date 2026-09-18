import { FC } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { EditorialCard } from "@/components/editorial";

interface EditCollectionFormProps {
  editName: string;
  setEditName: (value: string) => void;
  editDescription: string;
  setEditDescription: (value: string) => void;
  isClosing: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/** Inline editing card for a collection's name and description. */
const EditCollectionForm: FC<EditCollectionFormProps> = ({
  editName,
  setEditName,
  editDescription,
  setEditDescription,
  isClosing: _isClosing,
  onSave,
  onCancel,
}) => {
  return (
    <EditorialCard flat className="p-6 border-rule mb-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-rule">
        <Pencil className="h-4 w-4 text-oxblood" />
        <h3 className="font-serif text-lg font-semibold text-ink">Edit Collection</h3>
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit-name" className="text-xs font-mono text-ink">
            Collection Name <span className="text-oxblood">*</span>
            <span className="sr-only"> (required)</span>
          </Label>
          <Input
            id="edit-name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && editName.trim()) {
                onSave();
              }
            }}
            className="rounded-none border-rule bg-parchment text-ink focus-visible:border-ink font-sans text-sm"
            placeholder="Collection name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-description" className="text-xs font-mono text-ink">
            Description (optional)
          </Label>
          <Textarea
            id="edit-description"
            value={editDescription}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditDescription(e.target.value)}
            placeholder="Describe the purpose of this collection, research questions, or scope..."
            rows={3}
            className="rounded-none border-rule bg-parchment text-ink focus-visible:border-ink font-sans text-sm resize-none"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            onClick={onSave}
            disabled={!editName.trim()}
            className="rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep font-mono text-xs"
          >
            Save Changes
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="rounded-none border-rule text-ink font-mono text-xs hover:border-ink hover:bg-parchment-deep"
          >
            Cancel
          </Button>
        </div>
      </div>
    </EditorialCard>
  );
};

export default EditCollectionForm;
