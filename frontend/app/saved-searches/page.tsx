"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSavedSearchStore } from '@/lib/store/savedSearchStore';
import { useSearchStore } from '@/lib/store/searchStore';
import { PageContainer } from '@/lib/styles/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Bookmark,
  Search,
  MoreVertical,
  Trash2,
  Edit,
  FolderOpen,
  Clock,
  Share2,
  Play,
  Plus,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DocumentType } from '@/types/search';
import type { SavedSearch, SavedSearchConfig } from '@/types/saved-search';

function SavedSearchCard({
  search,
  onExecute,
  onEdit,
  onDelete,
}: {
  search: SavedSearch;
  onExecute: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const config = search.search_config as SavedSearchConfig;
  const filterCount = countFilters(config);

  return (
    <div className="group relative rounded-lg border border-border bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Bookmark className="h-4 w-4 text-primary shrink-0" />
            <h3 className="font-medium text-sm truncate">{search.name}</h3>
            {search.is_shared && (
              <Share2 className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
          </div>

          {search.description && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
              {search.description}
            </p>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            {search.query && (
              <Badge variant="secondary" className="text-xs">
                <Search className="h-3 w-3 mr-1" />
                {search.query.length > 40 ? search.query.slice(0, 40) + '...' : search.query}
              </Badge>
            )}
            {search.search_mode && (
              <Badge variant="outline" className="text-xs">
                {search.search_mode === 'thinking' ? 'AI Enhanced' : 'Fast'}
              </Badge>
            )}
            {search.document_types.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {search.document_types.map(t => t === 'judgment' ? 'Judgments' : 'Documents').join(', ')}
              </Badge>
            )}
            {search.languages.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {search.languages.map(l => l.toUpperCase()).join(', ')}
              </Badge>
            )}
            {filterCount > 0 && (
              <Badge variant="outline" className="text-xs">
                <Filter className="h-3 w-3 mr-1" />
                {filterCount} filter{filterCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            {search.folder && (
              <span className="flex items-center gap-1">
                <FolderOpen className="h-3 w-3" />
                {search.folder}
              </span>
            )}
            {search.last_used_at && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Used {formatRelativeTime(search.last_used_at)}
              </span>
            )}
            {search.use_count > 0 && (
              <span>{search.use_count} use{search.use_count > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onExecute}
            className="h-8 px-3 text-xs"
          >
            <Play className="h-3 w-3 mr-1" />
            Run
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExecute}>
                <Play className="h-4 w-4 mr-2" />
                Run Search
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function countFilters(config: SavedSearchConfig): number {
  if (!config?.filters) return 0;
  const f = config.filters;
  let count = 0;
  if (f.keywords?.length) count++;
  if (f.legalConcepts?.length) count++;
  if (f.documentTypes?.length) count++;
  if (f.issuingBodies?.length) count++;
  if (f.dateFrom || f.dateTo) count++;
  if (f.jurisdictions?.length) count++;
  if (f.courtLevels?.length) count++;
  if (f.legalDomains?.length) count++;
  if (f.customMetadata && Object.keys(f.customMetadata).length > 0) count++;
  return count;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function SavedSearchesPage() {
  const router = useRouter();
  const { searches, isLoading, error, folders, fetchSearches, deleteSearch, recordUsage } = useSavedSearchStore();
  const searchStore = useSearchStore();

  const [filterFolder, setFilterFolder] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SavedSearch | null>(null);
  const [editTarget, setEditTarget] = useState<SavedSearch | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFolder, setEditFolder] = useState('');

  useEffect(() => {
    fetchSearches();
  }, [fetchSearches]);

  const filteredSearches = searches.filter(s => {
    if (filterFolder && s.folder !== filterFolder) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.query.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const executeSearch = (search: SavedSearch) => {
    recordUsage(search.id);

    // Restore search state from saved config
    const config = search.search_config as SavedSearchConfig;

    searchStore.setQuery(search.query);
    if (search.search_mode) {
      searchStore.setSearchType(search.search_mode);
    }
    if (search.languages.length > 0) {
      searchStore.setSelectedLanguages([...search.languages]);
    }
    if (search.document_types.length > 0) {
      const types = search.document_types
        .filter((t): t is DocumentType => Object.values(DocumentType).includes(t as DocumentType));
      if (types.length > 0) {
        searchStore.setDocumentTypes(types);
      }
    }

    // Navigate to search page - the URL params hook will trigger the search
    // Filters are passed via URL params below so the search page can restore them
    const params = new URLSearchParams();
    if (search.query) params.set('q', encodeURIComponent(search.query));
    if (search.search_mode) params.set('mode', search.search_mode);
    if (search.languages.length > 0) params.set('lang', search.languages.join(','));
    if (search.document_types.length > 0) params.set('type', search.document_types.join(','));

    // Add filter params
    if (config.filters) {
      const f = config.filters;
      if (f.keywords?.length) params.set('keywords', f.keywords.join(','));
      if (f.legalConcepts?.length) params.set('legalConcepts', f.legalConcepts.join(','));
      if (f.documentTypes?.length) params.set('filterTypes', f.documentTypes.join(','));
      if (f.issuingBodies?.length) params.set('issuingBodies', f.issuingBodies.join(','));
      if (f.dateFrom) params.set('dateFrom', f.dateFrom);
      if (f.dateTo) params.set('dateTo', f.dateTo);
      if (f.jurisdictions?.length) params.set('jurisdictions', f.jurisdictions.join(','));
      if (f.courtLevels?.length) params.set('courtLevels', f.courtLevels.join(','));
      if (f.legalDomains?.length) params.set('legalDomains', f.legalDomains.join(','));
    }

    router.push(`/search?${params.toString()}`);
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteSearch(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const handleEdit = (search: SavedSearch) => {
    setEditTarget(search);
    setEditName(search.name);
    setEditDescription(search.description || '');
    setEditFolder(search.folder || '');
  };

  const handleSaveEdit = async () => {
    if (editTarget) {
      const { updateSavedSearch } = useSavedSearchStore.getState();
      await updateSavedSearch(editTarget.id, {
        name: editName,
        description: editDescription || null,
        folder: editFolder || null,
      });
      setEditTarget(null);
    }
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Bookmark className="h-6 w-6 text-primary" />
              Saved Searches
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your bookmarked search queries with filters for quick re-execution
            </p>
          </div>
          <Button onClick={() => router.push('/search')} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New Search
          </Button>
        </div>

        {/* Filters Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter saved searches..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {folders.length > 0 && (
            <div className="flex items-center gap-1">
              <Button
                variant={filterFolder === null ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilterFolder(null)}
                className="h-8 text-xs"
              >
                All
              </Button>
              {folders.map(folder => (
                <Button
                  key={folder.id}
                  variant={filterFolder === folder.name ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setFilterFolder(folder.name)}
                  className="h-8 text-xs"
                >
                  <FolderOpen className="h-3 w-3 mr-1" />
                  {folder.name}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={() => fetchSearches()} className="mt-4">
              Try again
            </Button>
          </div>
        ) : filteredSearches.length === 0 ? (
          <div className="text-center py-12">
            <Bookmark className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">No saved searches</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {searchFilter
                ? 'No searches match your filter.'
                : 'Save a search from the search page to access it quickly later.'}
            </p>
            {!searchFilter && (
              <Button variant="outline" size="sm" onClick={() => router.push('/search')} className="mt-4">
                Go to Search
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSearches.map(search => (
              <SavedSearchCard
                key={search.id}
                search={search}
                onExecute={() => executeSearch(search)}
                onEdit={() => handleEdit(search)}
                onDelete={() => setDeleteTarget(search)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved search</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <AlertDialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit saved search</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Search name"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Folder</label>
              <Input
                value={editFolder}
                onChange={(e) => setEditFolder(e.target.value)}
                placeholder="Optional folder name"
                className="mt-1"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveEdit} disabled={!editName.trim()}>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
