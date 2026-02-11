# Chat Sources & Citations Feature Design

**Version:** 1.0
**Date:** 2025-10-10
**Status:** Design Specification
**Author:** Design System Team

---

## Executive Summary

This document defines the design and implementation strategy for displaying legal document sources and citations within chat messages. The feature enables users to verify AI responses by exploring the documents that informed each answer, while maintaining a clean, uncluttered chat experience.

**Core Design Principles:**
1. **Credibility First** - Make legal sources highly visible and trustworthy
2. **Progressive Disclosure** - Start minimal, reveal details on demand
3. **Professional Aesthetics** - Match legal industry standards
4. **Mobile-Optimized** - Touch-friendly, responsive design
5. **Fast Development** - Use existing components, minimize custom work

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Design Options Overview](#design-options-overview)
3. [Recommended Solution](#recommended-solution)
4. [Component Specifications](#component-specifications)
5. [Data Structure & Types](#data-structure--types)
6. [Visual Design System](#visual-design-system)
7. [Interaction Patterns](#interaction-patterns)
8. [User Flows](#user-flows)
9. [Responsive Behavior](#responsive-behavior)
10. [Implementation Guide](#implementation-guide)
11. [Performance Considerations](#performance-considerations)
12. [Accessibility Requirements](#accessibility-requirements)

---

## Current State Analysis

### Existing Implementation

**Current Message Structure:**
```typescript
// /home/laugustyniak/github/legal-ai/juddges-app/frontend/types/message.ts
interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}
```

**Current Sources Display:**
- Located in `message-list.tsx` (lines 35-80)
- Shows "Sources (n)" button at bottom of entire conversation
- Opens full-screen dialog with accordion view
- Displays fragments (title + content) but not document metadata
- Uses pattern handlers for inline `[1]` citations with tooltips

**Problems with Current Approach:**
1. Sources are conversation-level, not message-level
2. No link between specific message and its sources
3. Fragment-based (text chunks) not document-based
4. Limited metadata displayed
5. Can't trace which documents informed which answer
6. No document type indicators or visual hierarchy

**What Works Well:**
1. Inline citation tooltips `[1]` are helpful
2. Accordion pattern for multiple sources is familiar
3. Clean, minimal button presentation
4. Good use of Dialog component

---

## Design Options Overview

### Option A: Minimal Inline Badge (Recommended)

**Visual Concept:**
```
┌────────────────────────────────────────────────────┐
│ AI Response                                         │
│                                                     │
│ According to the Supreme Court ruling [1] and      │
│ tax interpretation [2], the threshold is...        │
│                                                     │
│ ┌─────────────────────────────────────────┐       │
│ │ 📚 2 sources cited ▼                     │       │
│ └─────────────────────────────────────────┘       │
└────────────────────────────────────────────────────┘
```

**Expanded State:**
```
┌────────────────────────────────────────────────────┐
│ 📚 2 sources cited ▲                               │
│                                                     │
│ ┌─[1]───────────────────────────────────────────┐ │
│ │ 🏛️ Supreme Court Judgment                     │ │
│ │ III KK 123/2023 • 2023-05-15                  │ │
│ │ Significant amount of narcotics definition... │ │
│ │ → View full document                          │ │
│ └───────────────────────────────────────────────┘ │
│                                                     │
│ ┌─[2]───────────────────────────────────────────┐ │
│ │ 📋 Tax Interpretation                         │ │
│ │ DIR3/0112/ITPB1/415/2023 • 2023-03-20        │ │
│ │ Currency exchange taxation principles...      │ │
│ │ → View full document                          │ │
│ └───────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

**Pros:**
- Clean, unobtrusive when collapsed
- Easy to implement with existing components
- Fast development (2-3 days)
- Mobile-friendly
- Familiar pattern for users

**Cons:**
- Requires click to see sources
- Extra step for source exploration

---

### Option B: Always-Visible Citation Pills

**Visual Concept:**
```
┌────────────────────────────────────────────────────┐
│ AI Response                                         │
│                                                     │
│ According to the ruling and interpretation...      │
│                                                     │
│ ┌──────────────┐ ┌──────────────────────┐         │
│ │ 🏛️ [1] III KK │ │ 📋 [2] DIR3/0112... │         │
│ └──────────────┘ └──────────────────────┘         │
└────────────────────────────────────────────────────┘
```

**Pros:**
- Immediate visibility of sources
- No interaction needed to see what was cited
- Professional, academic feel

**Cons:**
- Takes more vertical space
- Can clutter on mobile
- Longer development (4-5 days)

---

### Option C: Sidebar Citation Panel

**Visual Concept:**
```
┌──────────────────────┬─────────────────┐
│ AI Response          │ SOURCES         │
│                      │                 │
│ According to...      │ [1] 🏛️ III KK  │
│                      │ Supreme Court   │
│                      │                 │
│                      │ [2] 📋 DIR3...  │
│                      │ Tax Interpret   │
└──────────────────────┴─────────────────┘
```

**Pros:**
- Professional, research-paper style
- Sources always in view
- Good for desktop

**Cons:**
- Complex responsive behavior
- Doesn't work well on mobile
- Long development time (6-7 days)
- Breaks chat-style layout

---

## Recommended Solution

**Selected Approach:** **Option A - Minimal Inline Badge** with enhancements

### Why This Option?

1. **Rapid Development** - Can be built in 2-3 days using existing components
2. **Clean UX** - Doesn't clutter the chat while still being discoverable
3. **Mobile-First** - Works perfectly on all screen sizes
4. **Flexible** - Easy to enhance later without major refactoring
5. **Familiar** - Users understand expandable sections
6. **Performance** - Lazy loads document details only when expanded

### Key Enhancements

1. **Smart Badge Design** - Shows source count + visual indicator
2. **Rich Document Cards** - Full metadata when expanded
3. **Quick Actions** - One-click to view full document
4. **Type Indicators** - Color-coded icons for document types
5. **Inline References** - Keep existing `[1]` tooltip pattern
6. **Deep Linking** - Support for opening specific sources from URLs

---

## Component Specifications

### Component Hierarchy

```
MessageSources (new)
├── SourcesBadge (collapsed state)
└── SourcesList (expanded state)
    └── SourceCard[] (individual documents)
        ├── SourceHeader
        ├── SourceMetadata
        ├── SourcePreview
        └── SourceActions
```

### 1. MessageSources Component

**Purpose:** Container component that manages sources display for a single message

**File:** `/components/chat/message-sources.tsx`

**Props:**
```typescript
interface MessageSourcesProps {
  documentIds: string[];
  messageId: string;
  className?: string;
  defaultExpanded?: boolean;
}
```

**State:**
```typescript
{
  isExpanded: boolean;
  documents: SearchDocument[];
  isLoading: boolean;
  error: string | null;
}
```

**Visual States:**

**Collapsed (Default):**
```
┌─────────────────────────────────────────┐
│ 📚 3 sources cited • Click to expand ▼  │
└─────────────────────────────────────────┘
```

**Expanded:**
```
┌─────────────────────────────────────────┐
│ 📚 3 sources cited ▲                     │
│                                          │
│ [Source Card 1]                          │
│ [Source Card 2]                          │
│ [Source Card 3]                          │
└─────────────────────────────────────────┘
```

**Loading:**
```
┌─────────────────────────────────────────┐
│ 📚 3 sources cited ▼                     │
│ Loading sources...                       │
└─────────────────────────────────────────┘
```

**Empty State:**
```
(Component hidden if documentIds.length === 0)
```

**CSS Classes:**
```css
.message-sources {
  @apply mt-4 pt-4 border-t border-border/40;
}

.sources-badge {
  @apply flex items-center gap-2 px-3 py-2 rounded-lg
         bg-muted/50 hover:bg-muted/70 transition-colors
         cursor-pointer text-sm text-muted-foreground
         hover:text-foreground;
}

.sources-badge-icon {
  @apply text-primary;
}

.sources-badge-text {
  @apply font-medium;
}

.sources-badge-arrow {
  @apply ml-auto transition-transform;
}

.sources-badge-arrow.expanded {
  @apply rotate-180;
}
```

---

### 2. SourceCard Component

**Purpose:** Display individual document citation with metadata

**File:** `/components/chat/source-card.tsx`

**Props:**
```typescript
interface SourceCardProps {
  document: SearchDocument;
  index: number; // [1], [2], etc.
  onViewDocument?: (documentId: string) => void;
  onAddToCollection?: (documentId: string) => void;
}
```

**Visual Design:**

```
┌─[1]──────────────────────────────────────────────┐
│ 🏛️ Supreme Court Judgment                  [+]  │
│ ──────────────────────────────────────────────── │
│ III KK 123/2023 • May 15, 2023 • Polish         │
│                                                   │
│ Definition of significant amount in narcotics    │
│ cases under Article 63 of the Penal Code...      │
│                                                   │
│ → View full document    Save to collection       │
└───────────────────────────────────────────────────┘
```

**Structure:**

```typescript
<div className="source-card">
  <div className="source-header">
    <span className="source-number">[{index}]</span>
    <DocumentTypeIcon type={document.document_type} />
    <h4 className="source-title">{getDocumentTypeLabel()}</h4>
    <button className="source-save">+</button>
  </div>

  <div className="source-metadata">
    <span className="source-id">{document.document_number}</span>
    <span className="source-date">{formatDate(document.date_issued)}</span>
    <span className="source-language">{document.language}</span>
  </div>

  <div className="source-preview">
    {document.summary || document.thesis || truncate(document.full_text)}
  </div>

  <div className="source-actions">
    <button onClick={() => onViewDocument(document.document_id)}>
      → View full document
    </button>
    <button onClick={() => onAddToCollection(document.document_id)}>
      Save to collection
    </button>
  </div>
</div>
```

**CSS Classes:**
```css
.source-card {
  @apply border border-border rounded-lg p-4 mb-3 last:mb-0
         bg-card hover:border-primary/30 transition-colors;
}

.source-header {
  @apply flex items-center gap-2 mb-2;
}

.source-number {
  @apply flex-shrink-0 w-8 h-8 rounded-full
         bg-primary/10 text-primary font-mono text-sm
         flex items-center justify-center font-medium;
}

.source-title {
  @apply text-sm font-semibold text-foreground flex-1;
}

.source-save {
  @apply w-8 h-8 rounded-full hover:bg-muted
         text-muted-foreground hover:text-foreground
         transition-colors flex items-center justify-center;
}

.source-metadata {
  @apply flex flex-wrap items-center gap-2 text-xs
         text-muted-foreground mb-3 border-b border-border/30 pb-3;
}

.source-id {
  @apply font-mono;
}

.source-preview {
  @apply text-sm text-foreground/80 leading-relaxed mb-3
         line-clamp-3;
}

.source-actions {
  @apply flex flex-wrap gap-2;
}

.source-actions button {
  @apply text-sm text-primary hover:underline
         transition-colors font-medium;
}
```

---

### 3. DocumentTypeIcon Component

**Purpose:** Color-coded icons for different document types

**File:** `/components/chat/document-type-icon.tsx`

**Props:**
```typescript
interface DocumentTypeIconProps {
  type: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}
```

**Icon Mapping:**
```typescript
const DOCUMENT_TYPE_CONFIG = {
  judgment: {
    icon: Scale, // lucide-react
    label: 'Court Judgment',
    color: 'text-judgment',
    bgColor: 'bg-judgment/10',
  },
  tax_interpretation: {
    icon: FileText,
    label: 'Tax Interpretation',
    color: 'text-interpretation',
    bgColor: 'bg-interpretation/10',
  },
  regulation: {
    icon: BookOpen,
    label: 'Legal Regulation',
    color: 'text-document',
    bgColor: 'bg-document/10',
  },
  case_law: {
    icon: Gavel,
    label: 'Case Law',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
} as const;
```

**Visual Examples:**
```
🏛️ Judgment        (purple/indigo)
📋 Interpretation   (amber/gold)
📖 Regulation       (teal/cyan)
⚖️ Case Law         (blue)
```

---

## Data Structure & Types

### Extended Message Type

**File:** `/types/message.ts`

```typescript
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  // NEW: Add sources
  documentIds?: string[];
  metadata?: {
    format_used?: "short" | "detailed";
    created_at?: string;
  };
}
```

### Document Source Type

**File:** `/types/chat-sources.ts`

```typescript
import { SearchDocument } from '@/types/search';

export interface MessageSources {
  messageId: string;
  documentIds: string[];
  documents?: SearchDocument[]; // Lazy loaded
  fetchedAt?: string;
}

export interface SourcesCache {
  [documentId: string]: {
    document: SearchDocument;
    fetchedAt: string;
    expiresAt: string;
  };
}

export interface SourceCardAction {
  type: 'view' | 'save' | 'share';
  documentId: string;
  timestamp: string;
}
```

### API Response Extension

**Update:** `/lib/api.ts` - `DocumentRetrievalOutput`

```typescript
export interface DocumentRetrievalOutput {
  text: string;
  document_ids: string[]; // Already exists
  format_used?: "short" | "detailed" | null;
  // Optional: If backend provides pre-fetched metadata
  documents?: Array<{
    document_id: string;
    title: string;
    document_type: string;
    document_number?: string;
    date_issued?: string;
  }>;
}
```

---

## Visual Design System

### Color Palette for Document Types

Already defined in `globals.css`:

```css
/* Light mode */
--judgment: oklch(0.55 0.20 260.00);      /* Indigo/Purple */
--interpretation: oklch(0.58 0.18 45.00);  /* Amber/Gold */
--document: oklch(0.52 0.12 180.00);       /* Teal/Cyan */

/* Dark mode - automatically adjusted */
```

**Usage:**
```tsx
<div className="bg-judgment/10 text-judgment">Judgment</div>
<div className="bg-interpretation/10 text-interpretation">Interpretation</div>
<div className="bg-document/10 text-document">Document</div>
```

### Typography Scale

**Source Numbers:**
```css
.source-number {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
}
```

**Document Titles:**
```css
.source-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}
```

**Metadata:**
```css
.source-metadata {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}
```

**Preview Text:**
```css
.source-preview {
  font-size: 14px;
  line-height: 1.6;
  color: oklch(var(--foreground) / 0.8);
}
```

### Spacing System

```css
/* Vertical spacing */
--source-card-gap: 0.75rem;      /* 12px between cards */
--source-section-gap: 1rem;      /* 16px sections within card */
--source-badge-padding: 0.75rem; /* 12px badge padding */

/* Horizontal spacing */
--source-content-padding: 1rem;  /* 16px card padding */
--source-icon-gap: 0.5rem;       /* 8px between icon and text */
```

### Border Radius

```css
.source-card {
  border-radius: var(--radius-lg); /* 8px */
}

.source-badge {
  border-radius: var(--radius-lg);
}

.source-number {
  border-radius: 9999px; /* Full circle */
}
```

### Shadows

**Source Cards (hover):**
```css
.source-card:hover {
  box-shadow: var(--shadow-sm);
}
```

**Modal/Dialog (document details):**
```css
.source-detail-modal {
  box-shadow: var(--shadow-xl);
}
```

---

## Interaction Patterns

### 1. Expand/Collapse Animation

**Trigger:** Click on sources badge

**Animation Sequence:**
1. Badge arrow rotates 180deg (0.2s ease-out)
2. Sources list slides down with fade-in (0.3s ease-out)
3. Each source card staggers in (50ms delay between cards)

**CSS:**
```css
.sources-list {
  animation: slide-down 0.3s ease-out;
}

@keyframes slide-down {
  from {
    opacity: 0;
    transform: translateY(-8px);
    max-height: 0;
  }
  to {
    opacity: 1;
    transform: translateY(0);
    max-height: 1000px;
  }
}

.source-card {
  animation: fade-in-up 0.3s ease-out backwards;
}

.source-card:nth-child(1) { animation-delay: 0ms; }
.source-card:nth-child(2) { animation-delay: 50ms; }
.source-card:nth-child(3) { animation-delay: 100ms; }
```

### 2. Inline Citation Tooltips

**Keep existing pattern** from `message-list.tsx` (lines 199-242):

- Hovering over `[1]` shows tooltip with document preview
- Click on `[1]` scrolls to corresponding source card
- Highlight the referenced source card briefly

**Enhancement:**
```typescript
const scrollToSource = (index: number) => {
  const sourceCard = document.querySelector(`[data-source-index="${index}"]`);
  sourceCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  sourceCard?.classList.add('source-highlight');
  setTimeout(() => {
    sourceCard?.classList.remove('source-highlight');
  }, 2000);
};
```

**CSS:**
```css
.source-highlight {
  animation: highlight-pulse 2s ease-out;
}

@keyframes highlight-pulse {
  0%, 100% {
    background-color: transparent;
  }
  10% {
    background-color: oklch(var(--primary) / 0.1);
  }
  90% {
    background-color: oklch(var(--primary) / 0.05);
  }
}
```

### 3. Loading States

**Skeleton Screen for Source Cards:**

```typescript
function SourceCardSkeleton() {
  return (
    <div className="source-card animate-pulse">
      <div className="source-header">
        <div className="w-8 h-8 bg-muted rounded-full" />
        <div className="h-4 bg-muted rounded w-1/3" />
      </div>
      <div className="source-metadata">
        <div className="h-3 bg-muted rounded w-24" />
        <div className="h-3 bg-muted rounded w-20" />
      </div>
      <div className="source-preview space-y-2">
        <div className="h-3 bg-muted rounded w-full" />
        <div className="h-3 bg-muted rounded w-4/5" />
      </div>
    </div>
  );
}
```

### 4. Error States

**Failed to Load Sources:**

```
┌─────────────────────────────────────────┐
│ ⚠️ Failed to load sources               │
│ Could not retrieve document details.    │
│ [Try Again]                             │
└─────────────────────────────────────────┘
```

**Individual Document Failed:**

```
┌─[2]──────────────────────────────────────┐
│ ⚠️ Document Unavailable                  │
│ This document could not be loaded.       │
│ ID: abc123...                            │
└──────────────────────────────────────────┘
```

---

## User Flows

### Flow 1: Basic Source Exploration

```
User receives AI response
     ↓
Sees "📚 3 sources cited" badge at bottom of message
     ↓
Clicks badge to expand
     ↓
Sees 3 source cards with metadata
     ↓
Reads preview of Source [1]
     ↓
Clicks "View full document"
     ↓
Opens document detail page in new tab or modal
```

### Flow 2: Inline Citation Click

```
User reads AI response
     ↓
Hovers over [1] in text
     ↓
Sees tooltip preview of document
     ↓
Clicks [1]
     ↓
Sources section auto-expands
     ↓
Scrolls to Source [1] card
     ↓
Highlights Source [1] briefly
```

### Flow 3: Save Source to Collection

```
User expands sources
     ↓
Finds relevant document
     ↓
Clicks [+] button on source card
     ↓
Shows "Add to Collection" dropdown
     ↓
Selects existing collection or creates new
     ↓
Shows success toast
     ↓
[+] button changes to [✓]
```

### Flow 4: Mobile Touch Interaction

```
User taps sources badge
     ↓
Sources expand in-place
     ↓
User scrolls through sources
     ↓
Taps "View full document"
     ↓
Opens bottom sheet with document details
     ↓
User can swipe down to dismiss
```

---

## Responsive Behavior

### Desktop (1024px+)

**Layout:**
```
┌──────────────────────────────────────────────────┐
│ AI Response text lorem ipsum dolor sit amet...   │
│                                                   │
│ According to judgment [1] and interpretation [2]  │
│                                                   │
│ ┌────────────────────────────────────────────┐   │
│ │ 📚 2 sources cited ▼                        │   │
│ └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

**Source Cards:**
- Full width within message container
- Max 2 columns for 4+ sources
- Hover effects enabled
- Preview shows 3 lines of text

### Tablet (768px - 1023px)

**Layout:**
- Same as desktop
- Single column source cards
- Slightly reduced padding
- Preview shows 2 lines of text

### Mobile (< 768px)

**Layout:**
```
┌─────────────────────────────┐
│ AI Response text...         │
│                             │
│ ┌─────────────────────────┐ │
│ │ 📚 2 sources ▼          │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

**Source Cards:**
- Full width, single column
- Reduced padding (12px vs 16px)
- Metadata wraps on multiple lines
- Preview shows 2 lines
- "View document" opens bottom sheet

**Touch Targets:**
- Minimum 44px height for all tappable elements
- Increased padding on buttons
- Larger icons (20px vs 16px)

---

## Implementation Guide

### Phase 1: Core Component Structure (Day 1)

**Tasks:**
1. Create TypeScript types in `/types/chat-sources.ts`
2. Update Message interface in `/types/message.ts`
3. Create base `MessageSources` component
4. Create `SourceCard` component with static data
5. Create `DocumentTypeIcon` component

**Files to Create:**
- `/types/chat-sources.ts`
- `/components/chat/message-sources.tsx`
- `/components/chat/source-card.tsx`
- `/components/chat/document-type-icon.tsx`

**Files to Modify:**
- `/types/message.ts` (add documentIds field)

### Phase 2: Data Integration (Day 2)

**Tasks:**
1. Create document fetching hook `useSourceDocuments`
2. Implement caching strategy with React Query
3. Integrate with existing API endpoints
4. Handle loading and error states
5. Add skeleton screens

**Files to Create:**
- `/hooks/use-source-documents.ts`
- `/lib/sources-cache.ts`

**Files to Modify:**
- `/lib/api.ts` (add fetchDocumentsByIds function)

### Phase 3: UI Polish & Interactions (Day 3)

**Tasks:**
1. Implement expand/collapse animations
2. Add inline citation click handler
3. Create document detail modal/drawer
4. Add "Save to Collection" functionality
5. Implement responsive design
6. Add keyboard navigation

**Files to Modify:**
- `/components/chat/message-sources.tsx`
- `/components/message-list.tsx` (integrate MessageSources)

### Phase 4: Testing & Refinement (Day 4)

**Tasks:**
1. Test with 1, 3, 10+ sources
2. Mobile device testing
3. Performance testing with large documents
4. Accessibility audit
5. Dark mode verification
6. Edge case handling

### Implementation Code Examples

#### 1. Create MessageSources Component

```typescript
// /components/chat/message-sources.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SourceCard } from './source-card';
import { useSourceDocuments } from '@/hooks/use-source-documents';
import { SourceCardSkeleton } from './source-card-skeleton';

interface MessageSourcesProps {
  documentIds: string[];
  messageId: string;
  className?: string;
  defaultExpanded?: boolean;
}

export function MessageSources({
  documentIds,
  messageId,
  className,
  defaultExpanded = false,
}: MessageSourcesProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { documents, isLoading, error, refetch } = useSourceDocuments(
    documentIds,
    { enabled: isExpanded }
  );

  if (!documentIds || documentIds.length === 0) {
    return null;
  }

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={cn('message-sources', className)}>
      {/* Collapsed Badge */}
      <button
        onClick={handleToggle}
        className="sources-badge w-full group"
        aria-expanded={isExpanded}
        aria-controls={`sources-${messageId}`}
      >
        <BookOpen className="sources-badge-icon" size={16} />
        <span className="sources-badge-text">
          {documentIds.length} {documentIds.length === 1 ? 'source' : 'sources'} cited
        </span>
        {!isExpanded && (
          <span className="text-xs text-muted-foreground ml-1">
            • Click to expand
          </span>
        )}
        <ChevronDown
          className={cn(
            'sources-badge-arrow',
            isExpanded && 'expanded'
          )}
          size={16}
        />
      </button>

      {/* Expanded Sources List */}
      {isExpanded && (
        <div
          id={`sources-${messageId}`}
          className="sources-list mt-4 space-y-3"
        >
          {isLoading && (
            <>
              {documentIds.map((_, index) => (
                <SourceCardSkeleton key={index} />
              ))}
            </>
          )}

          {error && (
            <div className="source-error p-4 border border-error/20 rounded-lg bg-error/5">
              <p className="text-sm text-error font-medium mb-2">
                ⚠️ Failed to load sources
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Could not retrieve document details.
              </p>
              <button
                onClick={() => refetch()}
                className="text-sm text-primary hover:underline"
              >
                Try Again
              </button>
            </div>
          )}

          {!isLoading && !error && documents && (
            <>
              {documents.map((document, index) => (
                <SourceCard
                  key={document.document_id}
                  document={document}
                  index={index + 1}
                  data-source-index={index + 1}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

#### 2. Create SourceCard Component

```typescript
// /components/chat/source-card.tsx
'use client';

import { useState } from 'react';
import { Plus, Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DocumentTypeIcon } from './document-type-icon';
import { SearchDocument } from '@/types/search';
import { formatDate, truncateText } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface SourceCardProps {
  document: SearchDocument;
  index: number;
  className?: string;
  'data-source-index'?: number;
}

export function SourceCard({
  document,
  index,
  className,
  ...props
}: SourceCardProps) {
  const [isSaved, setIsSaved] = useState(false);
  const router = useRouter();

  const handleViewDocument = () => {
    router.push(`/search/document/${document.document_id}`);
  };

  const handleSaveToCollection = () => {
    // TODO: Implement save to collection
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const getDocumentTypeLabel = () => {
    const labels: Record<string, string> = {
      judgment: 'Court Judgment',
      tax_interpretation: 'Tax Interpretation',
      regulation: 'Legal Regulation',
      case_law: 'Case Law',
    };
    return labels[document.document_type] || 'Document';
  };

  const getPreviewText = () => {
    return (
      document.summary ||
      document.thesis ||
      truncateText(document.full_text || '', 200)
    );
  };

  return (
    <div className={cn('source-card', className)} {...props}>
      {/* Header */}
      <div className="source-header">
        <span className="source-number">[{index}]</span>
        <DocumentTypeIcon type={document.document_type} size="md" />
        <h4 className="source-title">{getDocumentTypeLabel()}</h4>
        <button
          onClick={handleSaveToCollection}
          className="source-save"
          title={isSaved ? 'Saved' : 'Save to collection'}
        >
          {isSaved ? <Check size={16} /> : <Plus size={16} />}
        </button>
      </div>

      {/* Metadata */}
      <div className="source-metadata">
        {document.document_number && (
          <span className="source-id">{document.document_number}</span>
        )}
        {document.date_issued && (
          <>
            <span>•</span>
            <span className="source-date">
              {formatDate(document.date_issued)}
            </span>
          </>
        )}
        {document.language && (
          <>
            <span>•</span>
            <span className="source-language capitalize">
              {document.language}
            </span>
          </>
        )}
      </div>

      {/* Preview */}
      {getPreviewText() && (
        <div className="source-preview">{getPreviewText()}</div>
      )}

      {/* Actions */}
      <div className="source-actions">
        <button
          onClick={handleViewDocument}
          className="source-action-button"
        >
          <ExternalLink size={14} className="mr-1" />
          View full document
        </button>
      </div>
    </div>
  );
}
```

#### 3. Create useSourceDocuments Hook

```typescript
// /hooks/use-source-documents.ts
import { useQuery } from '@tanstack/react-query';
import { SearchDocument } from '@/types/search';

async function fetchDocumentsByIds(
  documentIds: string[]
): Promise<SearchDocument[]> {
  const response = await fetch('/api/documents/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_ids: documentIds }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch documents');
  }

  return response.json();
}

export function useSourceDocuments(
  documentIds: string[],
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['source-documents', documentIds],
    queryFn: () => fetchDocumentsByIds(documentIds),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
  });
}
```

#### 4. Integrate into MessageList

```typescript
// /components/message-list.tsx
// Add to existing imports
import { MessageSources } from './chat/message-sources';

// In the MessageList component, after the Message component:
return (
  <Message
    key={message.id}
    content={message.content || ""}
    sender={message.role === "user" ? "user" : "assistant"}
    patternHandlers={
      message.role === "assistant" ? sourcePatternHandler : []
    }
    actionButtons={actionButtons}
    editable={message.role === "user"}
    onEdit={message.role === "user" && onEditMessage ? (newContent) => onEditMessage(message.id, newContent) : undefined}
  >
    {/* NEW: Add sources section for assistant messages */}
    {message.role === "assistant" && message.documentIds && message.documentIds.length > 0 && (
      <MessageSources
        documentIds={message.documentIds}
        messageId={message.id}
      />
    )}
  </Message>
);
```

#### 5. Update Message Type

```typescript
// /types/message.ts
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  documentIds?: string[]; // NEW
  metadata?: {
    format_used?: "short" | "detailed";
    created_at?: string;
  }; // NEW
}
```

---

## Performance Considerations

### 1. Lazy Loading

**Strategy:** Only fetch document details when sources are expanded

```typescript
const { documents } = useSourceDocuments(documentIds, {
  enabled: isExpanded, // Only fetch when expanded
});
```

**Benefits:**
- Reduces initial API calls
- Faster message rendering
- Lower bandwidth usage

### 2. Caching

**React Query Configuration:**
```typescript
queryClient.setDefaultOptions({
  queries: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
  },
});
```

**Benefits:**
- Documents fetched once, reused across messages
- Faster subsequent expansions
- Reduced server load

### 3. Virtualization

**When to use:** For messages with 20+ sources

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: documents.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 150, // Estimated card height
});
```

### 4. Batch API Requests

**Implementation:**
```typescript
// Instead of: documentIds.map(id => fetchDocument(id))
// Use: fetchDocumentsByIds(documentIds)

async function fetchDocumentsByIds(ids: string[]) {
  return fetch('/api/documents/batch', {
    method: 'POST',
    body: JSON.stringify({ document_ids: ids }),
  });
}
```

### 5. Optimistic Updates

**For "Save to Collection":**
```typescript
const mutation = useMutation({
  mutationFn: saveToCollection,
  onMutate: async (documentId) => {
    // Optimistically show as saved
    setIsSaved(true);
  },
  onError: () => {
    // Revert on error
    setIsSaved(false);
  },
});
```

---

## Accessibility Requirements

### ARIA Labels

```typescript
<button
  onClick={handleToggle}
  aria-expanded={isExpanded}
  aria-controls={`sources-${messageId}`}
  aria-label={`${documentIds.length} sources cited, click to expand`}
>
```

### Keyboard Navigation

**Tab Order:**
1. Sources badge (toggle)
2. Each source card (focusable)
3. Actions within each card (View, Save)

**Keyboard Shortcuts:**
```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleToggle();
  }
};
```

### Screen Reader Support

```typescript
<div role="region" aria-label="Document sources">
  <div role="list">
    {documents.map((doc, index) => (
      <div role="listitem" aria-label={`Source ${index + 1}: ${doc.title}`}>
        {/* Card content */}
      </div>
    ))}
  </div>
</div>
```

### Focus Management

```typescript
// When expanding sources, focus first source card
useEffect(() => {
  if (isExpanded && documents.length > 0) {
    const firstCard = document.querySelector('[data-source-index="1"]');
    (firstCard as HTMLElement)?.focus();
  }
}, [isExpanded]);
```

### Color Contrast

**Ensure WCAG AA compliance:**
- Source numbers: 4.5:1 minimum
- Metadata text: 4.5:1 minimum
- Preview text: 4.5:1 minimum
- Action buttons: 3:1 minimum (large text)

---

## Examples with Different Source Counts

### Example 1: Single Source

```
┌──────────────────────────────────────────────────┐
│ AI Response: According to the Supreme Court...   │
│                                                   │
│ ┌────────────────────────────────────────────┐   │
│ │ 📚 1 source cited ▼                         │   │
│ └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘

Expanded:
┌──────────────────────────────────────────────────┐
│ 📚 1 source cited ▲                              │
│                                                   │
│ ┌─[1]──────────────────────────────────────────┐ │
│ │ 🏛️ Supreme Court Judgment              [+]  │ │
│ │ ──────────────────────────────────────────── │ │
│ │ III KK 123/2023 • May 15, 2023 • Polish     │ │
│ │                                              │ │
│ │ The court ruled that in cases involving...  │ │
│ │                                              │ │
│ │ → View full document                         │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Example 2: Three Sources

```
┌──────────────────────────────────────────────────┐
│ AI Response: Based on multiple legal sources...  │
│                                                   │
│ ┌────────────────────────────────────────────┐   │
│ │ 📚 3 sources cited ▼                        │   │
│ └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘

Expanded:
┌──────────────────────────────────────────────────┐
│ 📚 3 sources cited ▲                             │
│                                                   │
│ ┌─[1]──────────────────────────────────────────┐ │
│ │ 🏛️ Supreme Court Judgment              [+]  │ │
│ │ III KK 123/2023 • May 15, 2023              │ │
│ │ Court ruling on narcotics classification... │ │
│ │ → View full document                         │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ ┌─[2]──────────────────────────────────────────┐ │
│ │ 📋 Tax Interpretation                   [+]  │ │
│ │ DIR3/0112/ITPB1/415/2023 • Mar 20, 2023     │ │
│ │ Guidance on currency exchange taxation...   │ │
│ │ → View full document                         │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ ┌─[3]──────────────────────────────────────────┐ │
│ │ 📖 Legal Regulation                     [+]  │ │
│ │ Art. 63 Penal Code • Jan 1, 2020            │ │
│ │ Defines penalties for drug-related...       │ │
│ │ → View full document                         │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Example 3: Many Sources (10+)

```
┌──────────────────────────────────────────────────┐
│ AI Response: Comprehensive analysis shows...     │
│                                                   │
│ ┌────────────────────────────────────────────┐   │
│ │ 📚 12 sources cited • Click to expand ▼    │   │
│ └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘

Expanded (with virtualization):
┌──────────────────────────────────────────────────┐
│ 📚 12 sources cited ▲                  [Filter ▼]│
│                                                   │
│ ┌─[1]──────────────────────────────────────────┐ │
│ │ 🏛️ Supreme Court Judgment              [+]  │ │
│ └──────────────────────────────────────────────┘ │
│ ┌─[2]──────────────────────────────────────────┐ │
│ │ 📋 Tax Interpretation                   [+]  │ │
│ └──────────────────────────────────────────────┘ │
│ ┌─[3]──────────────────────────────────────────┐ │
│ │ 🏛️ Court of Appeals Judgment           [+]  │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ ... (scrollable list) ...                        │
│                                                   │
│ Showing 1-5 of 12 sources                        │
└──────────────────────────────────────────────────┘
```

**Additional Features for 10+ Sources:**
- Add filter dropdown (by document type)
- Show count "Showing X-Y of Z"
- Implement virtual scrolling
- Add "Jump to source [n]" search

---

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Source Filters**
   - Filter by document type
   - Filter by date range
   - Sort by relevance/date

2. **Excerpt Highlighting**
   - Show exact text passages that were cited
   - Highlight matching sections in source preview
   - Link inline citations to specific excerpts

3. **Source Comparison**
   - Select multiple sources to compare side-by-side
   - Highlight contradictions or agreements
   - Generate comparison summary

4. **Citation Export**
   - Export sources in various formats (APA, MLA, Chicago)
   - Copy all citations to clipboard
   - Generate bibliography

5. **Advanced Actions**
   - Share specific source
   - Annotate sources
   - Create notes on sources
   - Flag sources for review

6. **Analytics**
   - Track most-cited documents
   - Show citation frequency
   - Identify trending sources

---

## Testing Checklist

### Functional Testing

- [ ] Sources display correctly with 1 source
- [ ] Sources display correctly with 3 sources
- [ ] Sources display correctly with 10+ sources
- [ ] Sources display correctly with 0 sources (hidden)
- [ ] Expand/collapse animation works smoothly
- [ ] Inline citation tooltips work
- [ ] Clicking [1] scrolls to source card
- [ ] Source card highlight animation works
- [ ] "View document" navigation works
- [ ] "Save to collection" action works
- [ ] Loading state displays correctly
- [ ] Error state displays correctly and retries work
- [ ] Document type icons display correctly
- [ ] Metadata formats correctly (dates, languages)
- [ ] Preview text truncates appropriately

### Responsive Testing

- [ ] Desktop (1920x1080) - Perfect layout
- [ ] Laptop (1366x768) - Readable
- [ ] Tablet portrait (768x1024) - Single column
- [ ] Tablet landscape (1024x768) - Two column option
- [ ] Mobile (375x667) - Touch-friendly
- [ ] Mobile (320x568) - No horizontal scroll

### Accessibility Testing

- [ ] Screen reader announces sources count
- [ ] Tab navigation works logically
- [ ] Enter/Space keys expand/collapse
- [ ] Focus visible on all interactive elements
- [ ] ARIA labels present and correct
- [ ] Color contrast meets WCAG AA
- [ ] Focus management when expanding
- [ ] Keyboard shortcuts documented

### Performance Testing

- [ ] Page load with 10 messages + sources < 2s
- [ ] Expanding sources < 300ms
- [ ] Fetching documents < 1s
- [ ] Smooth 60fps animations
- [ ] No memory leaks on repeated expand/collapse
- [ ] Virtualization works with 50+ sources
- [ ] Cache works across multiple messages

### Browser Testing

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] iOS Safari
- [ ] Android Chrome

---

## Conclusion

This design provides a professional, scalable solution for displaying legal citations in chat messages. The approach balances credibility, usability, and development speed while maintaining flexibility for future enhancements.

**Key Strengths:**
- Clean, minimal design that doesn't clutter chat
- Progressive disclosure keeps experience light
- Rich metadata provides professional credibility
- Fast implementation (3-4 days) using existing components
- Mobile-optimized from the start
- Accessible and keyboard-friendly
- Performant with lazy loading and caching

**Next Steps:**
1. Review and approve design
2. Begin Phase 1 implementation
3. Iterate based on user feedback
4. Plan Phase 2 enhancements

---

## Appendix: Design Assets

### Color Codes

```css
/* Document Type Colors */
--judgment: oklch(0.55 0.20 260.00);        /* #6366F1 approx */
--interpretation: oklch(0.58 0.18 45.00);   /* #F59E0B approx */
--document: oklch(0.52 0.12 180.00);        /* #14B8A6 approx */
--primary: oklch(0.58 0.24 265.00);         /* #6366F1 approx */
```

### Icon Recommendations

From `lucide-react`:
- `Scale` - Court Judgments
- `FileText` - Tax Interpretations
- `BookOpen` - Regulations
- `Gavel` - Case Law
- `ChevronDown` - Expand/collapse
- `Plus` - Save to collection
- `Check` - Saved confirmation
- `ExternalLink` - View document

### Typography

```css
/* Font Families */
--font-sans: Inter, sans-serif;
--font-mono: JetBrains Mono, monospace;

/* Font Sizes */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
```

---

**Document Version:** 1.0
**Last Updated:** 2025-10-10
**Maintained By:** Frontend Team
