import { FC } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BaseCard, VariantButton } from "@/lib/styles/components";

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
  isClosing,
  onSave,
  onCancel,
}) => {
  return (
    <BaseCard
      title="Edit Collection"
      icon={Pencil}
      clickable={false}
      className={cn(
        "rounded-xl p-6",
        isClosing ? "animate-fade-out-down" : "animate-scale-in"
      )}
    >
      <div className="space-y-5 mt-4">
        <div className="space-y-2">
          <Label htmlFor="edit-name" className="text-sm font-semibold">
            Collection Name <span className="text-destructive">*</span>
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
            className="text-lg font-semibold border-slate-200/50 focus:border-primary/30 focus:ring-2 focus:ring-primary/20 hover:border-primary/20 bg-white/80 backdrop-blur-md shadow-lg hover:shadow-xl rounded-xl transition-all duration-300"
            placeholder="Collection name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-description" className="text-sm font-semibold">
            Description (optional)
          </Label>
          <Textarea
            id="edit-description"
            value={editDescription}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditDescription(e.target.value)}
            placeholder="Describe the purpose of this collection, research questions, or scope..."
            rows={4}
            className="border-slate-200/50 focus:border-primary/30 focus:ring-2 focus:ring-primary/20 hover:border-primary/20 bg-white/80 backdrop-blur-md shadow-lg hover:shadow-xl rounded-xl transition-all duration-300 resize-none"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <VariantButton intent="primary" onClick={onSave} size="sm" disabled={!editName.trim()}>
            Save Changes
          </VariantButton>
          <VariantButton intent="secondary" onClick={onCancel} size="sm">
            Cancel
          </VariantButton>
        </div>
      </div>
    </BaseCard>
  );
};

export default EditCollectionForm;
