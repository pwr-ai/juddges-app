/**
 * Save to Collection Popover Component
 * Reusable popover component for saving documents to collections
 * Follows design system styling with popover background and dropdown-styled select
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Search, X, Folder, Plus, Check } from "lucide-react";
import { getCollections, addDocumentToCollection, createCollection } from "@/lib/api/collections";
import { CollectionWithDocuments } from "@/types/collection";
import { SearchDocument } from "@/types/search";
import { SecondaryButton, showSuccessToast } from "@/lib/styles/components";
import { ModalSaveButton } from "@/lib/styles/components/modal-save-button";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

export interface SaveToCollectionPopoverProps {
  /** Documents to save */
  documents?: SearchDocument[];
  /** Whether all search results are being saved */
  isAllResults?: boolean;
  /** Callback when popover is closed */
  onClose?: () => void;
  /** Custom navigation handler */
  onNavigate?: (collectionId: string, action: 'view' | 'extract') => void;
  /** Optional className for the container */
  className?: string;
  /** Callback to clear selection after successful save (for selected documents only) */
  onClearSelection?: () => void;
}

/**
 * Save to Collection Popover Component
 *
 * A reusable popover component for saving documents to collections.
 * Uses popover-style background (not card style) and dropdown-styled select.
 *
 * @example
 * ```tsx
 * <SaveToCollectionPopover
 *   documents={[document]}
 *   onClose={() => setIsOpen(false)}
 * />
 * ```
 *
 * @example
 * ```tsx
 * <SaveToCollectionPopover
 *   documents={documents}
 *   isAllResults={true}
 *   onNavigate={(collectionId, action) => {
 *     if (action === 'view') {
 *       router.push(`/collections/${collectionId}`);
 *     }
 *   }}
 * />
 * ```
 */
