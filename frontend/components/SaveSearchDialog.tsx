"use client";

import { useState } from 'react';
import { useSearchStore } from '@/lib/store/searchStore';
import { useSavedSearchStore } from '@/lib/store/savedSearchStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Bookmark, Check } from 'lucide-react';
import type { SavedSearchConfig } from '@/types/saved-search';

interface SaveSearchDialogProps {
  trigger?: React.ReactNode;
}

export function SaveSearchDialog({ trigger }: SaveSearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folder, setFolder] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const searchStore = useSearchStore();
  const { createSearch, folders } = useSavedSearchStore();

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsSaving(true);

    // Capture current search state
    const config: SavedSearchConfig = {
      filters: {
        keywords: Array.from(searchStore.filters.keywords),
        legalConcepts: Array.from(searchStore.filters.legalConcepts),
        documentTypes: Array.from(searchStore.filters.documentTypes),
        issuingBodies: Array.from(searchStore.filters.issuingBodies),
        languages: Array.from(searchStore.filters.languages),
        dateFrom: searchStore.filters.dateFrom?.toISOString()?.split('T')[0],
        dateTo: searchStore.filters.dateTo?.toISOString()?.split('T')[0],
        jurisdictions: Array.from(searchStore.filters.jurisdictions),
        courtLevels: Array.from(searchStore.filters.courtLevels),
        legalDomains: Array.from(searchStore.filters.legalDomains),
        customMetadata: searchStore.filters.customMetadata,
      },
      pageSize: searchStore.pageSize,
      ignoreUnknownType: searchStore.ignoreUnknownType,
    };

    const result = await createSearch({
      name: name.trim(),
      description: description.trim() || undefined,
      folder: folder.trim() || undefined,
      query: searchStore.query,
      search_config: config,
      document_types: searchStore.documentTypes,
      languages: Array.from(searchStore.selectedLanguages),
      search_mode: searchStore.searchType,
      is_shared: isShared,
    });

    setIsSaving(false);

    if (result) {
      setSaved(true);
      setTimeout(() => {
        setOpen(false);
        // Reset form after close animation
        setTimeout(() => {
          setName('');
          setDescription('');
          setFolder('');
          setIsShared(false);
          setSaved(false);
        }, 200);
      }, 800);
    }
  };

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-1.5">
      <Bookmark className="h-4 w-4" />
      Save Search
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-primary" />
            Save Search
          </DialogTitle>
          <DialogDescription>
            Bookmark this search query and its filters for quick access later.
          </DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
              <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm font-medium">Search saved!</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-sm font-medium">Name *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={searchStore.query ? `"${searchStore.query.slice(0, 50)}"` : 'My saved search'}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Folder</label>
                <Input
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  placeholder="Optional folder name"
                  className="mt-1"
                  list="saved-search-folders"
                />
                {folders.length > 0 && (
                  <datalist id="saved-search-folders">
                    {folders.map(f => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="share-search"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <label htmlFor="share-search" className="text-sm text-muted-foreground">
                  Share with team members
                </label>
              </div>

              {/* Preview of what will be saved */}
              <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-medium text-muted-foreground">Will save:</p>
                {searchStore.query && <p>Query: &quot;{searchStore.query}&quot;</p>}
                <p>Mode: {searchStore.searchType === 'thinking' ? 'AI Enhanced' : 'Fast'}</p>
                {searchStore.selectedLanguages.size > 0 && (
                  <p>Languages: {Array.from(searchStore.selectedLanguages).map(l => l.toUpperCase()).join(', ')}</p>
                )}
                {searchStore.documentTypes.length > 0 && (
                  <p>Types: {searchStore.documentTypes.join(', ')}</p>
                )}
                {searchStore.getActiveFilterCount() > 0 && (
                  <p>{searchStore.getActiveFilterCount()} active filter(s)</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
                {isSaving ? 'Saving...' : 'Save Search'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
