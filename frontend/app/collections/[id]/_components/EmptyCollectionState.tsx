import { FC } from "react";
import { Plus, FileText, Search } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PrimaryButton, LightCard, VariantButton } from "@/lib/styles/components";

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
            <LightCard
              title={
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Search className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-base font-semibold">Search Documents</span>
                </div>
              }
              padding="lg"
              showBorder={true}
              showShadow={false}
            >
              <div className="mt-3 space-y-4">
                <p className="text-base text-muted-foreground leading-relaxed">Search for legal documents and add them directly from the results page.</p>
                <PrimaryButton
                  size="sm"
                  icon={Search}
                  onClick={onGoToSearch}
                  className="w-full"
                >
                  Go to Search
                </PrimaryButton>
              </div>
            </LightCard>
            <LightCard
              title={
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Plus className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-base font-semibold">Add by ID</span>
                </div>
              }
              padding="lg"
              showBorder={true}
              showShadow={false}
            >
              <div className="mt-3 space-y-4">
                <p className="text-base text-muted-foreground leading-relaxed">Have document IDs? Enter them below to add directly.</p>
                <div className="space-y-3">
                  <Textarea
                    placeholder="Enter document IDs (one per line or comma-separated)"
                    value={newDocumentIds}
                    onChange={(e) => setNewDocumentIds(e.target.value)}
                    rows={3}
                    className="w-full font-mono text-sm resize-none"
                  />
                  <VariantButton
                    intent="glass"
                    onClick={onAddDocuments}
                    disabled={!newDocumentIds.trim() || isAdding}
                    isLoading={isAdding}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4" />
                    Add Documents
                  </VariantButton>
                </div>
              </div>
            </LightCard>
          </div>
        }
      />
    </div>
  );
};

export default EmptyCollectionState;
