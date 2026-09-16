import { FC } from "react";
import { Plus, FileText, Search } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/lib/styles/components";
import { EditorialCard } from "@/components/editorial";

interface EmptyCollectionStateProps {
  newDocumentIds: string;
  setNewDocumentIds: (value: string) => void;
  onAddDocuments: () => void;
  isAdding: boolean;
  onGoToSearch: () => void;
}

/** Empty-state shown when the collection has no documents, with search + add-by-ID tips. */
const EmptyCollectionState: FC<EmptyCollectionStateProps> = ({
  newDocumentIds,
  setNewDocumentIds,
  onAddDocuments,
  isAdding,
  onGoToSearch,
}) => {
  return (
    <div className="col-span-full">
      <EmptyState
        icon={FileText}
        title="Empty Collection"
        description="Start building your research collection by adding relevant legal documents."
        tipPosition="below"
        tip={
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
            <EditorialCard flat className="p-6 border-rule">
              <div className="flex items-center gap-2.5 mb-3">
                <Search className="h-5 w-5 text-oxblood shrink-0" />
                <span className="font-serif text-base font-semibold text-ink">Search Documents</span>
              </div>
              <div className="space-y-4">
                <p className="text-xs text-ink-soft leading-relaxed">
                  Search for legal documents and add them directly from the results page.
                </p>
                <Button
                  size="sm"
                  onClick={onGoToSearch}
                  className="w-full rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep font-mono text-xs gap-1.5"
                >
                  <Search className="h-3.5 w-3.5" />
                  Go to Search
                </Button>
              </div>
            </EditorialCard>

            <EditorialCard flat className="p-6 border-rule">
              <div className="flex items-center gap-2.5 mb-3">
                <Plus className="h-5 w-5 text-oxblood shrink-0" />
                <span className="font-serif text-base font-semibold text-ink">Add by ID</span>
              </div>
              <div className="space-y-4">
                <p className="text-xs text-ink-soft leading-relaxed">
                  Have document IDs? Enter them below to add directly.
                </p>
                <div className="space-y-3">
                  <Textarea
                    placeholder="Enter document IDs (one per line or comma-separated)"
                    value={newDocumentIds}
                    onChange={(e) => setNewDocumentIds(e.target.value)}
                    rows={3}
                    className="w-full font-mono text-xs resize-none rounded-none border-rule bg-parchment text-ink focus-visible:border-ink"
                  />
                  <Button
                    size="sm"
                    onClick={onAddDocuments}
                    disabled={!newDocumentIds.trim() || isAdding}
                    className="w-full rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep font-mono text-xs gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {isAdding ? "Adding..." : "Add Documents"}
                  </Button>
                </div>
              </div>
            </EditorialCard>
          </div>
        }
      />
    </div>
  );
};

export default EmptyCollectionState;