export function SaveToCollectionPopover({
  documents = [],
  isAllResults = false,
  onClose,
  onNavigate,
  className,
  onClearSelection,
}: SaveToCollectionPopoverProps): React.JSX.Element {
  const router = useRouter();
  const [collections, setCollections] = useState<CollectionWithDocuments[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCollection, setSelectedCollection] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const fetchCollections = async (): Promise<void> => {
      try {
        const collections = await getCollections();
        setCollections(collections);
        if (collections.length > 0) {
          setSelectedCollection(collections[0].id);
        }
      } catch (error) {
        toast.error(`Failed to fetch collections: ${error}`);
      } finally {
        setLoading(false);
      }
    };

    fetchCollections();
  }, []);

  const handleNavigate = (action: 'view' | 'extract'): void => {
    if (onNavigate) {
      onNavigate(selectedCollection, action);
    } else {
      if (action === 'view') {
        router.push(`/collections/${selectedCollection}`);
        router.refresh(); // Force refresh to show newly added documents
      } else {
        router.push(`/extract?collection=${selectedCollection}`);
      }
    }
    onClose?.();
  };

  const handleSave = async (): Promise<void> => {
    if (!selectedCollection) {
      toast.error("Please select a collection");
      return;
    }

    if (documents.length === 0) {
      toast.error("No documents to save");
      return;
    }

    setSaving(true);
    try {
      // Track successful saves
      let successCount = 0;

      // Save all documents passed in (whether selected or all results)
      const docsToSave = documents;

      // Use Promise.all for better performance
      const results = await Promise.allSettled(
        docsToSave.map(doc => addDocumentToCollection(selectedCollection, doc))
      );

      // Count successful operations
      successCount = results.filter(result => result.status === 'fulfilled').length;

      if (successCount > 0) {
        // Clear selection if this is for selected documents (not all results)
        if (!isAllResults) {
          onClearSelection?.();
        }

        showSuccessToast({
          title: "Success",
          description: `${successCount} document${successCount > 1 ? 's' : ''} saved to collection`,
          primaryAction: {
            label: "View Collection",
            onClick: () => handleNavigate('view'),
          },
          secondaryAction: {
            label: "Start Extraction",
            onClick: () => handleNavigate('extract'),
          },
        });
        onClose?.();
      } else {
        toast.error("Failed to save any documents");
      }
    } catch (error) {
      logger.error("Error saving to collection: ", error);
      toast.error("Failed to save document(s) to collection");
    } finally {
      setSaving(false);
    }
  };

  // Filter collections based on search query
  const filteredCollections = collections.filter(collection =>
    collection.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateNewCollection = async (): Promise<void> => {
    if (!newCollectionName.trim()) {
      toast.error("Collection name is required");
      return;
    }

    if (documents.length === 0) {
      toast.error("No documents to save");
      return;
    }

    setIsCreating(true);
    try {
      // Create the new collection
      const newCollection = await createCollection({
        name: newCollectionName.trim(),
      });

      // Add to collections list
      const collectionWithDocuments: CollectionWithDocuments = {
        ...newCollection,
        documents: [],
      };

      setCollections([...collections, collectionWithDocuments]);
      setSelectedCollection(newCollection.id);
      setNewCollectionName("");
      setIsCreatingNew(false);

      // Automatically add documents to the newly created collection
      // Save all documents passed in (whether selected or all results) - consistent with handleSave
      let successCount = 0;
      const docsToSave = documents;

      // Use Promise.all for better performance
      const results = await Promise.allSettled(
        docsToSave.map(doc => addDocumentToCollection(newCollection.id, doc))
      );

      // Count successful operations
      successCount = results.filter(result => result.status === 'fulfilled').length;

      if (successCount > 0) {
        // Clear selection if this is for selected documents (not all results)
        if (!isAllResults) {
          onClearSelection?.();
        }

        showSuccessToast({
          title: "Success",
          description: `Collection created and ${successCount} document${successCount > 1 ? 's' : ''} saved`,
          primaryAction: {
            label: "View Collection",
            onClick: () => {
              if (onNavigate) {
                onNavigate(newCollection.id, 'view');
              } else {
                router.push(`/collections/${newCollection.id}`);
                router.refresh();
              }
              onClose?.();
            },
          },
          secondaryAction: {
            label: "Start Extraction",
            onClick: () => {
              if (onNavigate) {
                onNavigate(newCollection.id, 'extract');
              } else {
                router.push(`/extract?collection=${newCollection.id}`);
              }
              onClose?.();
            },
          },
        });
        onClose?.();
      } else {
        // Collection was created but documents failed to save
        toast.warning("Collection created but failed to save documents");
      }
    } catch (error) {
      logger.error("Error creating collection: ", error);
      toast.error("Failed to create collection");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className={cn(
        // I. The Glass Pane - Compact width, 24px corner radius
        "w-[360px] rounded-3xl",
        // High Opacity Porcelain with 24px blur
        "bg-[rgba(255,255,255,0.90)] backdrop-blur-[24px]",
        // Border and Shadow
        "border border-white",
        "shadow-[0_20px_60px_-10px_rgba(0,0,0,0.2)]",
        // Padding - More compact
        "p-4",
        className
      )}
      role="dialog"
      aria-label="Save documents to collection"
    >
      {/* II. The Header */}
      <div className="relative flex items-center justify-between mb-4">
        <h3 className="text-[18px] font-semibold text-[#0F172A]">
          {isAllResults ? `Save ${documents.length} documents to Registry` : "Save to Registry"}
        </h3>
        {/* Close Button - Glass Circle */}
        <button
          onClick={onClose}
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center",
            "transition-all duration-200",
            "bg-transparent text-[#64748B]",
            "hover:bg-slate-100 hover:text-red-500"
          )}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8" aria-busy="true" aria-label="Loading collections">
          <Loader2 className="h-5 w-5 animate-spin text-[#2563EB]" />
        </div>
      ) : collections.length === 0 ? (
        <p className="text-sm text-[#64748B] mb-3">
          No collections available. Create one in the Collections section.
        </p>
      ) : (
        <>
          {/* III. The Search Input - Inset Console */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search collections..."
              className={cn(
                "w-full h-10 pl-10 pr-4 rounded-[10px]",
                "bg-[rgba(0,0,0,0.04)]",
                "border border-[rgba(0,0,0,0.05)]",
                "text-sm text-[#475569]",
                "transition-all duration-200",
                "focus:outline-none focus:border-[#3B82F6] focus:bg-white",
                "placeholder:text-[#94A3B8]"
              )}
            />
          </div>

          {/* IV. The Collection List - Interactive Rows */}
          <div className="space-y-1 mb-4 max-h-[280px] overflow-y-auto">
            {/* Existing Collections */}
            {filteredCollections.map((collection) => {
              const isSelected = selectedCollection === collection.id;
              return (
                <button
                  key={collection.id}
                  onClick={() => setSelectedCollection(collection.id)}
                  className={cn(
                    "w-full h-11 px-4 rounded-lg flex items-center justify-between",
                    "transition-all duration-200",
                    // Idle state
                    !isSelected && "text-[#475569] hover:bg-[rgba(0,0,0,0.02)]",
                    // Selected state - Blue Tint
                    isSelected && "bg-[rgba(37,99,235,0.08)] text-[#1E40AF]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Folder className="h-4 w-4 text-[#94A3B8]" />
                    <span className="text-sm font-medium">{collection.name}</span>
                  </div>
                  {isSelected && (
                    <Check className="h-4 w-4 text-[#1E40AF]" />
                  )}
                </button>
              );
            })}

            {/* Create New Row - Inline Form (Moved to Bottom) */}
            {!isCreatingNew ? (
              <button
                onClick={() => setIsCreatingNew(true)}
                className={cn(
                  "w-full h-11 px-4 rounded-lg flex items-center gap-3",
                  "border border-dashed border-[#CBD5E1]",
                  "bg-transparent text-[#2563EB]",
                  "transition-all duration-200",
                  "hover:bg-[rgba(37,99,235,0.05)] hover:border-[#3B82F6] hover:border-solid"
                )}
              >
                <Plus className="h-4 w-4" />
                <span className="text-sm font-medium">Create New Collection</span>
              </button>
            ) : (
              <div className="w-full">
                {/* Inset Console Input - Carved into glass */}
                <div className="relative flex items-center gap-2">
                  <input
                    type="text"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateNewCollection();
                      } else if (e.key === 'Escape') {
                        setIsCreatingNew(false);
                        setNewCollectionName("");
                      }
                    }}
                    placeholder="Collection name..."
                    autoFocus
                    className={cn(
                      "flex-1 h-11 px-4",
                      "bg-[rgba(0,0,0,0.04)]",
                      "border border-[rgba(0,0,0,0.05)]",
                      "text-sm text-[#0F172A]",
                      "placeholder:text-[#94A3B8]",
                      "transition-all duration-200",
                      "focus:outline-none focus:bg-white focus:border-[#3B82F6]",
                      "focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)]",
                      "rounded-xl"
                    )}
                    style={{
                      boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.06)',
                    }}
                  />
                  <button
                    onClick={handleCreateNewCollection}
                    disabled={!newCollectionName.trim() || isCreating}
                    className={cn(
                      "h-11 px-4 rounded-xl",
                      "bg-[#3B82F6] text-white text-sm font-semibold",
                      "border-none cursor-pointer",
                      "hover:bg-[#2563EB]",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "transition-colors",
                      "flex items-center justify-center gap-1.5",
                      "whitespace-nowrap"
                    )}
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Adding...</span>
                      </>
                    ) : (
                      "Add"
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-end gap-2 mt-2">
                  <button
                    onClick={() => {
                      setIsCreatingNew(false);
                      setNewCollectionName("");
                    }}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-lg",
                      "text-[#64748B] hover:text-[#475569]",
                      "hover:bg-[rgba(0,0,0,0.02)]",
                      "transition-colors"
                    )}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* V. The Footer - Primary Action */}
          <div className="flex justify-end gap-2 pt-3 border-t border-[rgba(0,0,0,0.05)]">
            <SecondaryButton
              size="sm"
              onClick={onClose}
              className="h-11 px-6"
              aria-label="Cancel saving to collection"
            >
              Cancel
            </SecondaryButton>
            <ModalSaveButton
              onClick={handleSave}
              disabled={saving || documents.length === 0 || !selectedCollection}
              isLoading={saving}
              aria-label={`Save ${documents.length} document${documents.length !== 1 ? 's' : ''} to collection`}
            >
              Save
            </ModalSaveButton>
          </div>
        </>
      )}
    </div>
  );
}
