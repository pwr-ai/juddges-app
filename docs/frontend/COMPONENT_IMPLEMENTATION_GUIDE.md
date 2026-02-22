# Component Implementation Guide
## Ready-to-Use Templates for Critical Missing Components

**Document Version**: 1.0
**Last Updated**: 2026-02-12
**Purpose**: Provide copy-paste component implementations for rapid development

---

## Overview

This guide provides **production-ready component templates** that can be implemented within the 6-day sprint cycle. Each component follows:

- **Accessibility-first design** (WCAG 2.1 AA)
- **Mobile-responsive** patterns
- **Consistent with Legal Glass 2.0** design system
- **TypeScript strict mode**
- **Test-ready** structure with data-testid attributes

---

## Table of Contents

1. [Loading States](#1-loading-states)
2. [Empty States](#2-empty-states)
3. [Error States](#3-error-states)
4. [Search Components](#4-search-components)
5. [Chat Components](#5-chat-components)
6. [Judgment Components](#6-judgment-components)
7. [Data Table](#7-data-table)
8. [Command Palette](#8-command-palette)

---

## 1. Loading States

### LoadingSpinner Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/shared/LoadingSpinner.tsx`

```tsx
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  label?: string;
}

const sizeClasses = {
  xs: 'h-3 w-3 border-2',
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-3',
  xl: 'h-16 w-16 border-4',
};

export function LoadingSpinner({ size = 'md', className, label }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center" role="status" aria-label={label || 'Loading'}>
      <div
        className={cn(
          'animate-spin rounded-full border-primary border-t-transparent',
          sizeClasses[size],
          className
        )}
      />
      <span className="sr-only">{label || 'Loading...'}</span>
    </div>
  );
}
```

### SkeletonCard Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/shared/SkeletonCard.tsx`

```tsx
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SkeletonCardProps {
  className?: string;
  rows?: number;
}

export function SkeletonCard({ className, rows = 3 }: SkeletonCardProps) {
  return (
    <Card className={cn('animate-pulse', className)}>
      <CardHeader>
        <div className="h-5 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-1/2 mt-2" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-4 bg-muted rounded',
                i === rows - 1 && 'w-5/6'
              )}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

### FullPageLoader Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/shared/FullPageLoader.tsx`

```tsx
import { LoadingSpinner } from './LoadingSpinner';

interface FullPageLoaderProps {
  message?: string;
}

export function FullPageLoader({ message = 'Loading...' }: FullPageLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <LoadingSpinner size="lg" />
      {message && <p className="text-muted-foreground">{message}</p>}
    </div>
  );
}
```

---

## 2. Empty States

### EmptyState Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/shared/EmptyState.tsx`

```tsx
import { Button } from '@/components/ui/button';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'outline';
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}
      data-testid="empty-state"
    >
      <div className="mb-4 p-4 rounded-full bg-muted text-muted-foreground">
        <Icon className="h-12 w-12" strokeWidth={1.5} />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">{description}</p>
      {action && (
        <Button onClick={action.onClick} variant={action.variant || 'default'}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
```

### Specific Empty State Variants

```tsx
import { FileSearch, MessageSquare, FileText } from 'lucide-react';
import { EmptyState } from './EmptyState';

export function EmptySearchResults({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <EmptyState
      icon={FileSearch}
      title="No judgments found"
      description="We couldn't find any judgments matching your search criteria. Try adjusting your filters or search terms."
      action={{
        label: 'Clear filters',
        onClick: onClearFilters,
        variant: 'outline',
      }}
    />
  );
}

export function EmptyChatHistory() {
  return (
    <EmptyState
      icon={MessageSquare}
      title="Start a conversation"
      description="Ask questions about legal cases, court decisions, or specific legal topics. I'm here to help you research."
    />
  );
}

export function EmptyJudgmentsList() {
  return (
    <EmptyState
      icon={FileText}
      title="No saved judgments"
      description="You haven't saved any judgments yet. Search for cases and save them to your collection."
    />
  );
}
```

---

## 3. Error States

### ErrorDisplay Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/shared/ErrorDisplay.tsx`

```tsx
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ErrorDisplayProps {
  title: string;
  message: string;
  retry?: () => void;
  details?: string;
  variant?: 'destructive' | 'warning';
  className?: string;
}

export function ErrorDisplay({
  title,
  message,
  retry,
  details,
  variant = 'destructive',
  className,
}: ErrorDisplayProps) {
  return (
    <div className={`py-8 ${className}`} data-testid="error-display">
      <Alert variant={variant} className="max-w-2xl mx-auto">
        <AlertCircle className="h-5 w-5" />
        <AlertTitle className="mb-2">{title}</AlertTitle>
        <AlertDescription className="mb-4">
          <p className="mb-2">{message}</p>
          {details && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Technical details
              </summary>
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">{details}</pre>
            </details>
          )}
        </AlertDescription>
        {retry && (
          <Button onClick={retry} variant="outline" size="sm" className="mt-2">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        )}
      </Alert>
    </div>
  );
}
```

### Specific Error Variants

```tsx
import { ErrorDisplay } from './ErrorDisplay';

export function NetworkError({ retry }: { retry?: () => void }) {
  return (
    <ErrorDisplay
      title="Connection Error"
      message="Unable to connect to the server. Please check your internet connection."
      retry={retry}
    />
  );
}

export function NotFoundError() {
  return (
    <ErrorDisplay
      title="Not Found"
      message="The page or resource you're looking for doesn't exist."
      variant="warning"
    />
  );
}

export function UnauthorizedError() {
  return (
    <ErrorDisplay
      title="Unauthorized"
      message="You don't have permission to access this resource. Please log in."
      variant="warning"
    />
  );
}
```

---

## 4. Search Components

### SearchBar Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/search/SearchBar.tsx`

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  defaultValue?: string;
  isLoading?: boolean;
  suggestions?: string[];
  onSuggestionSelect?: (suggestion: string) => void;
  className?: string;
}

export function SearchBar({
  onSearch,
  placeholder = 'Search judgments...',
  defaultValue = '',
  isLoading = false,
  suggestions = [],
  onSuggestionSelect,
  className,
}: SearchBarProps) {
  const [query, setQuery] = useState(defaultValue);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      setShowSuggestions(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    onSuggestionSelect?.(suggestion);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={cn('relative w-full', className)}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-4 h-5 w-5 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(e.target.value.length > 0 && suggestions.length > 0);
            }}
            onFocus={() => setShowSuggestions(query.length > 0 && suggestions.length > 0)}
            placeholder={placeholder}
            className="pl-12 pr-24 h-12 text-base glass-search-input"
            data-testid="search-input"
            disabled={isLoading}
          />

          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-20 p-1.5 hover:bg-muted rounded-full transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}

          <Button
            type="submit"
            size="lg"
            className="absolute right-2 h-9"
            disabled={isLoading || !query.trim()}
            data-testid="search-button"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span>Search</span>
            )}
          </Button>
        </div>
      </form>

      {/* Autocomplete Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          className="absolute z-50 w-full mt-2 bg-popover border rounded-lg shadow-lg overflow-hidden"
          data-testid="search-suggestions"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors text-sm"
            >
              <Search className="inline h-3.5 w-3.5 mr-2 text-muted-foreground" />
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### SearchFilters Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/search/SearchFilters.tsx`

```tsx
'use client';

import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';

export interface SearchFiltersState {
  jurisdictions: string[];
  dateFrom?: Date;
  dateTo?: Date;
  courts: string[];
}

interface SearchFiltersProps {
  filters: SearchFiltersState;
  onChange: (filters: SearchFiltersState) => void;
  onApply: () => void;
  onReset: () => void;
}

const JURISDICTIONS = [
  { value: 'PL', label: 'Poland' },
  { value: 'UK', label: 'United Kingdom' },
];

const COURTS = [
  { value: 'supreme', label: 'Supreme Court' },
  { value: 'appellate', label: 'Court of Appeal' },
  { value: 'regional', label: 'Regional Court' },
];

export function SearchFilters({ filters, onChange, onApply, onReset }: SearchFiltersProps) {
  const [open, setOpen] = useState(false);

  const activeFilterCount = [
    filters.jurisdictions.length,
    filters.dateFrom ? 1 : 0,
    filters.dateTo ? 1 : 0,
    filters.courts.length,
  ].reduce((sum, count) => sum + count, 0);

  const handleJurisdictionToggle = (value: string) => {
    const newJurisdictions = filters.jurisdictions.includes(value)
      ? filters.jurisdictions.filter((j) => j !== value)
      : [...filters.jurisdictions, value];
    onChange({ ...filters, jurisdictions: newJurisdictions });
  };

  const handleCourtToggle = (value: string) => {
    const newCourts = filters.courts.includes(value)
      ? filters.courts.filter((c) => c !== value)
      : [...filters.courts, value];
    onChange({ ...filters, courts: newCourts });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="relative" data-testid="open-filters">
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filter Judgments</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Jurisdiction Filter */}
          <div>
            <Label className="text-base font-semibold mb-3 block">Jurisdiction</Label>
            <div className="space-y-2">
              {JURISDICTIONS.map((jurisdiction) => (
                <div key={jurisdiction.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`jurisdiction-${jurisdiction.value}`}
                    checked={filters.jurisdictions.includes(jurisdiction.value)}
                    onCheckedChange={() => handleJurisdictionToggle(jurisdiction.value)}
                    data-testid={`filter-jurisdiction-${jurisdiction.value}`}
                  />
                  <Label
                    htmlFor={`jurisdiction-${jurisdiction.value}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {jurisdiction.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Date Range Filter */}
          <div>
            <Label className="text-base font-semibold mb-3 block">Date Range</Label>
            <div className="space-y-3">
              <div>
                <Label htmlFor="date-from" className="text-sm text-muted-foreground mb-1 block">
                  From
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      {filters.dateFrom ? format(filters.dateFrom, 'PPP') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <Calendar
                      mode="single"
                      selected={filters.dateFrom}
                      onSelect={(date) => onChange({ ...filters, dateFrom: date })}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label htmlFor="date-to" className="text-sm text-muted-foreground mb-1 block">
                  To
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      {filters.dateTo ? format(filters.dateTo, 'PPP') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <Calendar
                      mode="single"
                      selected={filters.dateTo}
                      onSelect={(date) => onChange({ ...filters, dateTo: date })}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Court Type Filter */}
          <div>
            <Label className="text-base font-semibold mb-3 block">Court Type</Label>
            <div className="space-y-2">
              {COURTS.map((court) => (
                <div key={court.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`court-${court.value}`}
                    checked={filters.courts.includes(court.value)}
                    onCheckedChange={() => handleCourtToggle(court.value)}
                  />
                  <Label
                    htmlFor={`court-${court.value}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {court.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-6 border-t">
          <Button variant="outline" className="flex-1" onClick={onReset}>
            <X className="h-4 w-4 mr-2" />
            Clear
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onApply();
              setOpen(false);
            }}
            data-testid="apply-filters"
          >
            Apply Filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

### SearchResults Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/search/SearchResults.tsx`

```tsx
'use client';

import { JudgmentCard } from '../judgments/JudgmentCard';
import { EmptySearchResults } from '../shared/EmptyState';
import { SkeletonCard } from '../shared/SkeletonCard';
import { ErrorDisplay } from '../shared/ErrorDisplay';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface Judgment {
  id: string;
  case_number: string;
  title: string;
  jurisdiction: string;
  court_name: string;
  decision_date: string;
  summary: string;
}

interface SearchResultsProps {
  results: Judgment[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  error?: Error | null;
  onPageChange: (page: number) => void;
  onClearFilters: () => void;
  onRetry: () => void;
}

export function SearchResults({
  results,
  total,
  page,
  pageSize,
  isLoading,
  error,
  onPageChange,
  onClearFilters,
  onRetry,
}: SearchResultsProps) {
  const totalPages = Math.ceil(total / pageSize);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="search-results-loading">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <ErrorDisplay
        title="Failed to load search results"
        message={error.message}
        retry={onRetry}
      />
    );
  }

  // Empty state
  if (results.length === 0) {
    return <EmptySearchResults onClearFilters={onClearFilters} />;
  }

  // Results
  return (
    <div className="space-y-6" data-testid="search-results">
      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}{' '}
          results
        </p>
      </div>

      {/* Results grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {results.map((judgment) => (
          <JudgmentCard key={judgment.id} judgment={judgment} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => onPageChange(Math.max(1, page - 1))}
                aria-disabled={page === 1}
              />
            </PaginationItem>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNumber = i + 1;
              return (
                <PaginationItem key={pageNumber}>
                  <PaginationLink
                    onClick={() => onPageChange(pageNumber)}
                    isActive={pageNumber === page}
                  >
                    {pageNumber}
                  </PaginationLink>
                </PaginationItem>
              );
            })}

            {totalPages > 5 && (
              <>
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink onClick={() => onPageChange(totalPages)}>
                    {totalPages}
                  </PaginationLink>
                </PaginationItem>
              </>
            )}

            <PaginationItem>
              <PaginationNext
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                aria-disabled={page === totalPages}
                data-testid="next-page"
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
```

---

## 5. Chat Components

### ChatInterface Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/chat/ChatInterface.tsx`

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { EmptyChatHistory } from '../shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => Promise<void>;
  onClearHistory: () => void;
  isLoading: boolean;
}

export function ChatInterface({
  messages,
  onSendMessage,
  onClearHistory,
  isLoading,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Legal AI Assistant</h2>
        {messages.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" data-testid="clear-chat">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear chat
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all messages in this conversation. This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onClearHistory}>Clear history</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <EmptyChatHistory />
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground" data-testid="typing-indicator">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
                <span className="text-sm">Thinking...</span>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={onSendMessage} disabled={isLoading} />
    </div>
  );
}
```

### ChatMessage Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/chat/ChatMessage.tsx`

```tsx
import { User, Bot, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3 p-4 rounded-lg',
        isUser ? 'bg-primary/5 ml-auto max-w-[85%]' : 'bg-muted max-w-[85%]'
      )}
      data-testid={`chat-message-${message.role}`}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium">
            {isUser ? 'You' : 'Assistant'}
          </span>
          <span className="text-xs text-muted-foreground">
            {message.timestamp.toLocaleTimeString()}
          </span>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none">
          {isUser ? (
            <p className="text-sm">{message.content}</p>
          ) : (
            <ReactMarkdown>{message.content}</ReactMarkdown>
          )}
        </div>

        {!isUser && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="mt-2 h-7 text-xs"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 mr-1" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
```

### ChatInput Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/chat/ChatInput.tsx`

```tsx
'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ChatInputProps {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    if (!message.trim() || disabled) return;

    const messageToSend = message.trim();
    setMessage('');
    await onSend(messageToSend);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  return (
    <div className="p-4 border-t">
      <div className="flex gap-2 items-end">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about legal cases, court decisions, or legal topics..."
          className="min-h-[44px] max-h-[200px] resize-none"
          data-testid="chat-input"
          disabled={disabled}
          rows={1}
        />
        <Button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          size="icon"
          className="h-11 w-11 flex-shrink-0"
          data-testid="send-button"
        >
          <Send className="h-4 w-4" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}
```

---

## 6. Judgment Components

### JudgmentCard Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/judgments/JudgmentCard.tsx`

```tsx
'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Building2, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Judgment {
  id: string;
  case_number: string;
  title: string;
  jurisdiction: string;
  court_name: string;
  decision_date: string;
  summary: string;
}

interface JudgmentCardProps {
  judgment: Judgment;
  className?: string;
}

export function JudgmentCard({ judgment, className }: JudgmentCardProps) {
  return (
    <Link href={`/judgments/${judgment.id}`}>
      <Card
        className={cn(
          'h-full transition-all hover:shadow-lg cursor-pointer',
          className
        )}
        data-testid="judgment-card"
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-2 mb-2">
            <CardTitle className="text-base line-clamp-2">
              {judgment.title}
            </CardTitle>
            <Badge
              variant={judgment.jurisdiction === 'PL' ? 'default' : 'secondary'}
              className="flex-shrink-0"
            >
              {judgment.jurisdiction}
            </Badge>
          </div>
          <CardDescription className="font-mono text-xs">
            {judgment.case_number}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground line-clamp-3">
            {judgment.summary}
          </p>

          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              <span className="line-clamp-1">{judgment.court_name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>{new Date(judgment.decision_date).toLocaleDateString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

---

## 7. Data Table

### DataTable Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/shared/DataTable.tsx`

```tsx
'use client';

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = 'Search...',
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
    },
  });

  return (
    <div className="space-y-4">
      {/* Search */}
      {searchKey && (
        <div className="flex items-center gap-2">
          <Input
            placeholder={searchPlaceholder}
            value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ''}
            onChange={(event) =>
              table.getColumn(searchKey)?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} row(s) total
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

## 8. Command Palette

### CommandPalette Component

**File**: `/home/laugustyniak/github/legal-ai/juddges-app/frontend/components/shared/CommandPalette.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Search, MessageSquare, FileText, BarChart3, Settings } from 'lucide-react';

const COMMANDS = [
  {
    group: 'Navigation',
    items: [
      { icon: Search, label: 'Search Judgments', href: '/search' },
      { icon: MessageSquare, label: 'Chat with AI', href: '/chat' },
      { icon: FileText, label: 'My Documents', href: '/documents' },
      { icon: BarChart3, label: 'Analytics', href: '/analytics' },
      { icon: Settings, label: 'Settings', href: '/settings' },
    ],
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {COMMANDS.map((group) => (
          <CommandGroup key={group.group} heading={group.group}>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem key={item.href} onSelect={() => handleSelect(item.href)}>
                  <Icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
```

---

## Implementation Checklist

### Week 1: Core Components
- [ ] LoadingSpinner
- [ ] SkeletonCard
- [ ] EmptyState
- [ ] ErrorDisplay
- [ ] SearchBar
- [ ] JudgmentCard

### Week 2: Feature Components
- [ ] SearchFilters
- [ ] SearchResults
- [ ] ChatInterface
- [ ] ChatMessage
- [ ] ChatInput

### Week 3: Advanced Components
- [ ] DataTable
- [ ] CommandPalette
- [ ] FullPageLoader

### Week 4: Testing & Polish
- [ ] Write unit tests for all components
- [ ] Write E2E tests for user flows
- [ ] Accessibility audit
- [ ] Performance optimization

---

**Next Steps**:
1. Copy component templates to respective directories
2. Adjust imports based on your project structure
3. Add corresponding unit tests (see TESTING_STRATEGY.md)
4. Test components in isolation with Storybook (optional)
5. Integrate into pages

**Pro Tips**:
- Use `data-testid` attributes for E2E testing
- Keep components small and focused
- Extract shared logic into custom hooks
- Document component props with JSDoc comments
