'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ExtractionSchema } from '@/types/extraction_schemas';
import { GlassTabs, GlassTabsContent, GlassTabsList, GlassTabsTrigger } from '@/lib/styles/components';
import { toast } from 'sonner';
import { FileJson, Plus, ArrowUpDown, X } from 'lucide-react';
import {
  PageContainer,
  SecondaryButton,
  LoadingIndicator,
  EmptyState,
  ErrorCard,
  SchemaCard,
  SchemaFilters,
  SchemaActionsBar,
  FilterState,
  Pagination,
  ViewModeToggle,
  DropdownButton,
  Badge,
} from '@/lib/styles/components';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type TabValue = 'all' | 'my-schemas' | 'public-schemas';
type ViewMode = 'list' | 'grid';
type SortBy = 'title' | 'created_at' | 'updated_at';

// Helper function to extract username from email
function getUsernameFromEmail(email: string | undefined): string {
  if (!email) return 'Unknown';
  const parts = email.split('@');
  return parts[0] || 'Unknown';
}

// Helper function to format date compactly
function formatDateCompact(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export default function SchemasPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [schemas, setSchemas] = useState<ExtractionSchema[]>([]);
  const [allSchemas, setAllSchemas] = useState<ExtractionSchema[]>([]); // All schemas for filtering
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('updated_at');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [filters, setFilters] = useState<FilterState>({
    title: '',
    creator: '__all__',
    isVerified: null,
    minFields: '',
    maxFields: '',
    minExtractions: '',
    maxExtractions: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Track changes for animation key
  const animationKeyRef = useRef(0);
  const prevActiveTabRef = useRef<TabValue>(activeTab);
  const prevFiltersRef = useRef<FilterState>(filters);
  const prevViewModeRef = useRef<ViewMode>(viewMode);
  
  // Update animation key when tab, filters, or view mode changes
  useEffect(() => {
    const tabChanged = prevActiveTabRef.current !== activeTab;
    const filtersChanged = JSON.stringify(prevFiltersRef.current) !== JSON.stringify(filters);
    const viewModeChanged = prevViewModeRef.current !== viewMode;
    
    if (tabChanged || filtersChanged || viewModeChanged) {
      animationKeyRef.current += 1;
      prevActiveTabRef.current = activeTab;
      prevFiltersRef.current = filters;
      prevViewModeRef.current = viewMode;
    }
  }, [activeTab, filters, viewMode]);

  // Fetch schemas
  const fetchSchemas = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/schemas`);
      if (!response.ok) throw new Error('Failed to fetch schemas');
      const schemasData = await response.json();
      
      // Handle both array and paginated response formats
      const schemas = Array.isArray(schemasData) ? schemasData : (schemasData.data || []);
      setAllSchemas(schemas);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred');
      toast.error("Failed to fetch schemas");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/schemas/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      // Stats are optional, so we don't show error toast
      console.error('Failed to fetch schema stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchSchemas();
    fetchStats();
  }, [fetchSchemas, fetchStats]);


  // Calculate field count helper
  const getFieldCount = (schema: ExtractionSchema): number => {
    if (schema.field_count !== undefined && schema.field_count > 0) {
      return schema.field_count;
    }
    try {
      if (schema.text && typeof schema.text === 'object') {
        if ('properties' in schema.text && typeof schema.text.properties === 'object' && schema.text.properties !== null) {
          const props = schema.text.properties as Record<string, unknown>;
          return Object.keys(props).length;
        }
        if (!('type' in schema.text) && !('$schema' in schema.text)) {
          return Object.keys(schema.text).length;
        }
      }
    } catch (error) {
      console.warn('Failed to calculate field count:', error);
    }
    return 0;
  };

  // Filter schemas based on active tab and filters
  const filteredSchemas = useMemo(() => {
    let filtered = [...allSchemas];

    // Apply tab filter
    switch (activeTab) {
      case 'my-schemas':
        filtered = filtered.filter((s) => user && s.user_id === user.id);
        break;
      case 'public-schemas':
        filtered = filtered.filter(
          (s) => s.status === 'published' && user && s.user_id !== user.id
        );
        break;
      case 'all':
      default:
        // Show all schemas
        break;
    }

    // Apply title filter
    if (filters.title.trim()) {
      const titleLower = filters.title.toLowerCase();
      filtered = filtered.filter((s) =>
        s.name.toLowerCase().includes(titleLower) ||
        (s.description && s.description.toLowerCase().includes(titleLower))
      );
    }

    // Apply creator filter
    if (filters.creator && filters.creator !== '__all__') {
      filtered = filtered.filter((s) => s.user?.email === filters.creator);
    }

    // Apply verified filter
    if (filters.isVerified !== null) {
      filtered = filtered.filter((s) => s.is_verified === filters.isVerified);
    }

    // Apply field count filters
    if (filters.minFields) {
      const minFields = parseInt(filters.minFields, 10);
      if (!isNaN(minFields)) {
        filtered = filtered.filter((s) => getFieldCount(s) >= minFields);
      }
    }
    if (filters.maxFields) {
      const maxFields = parseInt(filters.maxFields, 10);
      if (!isNaN(maxFields)) {
        filtered = filtered.filter((s) => getFieldCount(s) <= maxFields);
      }
    }

    // Apply extraction count filters
    if (filters.minExtractions) {
      const minExtractions = parseInt(filters.minExtractions, 10);
      if (!isNaN(minExtractions)) {
        filtered = filtered.filter((s) => (stats[s.id] || 0) >= minExtractions);
      }
    }
    if (filters.maxExtractions) {
      const maxExtractions = parseInt(filters.maxExtractions, 10);
      if (!isNaN(maxExtractions)) {
        filtered = filtered.filter((s) => (stats[s.id] || 0) <= maxExtractions);
      }
    }

    // Sort: verified first, then by selected sort option
    filtered.sort((a, b) => {
      // Always put verified schemas first
      if (a.is_verified && !b.is_verified) return -1;
      if (!a.is_verified && b.is_verified) return 1;
      
      // Then sort by selected option
      switch (sortBy) {
        case 'title':
          return a.name.localeCompare(b.name);
        case 'created_at':
          const createdA = new Date(a.created_at).getTime();
          const createdB = new Date(b.created_at).getTime();
          return createdB - createdA; // Newest first
        case 'updated_at':
        default:
          const updatedA = new Date(a.updated_at).getTime();
          const updatedB = new Date(b.updated_at).getTime();
          return updatedB - updatedA; // Newest first
      }
    });

    return filtered;
  }, [allSchemas, activeTab, user, filters, stats, sortBy]);

  // Paginate filtered schemas
  const paginatedSchemas = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredSchemas.slice(startIndex, endIndex);
  }, [filteredSchemas, currentPage, pageSize]);

  // Calculate total pages for filtered results
  const totalPages = useMemo(() => {
    return Math.ceil(filteredSchemas.length / pageSize) || 1;
  }, [filteredSchemas.length, pageSize]);


  // Reset to page 1 when filters or sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, activeTab, sortBy]);

  // Scroll to top of page when page changes
  useEffect(() => {
    window.scrollTo({ 
      top: 0, 
      behavior: 'smooth' 
    });
  }, [currentPage, pageSize]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      filters.title.trim() !== '' ||
      (filters.creator !== '__all__' && filters.creator !== '') ||
      filters.isVerified !== null ||
      filters.minFields !== '' ||
      filters.maxFields !== '' ||
      filters.minExtractions !== '' ||
      filters.maxExtractions !== ''
    );
  }, [filters]);

  // Sort change handler
  const onSortChange = (value: SortBy) => {
    setSortBy(value);
  };

  // Helper to remove individual filters
  const removeFilter = (filterType: keyof FilterState | 'fields' | 'extractions') => {
    if (filterType === 'fields') {
      setFilters({ ...filters, minFields: '', maxFields: '' });
    } else if (filterType === 'extractions') {
      setFilters({ ...filters, minExtractions: '', maxExtractions: '' });
    } else {
      const defaultValues: Record<keyof FilterState, string | boolean | null> = {
        title: '',
        creator: '__all__',
        isVerified: null,
        minFields: '',
        maxFields: '',
        minExtractions: '',
        maxExtractions: '',
      };
      setFilters({ ...filters, [filterType]: defaultValues[filterType] });
    }
  };

  if (loading) {
    return (
      <PageContainer fillViewport className="flex items-center justify-center">
        <LoadingIndicator
          message="Loading schemas..."
          subtitle="Fetching extraction schemas"
          subtitleIcon={FileJson}
          variant="centered"
          size="lg"
        />
      </PageContainer>
    );
  }

  if (errorMessage) {
    return (
      <PageContainer fillViewport className="flex items-center justify-center">
        <ErrorCard
          title="Failed to Load Schemas"
          message={errorMessage}
          onRetry={fetchSchemas}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer fillViewport width="wide">
      <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 4rem - 4rem)' }}>
        {/* Main Content */}
        <div className="w-full flex-1 flex flex-col min-h-0">
          {/* Actions Bar - Moved to top */}
          <div className="relative shrink-0">
            <SchemaActionsBar
              searchValue={filters.title}
              onSearchChange={(value) => setFilters({ ...filters, title: value })}
              onAddSchema={() => router.push('/schema-chat')}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters(!showFilters)}
            />
            
            {/* Floating Filters Panel - Positioned next to Show Filters button */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  key="filters-panel"
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="absolute top-full right-0 mt-2 z-50 w-80 xl:w-96"
                  style={{
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  }}
                >
                  <SchemaFilters
                    filters={filters}
                    onFiltersChange={setFilters}
                    schemas={allSchemas}
                    disableAnimation={true}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Tabs and Pagination Container - Flex layout to keep pagination at bottom */}
          <div className="flex flex-col flex-1 min-h-0 mt-0.5">
            <GlassTabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)} className="w-full mb-2 flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-3 mb-3 flex-nowrap">
                {/* Status info - First */}
                <div className="text-sm text-muted-foreground whitespace-nowrap shrink-0 min-w-[140px]">
                  {filteredSchemas.length > 0 && (
                    <>
                      Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredSchemas.length)} of {filteredSchemas.length}
                      {hasActiveFilters && ' filtered'}
                    </>
                  )}
                  {filteredSchemas.length === 0 && (
                    <>No schemas found{hasActiveFilters && ' (filtered)'}</>
                  )}
                </div>
                
                {/* Tabs - Second, with flex-1 to push it slightly left */}
                <div className="flex-1 flex justify-center">
                  <GlassTabsList className="grid grid-cols-3 w-fit shrink-0">
                    <GlassTabsTrigger value="all">All</GlassTabsTrigger>
                    <GlassTabsTrigger value="my-schemas">My Schemas</GlassTabsTrigger>
                    <GlassTabsTrigger value="public-schemas">Public</GlassTabsTrigger>
                  </GlassTabsList>
                </div>

                {/* Sort and View controls - Third */}
                <div className="flex items-center gap-2 flex-nowrap shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">View:</span>
                    <ViewModeToggle
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Sort:</span>
                    <DropdownButton
                      icon={<ArrowUpDown size={16} />}
                      label="Sort by"
                      value={sortBy}
                      options={[
                        { value: 'title', label: 'Title (A-Z)' },
                        { value: 'created_at', label: 'Creation Date' },
                        { value: 'updated_at', label: 'Update Date' },
                      ]}
                      onChange={(value) => onSortChange(value as SortBy)}
                    />
                  </div>
                </div>
              </div>

              <GlassTabsContent value="all" className="mt-0 flex-1 min-h-0">
              {/* Active Filters Row */}
              {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {filters.creator !== '__all__' && filters.creator !== '' && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-slate-300/80 dark:hover:bg-slate-700/80 transition-colors"
                      onClick={() => removeFilter('creator')}
                    >
                      <span>Author: {filters.creator}</span>
                      <X className="h-3 w-3" />
                    </Badge>
                  )}
                  {filters.isVerified !== null && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-slate-300/80 dark:hover:bg-slate-700/80 transition-colors"
                      onClick={() => removeFilter('isVerified')}
                    >
                      <span>{filters.isVerified ? 'Verified' : 'Unverified'}</span>
                      <X className="h-3 w-3" />
                    </Badge>
                  )}
                  {(filters.minFields !== '' || filters.maxFields !== '') && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-slate-300/80 dark:hover:bg-slate-700/80 transition-colors"
                      onClick={() => removeFilter('fields')}
                    >
                      <span>
                        Fields: {filters.minFields || '0'}-{filters.maxFields || '∞'}
                      </span>
                      <X className="h-3 w-3" />
                    </Badge>
                  )}
                  {(filters.minExtractions !== '' || filters.maxExtractions !== '') && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-slate-300/80 dark:hover:bg-slate-700/80 transition-colors"
                      onClick={() => removeFilter('extractions')}
                    >
                      <span>
                        Extractions: {filters.minExtractions || '0'}-{filters.maxExtractions || '∞'}
                      </span>
                      <X className="h-3 w-3" />
                    </Badge>
                  )}
                </div>
              )}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`all-${activeTab}-${animationKeyRef.current}-${viewMode}`}
                  initial={{ opacity: 0, y: 10, filter: "blur(2px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(2px)" }}
                  transition={{
                    duration: 0.4,
                    ease: "easeOut"
                  }}
                >
                  {filteredSchemas.length === 0 ? (
                    <EmptyState
                      title="No Schemas Found"
                      description="Get started by creating your first extraction schema"
                      icon={FileJson}
                      variant="default"
                      primaryAction={{
                        label: "Add Schema",
                        onClick: () => router.push('/schema-chat'),
                        icon: Plus,
                      }}
                    />
                  ) : (
                    <div className={viewMode === 'grid' 
                      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                      : "space-y-4"
                    }>
                      {paginatedSchemas.map((schema) => (
                        <SchemaCard
                          key={schema.id}
                          schema={schema}
                          viewMode={viewMode}
                          extractionCount={stats[schema.id] || 0}
                          onClick={() => router.push(`/schemas/${schema.id}`)}
                          currentUserId={user?.id}
                          onDelete={fetchSchemas}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </GlassTabsContent>

            <GlassTabsContent value="my-schemas" className="mt-0">
              {/* Active Filters Row */}
              {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {filters.creator !== '__all__' && filters.creator !== '' && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-slate-300/80 dark:hover:bg-slate-700/80 transition-colors"
                      onClick={() => removeFilter('creator')}
                    >
                      <span>Author: {filters.creator}</span>
                      <X className="h-3 w-3" />
                    </Badge>
                  )}
                  {filters.isVerified !== null && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-slate-300/80 dark:hover:bg-slate-700/80 transition-colors"
                      onClick={() => removeFilter('isVerified')}
                    >
                      <span>{filters.isVerified ? 'Verified' : 'Unverified'}</span>
                      <X className="h-3 w-3" />
                    </Badge>
                  )}
                  {(filters.minFields !== '' || filters.maxFields !== '') && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-slate-300/80 dark:hover:bg-slate-700/80 transition-colors"
                      onClick={() => removeFilter('fields')}
                    >
                      <span>
                        Fields: {filters.minFields || '0'}-{filters.maxFields || '∞'}
                      </span>
                      <X className="h-3 w-3" />
                    </Badge>
                  )}
                  {(filters.minExtractions !== '' || filters.maxExtractions !== '') && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-slate-300/80 dark:hover:bg-slate-700/80 transition-colors"
                      onClick={() => removeFilter('extractions')}
                    >
                      <span>
                        Extractions: {filters.minExtractions || '0'}-{filters.maxExtractions || '∞'}
                      </span>
                      <X className="h-3 w-3" />
                    </Badge>
                  )}
                </div>
              )}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`my-${activeTab}-${animationKeyRef.current}-${viewMode}`}
                  initial={{ opacity: 0, y: 10, filter: "blur(2px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(2px)" }}
                  transition={{
                    duration: 0.4,
                    ease: "easeOut"
                  }}
                >
                  {filteredSchemas.length === 0 ? (
                    <EmptyState
                      title="No Schemas Found"
                      description="Get started by creating your first extraction schema"
                      icon={FileJson}
                      variant="default"
                      primaryAction={{
                        label: "Add Schema",
                        onClick: () => router.push('/schema-chat'),
                        icon: Plus,
                      }}
                    />
                  ) : (
                    <div className={viewMode === 'grid' 
                      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                      : "space-y-4"
                    }>
                      {paginatedSchemas.map((schema) => (
                        <SchemaCard
                          key={schema.id}
                          schema={schema}
                          viewMode={viewMode}
                          extractionCount={stats[schema.id] || 0}
                          onClick={() => router.push(`/schemas/${schema.id}`)}
                          currentUserId={user?.id}
                          onDelete={fetchSchemas}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </GlassTabsContent>

            <GlassTabsContent value="public-schemas" className="mt-0">
              {/* Active Filters Row */}
              {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {filters.creator !== '__all__' && filters.creator !== '' && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-slate-300/80 dark:hover:bg-slate-700/80 transition-colors"
                      onClick={() => removeFilter('creator')}
                    >
                      <span>Author: {filters.creator}</span>
                      <X className="h-3 w-3" />
                    </Badge>
                  )}
                  {filters.isVerified !== null && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-slate-300/80 dark:hover:bg-slate-700/80 transition-colors"
                      onClick={() => removeFilter('isVerified')}
                    >
                      <span>{filters.isVerified ? 'Verified' : 'Unverified'}</span>
                      <X className="h-3 w-3" />
                    </Badge>
                  )}
                  {(filters.minFields !== '' || filters.maxFields !== '') && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-slate-300/80 dark:hover:bg-slate-700/80 transition-colors"
                      onClick={() => removeFilter('fields')}
                    >
                      <span>
                        Fields: {filters.minFields || '0'}-{filters.maxFields || '∞'}
                      </span>
                      <X className="h-3 w-3" />
                    </Badge>
                  )}
                  {(filters.minExtractions !== '' || filters.maxExtractions !== '') && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-slate-300/80 dark:hover:bg-slate-700/80 transition-colors"
                      onClick={() => removeFilter('extractions')}
                    >
                      <span>
                        Extractions: {filters.minExtractions || '0'}-{filters.maxExtractions || '∞'}
                      </span>
                      <X className="h-3 w-3" />
                    </Badge>
                  )}
                </div>
              )}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`public-${activeTab}-${animationKeyRef.current}-${viewMode}`}
                  initial={{ opacity: 0, y: 10, filter: "blur(2px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(2px)" }}
                  transition={{
                    duration: 0.4,
                    ease: "easeOut"
                  }}
                >
                  {filteredSchemas.length === 0 ? (
                    <EmptyState
                      title="No Public Schemas Found"
                      description="No published schemas available yet"
                      icon={FileJson}
                      variant="default"
                    />
                  ) : (
                    <div className={viewMode === 'grid' 
                      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                      : "space-y-4"
                    }>
                      {paginatedSchemas.map((schema) => (
                        <SchemaCard
                          key={schema.id}
                          schema={schema}
                          viewMode={viewMode}
                          extractionCount={stats[schema.id] || 0}
                          onClick={() => router.push(`/schemas/${schema.id}`)}
                          currentUserId={user?.id}
                          onDelete={fetchSchemas}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
              </GlassTabsContent>
            </GlassTabs>

            {/* Pagination - Always rendered in same position at bottom */}
            <motion.div
              key={`pagination-${currentPage}-${pageSize}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="mt-6 shrink-0"
            >
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalResults={filteredSchemas.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                pageSizeOptions={[8, 16, 32]}
              />
            </motion.div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
