# Chat Sources Visual Reference

This document provides visual mockups and examples of how the sources/citations feature appears in different states and scenarios.

---

## Table of Contents

1. [Basic States](#basic-states)
2. [Different Source Counts](#different-source-counts)
3. [Mobile Views](#mobile-views)
4. [Interaction States](#interaction-states)
5. [Error States](#error-states)
6. [Edge Cases](#edge-cases)

---

## Basic States

### 1. Collapsed State (Default)

```
┌─────────────────────────────────────────────────────────────────┐
│ Assistant                                                        │
│                                                                  │
│ Based on the Supreme Court ruling in case III KK 123/2023,     │
│ the definition of "significant amount" [1] of narcotics varies  │
│ depending on the substance type. According to the tax           │
│ interpretation [2], this classification impacts legal           │
│ proceedings.                                                     │
│                                                                  │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 📚 2 sources cited • Click to expand                    ▼ │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│ [👍] [👎] [🔄]                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Visual Elements:**
- Book emoji (📚) indicates sources
- Count "2 sources cited"
- Light hint text "Click to expand"
- Chevron down (▼) indicates expandable
- Muted background color
- Hover effect brightens background

---

### 2. Expanded State

```
┌─────────────────────────────────────────────────────────────────┐
│ Assistant                                                        │
│                                                                  │
│ Based on the Supreme Court ruling in case III KK 123/2023,     │
│ the definition of "significant amount" [1] of narcotics varies  │
│ depending on the substance type. According to the tax           │
│ interpretation [2], this classification impacts legal           │
│ proceedings.                                                     │
│                                                                  │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 📚 2 sources cited                                      ▲ │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌─[1]──────────────────────────────────────────────────────┐   │
│ │ ⚖️  Supreme Court Judgment                            [+]│   │
│ │ ────────────────────────────────────────────────────────│   │
│ │ III KK 123/2023 • May 15, 2023 • Polish                 │   │
│ │                                                          │   │
│ │ The Supreme Court ruled that the classification of      │   │
│ │ narcotics quantities must consider the specific type... │   │
│ │                                                          │   │
│ │ → View full document    Save to collection              │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌─[2]──────────────────────────────────────────────────────┐   │
│ │ 📋 Tax Interpretation                                 [+]│   │
│ │ ────────────────────────────────────────────────────────│   │
│ │ DIR3/0112/ITPB1/415/2023 • March 20, 2023 • Polish     │   │
│ │                                                          │   │
│ │ Guidelines for taxation of currency exchange operations │   │
│ │ involving international transactions and reporting...    │   │
│ │                                                          │   │
│ │ → View full document    Save to collection              │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│ [👍] [👎] [🔄]                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Visual Elements:**
- Chevron up (▲) indicates collapsible
- Each source in bordered card
- Citation number [1], [2] in circular badge
- Document type icon with color coding
- Save button [+] in top right
- Metadata row with • separators
- Preview text (3 lines max)
- Action links at bottom

---

### 3. Loading State

```
┌─────────────────────────────────────────────────────────────────┐
│ Assistant                                                        │
│                                                                  │
│ Based on the Supreme Court ruling...                            │
│                                                                  │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 📚 2 sources cited                                      ▲ │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ ⚪ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░                              │   │
│ │ ────────────────────────────────────────────────────────│   │
│ │ ▓▓▓▓▓▓░░░░░ • ▓▓▓▓░░░░░ • ▓▓▓▓▓░░░░                   │   │
│ │                                                          │   │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░      │   │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░      │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ ⚪ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░                              │   │
│ │ ────────────────────────────────────────────────────────│   │
│ │ ▓▓▓▓▓▓░░░░░ • ▓▓▓▓░░░░░ • ▓▓▓▓▓░░░░                   │   │
│ │                                                          │   │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░      │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Visual Elements:**
- Skeleton screens with pulsing animation
- Gray bars (▓) represent loading content
- Maintains layout structure
- Shows expected number of sources

---

## Different Source Counts

### Single Source

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 📚 1 source cited • Click to expand                     ▼ │  │
│ └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

Expanded:

┌─────────────────────────────────────────────────────────────────┐
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 📚 1 source cited                                       ▲ │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌─[1]──────────────────────────────────────────────────────┐   │
│ │ ⚖️  Supreme Court Judgment                            [+]│   │
│ │ ────────────────────────────────────────────────────────│   │
│ │ III KK 123/2023 • May 15, 2023 • Polish                 │   │
│ │                                                          │   │
│ │ The Supreme Court ruled that the classification of      │   │
│ │ narcotics quantities must consider the specific type... │   │
│ │                                                          │   │
│ │ → View full document    Save to collection              │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

### Three Sources (Typical)

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 📚 3 sources cited • Click to expand                    ▼ │  │
│ └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

Expanded:

┌─────────────────────────────────────────────────────────────────┐
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 📚 3 sources cited                                      ▲ │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌─[1]──────────────────────────────────────────────────────┐   │
│ │ ⚖️  Supreme Court Judgment                            [+]│   │
│ │ III KK 123/2023 • May 15, 2023                          │   │
│ │ Court ruling on narcotics classification criteria...    │   │
│ │ → View full document                                     │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌─[2]──────────────────────────────────────────────────────┐   │
│ │ 📋 Tax Interpretation                                 [+]│   │
│ │ DIR3/0112/ITPB1/415/2023 • March 20, 2023              │   │
│ │ Guidelines for international currency taxation...       │   │
│ │ → View full document                                     │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌─[3]──────────────────────────────────────────────────────┐   │
│ │ 📖 Legal Regulation                                   [+]│   │
│ │ Art. 63 Penal Code • January 1, 2020                    │   │
│ │ Defines criminal penalties for drug-related offenses... │   │
│ │ → View full document                                     │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

### Many Sources (12+)

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 📚 12 sources cited • Click to expand                   ▼ │  │
│ └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

Expanded (with scroll):

┌─────────────────────────────────────────────────────────────────┐
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 📚 12 sources cited                  [Filter: All ▼]   ▲ │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌─[1]──────────────────────────────────────────────────────┐   │
│ │ ⚖️  Supreme Court Judgment                            [+]│   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌─[2]──────────────────────────────────────────────────────┐   │
│ │ 📋 Tax Interpretation                                 [+]│   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌─[3]──────────────────────────────────────────────────────┐   │
│ │ ⚖️  Court of Appeals Judgment                         [+]│   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌─[4]──────────────────────────────────────────────────────┐   │
│ │ 📖 Legal Regulation                                   [+]│   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌─[5]──────────────────────────────────────────────────────┐   │
│ │ 📋 Tax Interpretation                                 [+]│   │
│ └──────────────────────────────────────────────────────────┘   │
│   ⋮                                                              │
│   (scroll for more)                                              │
│                                                                  │
│   Showing 1-5 of 12 sources                                     │
└─────────────────────────────────────────────────────────────────┘
```

**Additional Features:**
- Filter dropdown for document types
- Condensed card view (no preview text by default)
- "Showing X-Y of Z" indicator
- Scroll indicator

---

## Mobile Views

### Mobile - Collapsed (375px width)

```
┌─────────────────────────────┐
│ Assistant                    │
│                              │
│ Based on Supreme Court      │
│ ruling [1], the definition  │
│ varies. Tax interpretation  │
│ [2] provides guidance...    │
│                              │
│ ┌──────────────────────────┐│
│ │ 📚 2 sources cited     ▼│││
│ └──────────────────────────┘│
│                              │
│ [👍] [👎] [🔄]              │
└─────────────────────────────┘
```

---

### Mobile - Expanded

```
┌─────────────────────────────┐
│ 📚 2 sources cited        ▲│
│                              │
│ ┌─[1]─────────────────────┐│
│ │⚖️  Court Judgment    [+]││
│ │─────────────────────────││
│ │III KK 123/2023          ││
│ │May 15, 2023             ││
│ │                         ││
│ │Court ruled on           ││
│ │narcotics amounts...     ││
│ │                         ││
│ │→ View document          ││
│ └─────────────────────────┘│
│                              │
│ ┌─[2]─────────────────────┐│
│ │📋 Tax Interp.       [+]││
│ │─────────────────────────││
│ │DIR3/0112/415/2023       ││
│ │March 20, 2023           ││
│ │                         ││
│ │Taxation guidelines for  ││
│ │currency exchange...     ││
│ │                         ││
│ │→ View document          ││
│ └─────────────────────────┘│
└─────────────────────────────┘
```

**Mobile Optimizations:**
- Reduced padding (12px vs 16px)
- Abbreviated labels
- Metadata wraps to multiple lines
- Larger touch targets (44px min)
- Preview text: 2 lines max
- Single action: "View document"

---

## Interaction States

### 1. Hover State (Desktop)

```
┌─[1]──────────────────────────────────────────────────────────┐
│ ⚖️  Supreme Court Judgment                            [+]│
│ ════════════════════════════════════════════════════════════│ ← subtle shadow
│ III KK 123/2023 • May 15, 2023 • Polish                     │
│                                                              │
│ The Supreme Court ruled that the classification of          │
│ narcotics quantities must consider the specific type...     │
│                                                              │
│ → View full document    Save to collection                  │
│   ^^^^^^^^^^^^^^^^^^^^^                                      │
│   (link underlined on hover)                                 │
└──────────────────────────────────────────────────────────────┘
```

**Hover Effects:**
- Border color changes to primary/30
- Subtle box shadow appears
- Action links underline
- Cursor changes to pointer

---

### 2. Citation Click Highlight

```
┌─[2]──────────────────────────────────────────────────────────┐
│ 📋 Tax Interpretation                                 [+]│
│ ════════════════════════════════════════════════════════════│
│ DIR3/0112/ITPB1/415/2023 • March 20, 2023 • Polish         │
│                                                              │
│ Guidelines for taxation of currency exchange operations     │
│ involving international transactions and reporting...       │
│                                                              │
│ → View full document    Save to collection                  │
└──────────────────────────────────────────────────────────────┘
   ↑
   Highlighted with primary/10 background for 2 seconds
   when user clicks [2] in message text
```

---

### 3. Saved State

```
┌─[1]──────────────────────────────────────────────────────────┐
│ ⚖️  Supreme Court Judgment                            [✓]│ ← Checkmark
│ ────────────────────────────────────────────────────────────│
│ III KK 123/2023 • May 15, 2023 • Polish                     │
│                                                              │
│ The Supreme Court ruled that the classification of          │
│ narcotics quantities must consider the specific type...     │
│                                                              │
│ → View full document    ✓ Saved to collection              │
│                          ^^^^^^^^^^^^^^^^^^^^                │
│                          (green text with checkmark)         │
└──────────────────────────────────────────────────────────────┘
```

---

### 4. Inline Citation Tooltip

```
AI Response text: "According to the Supreme Court ruling [1] and..."
                                                         ^
                                                         |
                  ┌─────────────────────────────────────┐
                  │ Supreme Court Judgment              │
                  │ III KK 123/2023                     │
                  │                                     │
                  │ The Supreme Court ruled that the   │
                  │ classification of narcotics...     │
                  │                                     │
                  │ Click to jump to source            │
                  └─────────────────────────────────────┘
                           Tooltip on hover
```

**Tooltip Features:**
- Appears on hover after 300ms
- Shows document type and ID
- Shows preview (150 chars)
- Click to scroll to source card
- Citation number [1] is underlined and colored primary

---

## Error States

### 1. Failed to Load All Sources

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 📚 3 sources cited                                      ▲ │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ ⚠️  Failed to load sources                              │   │
│ │                                                          │   │
│ │ Could not retrieve document details. This may be due to │   │
│ │ a temporary connection issue.                           │   │
│ │                                                          │   │
│ │ [Try Again]                                             │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Error State Features:**
- Warning icon (⚠️)
- Clear error message
- Helpful context
- Retry button
- Red/error color scheme

---

### 2. Individual Document Failed

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─[1]──────────────────────────────────────────────────────┐   │
│ │ ⚖️  Supreme Court Judgment                            [+]│   │
│ │ III KK 123/2023 • May 15, 2023                          │   │
│ │ Court ruling on narcotics classification criteria...    │   │
│ │ → View full document                                     │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌─[2]──────────────────────────────────────────────────────┐   │
│ │ ⚠️  Document Unavailable                                │   │
│ │ ────────────────────────────────────────────────────────│   │
│ │ This document could not be loaded.                      │   │
│ │ Document ID: abc123-def456-ghi789                       │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌─[3]──────────────────────────────────────────────────────┐   │
│ │ 📖 Legal Regulation                                   [+]│   │
│ │ Art. 63 Penal Code • January 1, 2020                    │   │
│ │ Defines criminal penalties for drug-related offenses... │   │
│ │ → View full document                                     │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Partial Failure Handling:**
- Shows available documents normally
- Failed documents show error state
- Maintains source numbering
- Shows document ID for debugging

---

### 3. No Sources Available (Edge Case)

```
┌─────────────────────────────────────────────────────────────────┐
│ Assistant                                                        │
│                                                                  │
│ I apologize, but I don't have access to specific legal         │
│ documents to answer this question accurately. Please consult   │
│ with a legal professional.                                      │
│                                                                  │
│ (No sources section displayed)                                  │
│                                                                  │
│ [👍] [👎] [🔄]                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**No Sources Behavior:**
- Sources section completely hidden
- No badge displayed
- Clean message presentation

---

## Edge Cases

### 1. Very Long Document Title

```
┌─[1]──────────────────────────────────────────────────────────┐
│ ⚖️  Supreme Court Judgment regarding complex taxation     [+]│
│     matters in cross-border transactions involving...         │
│ ────────────────────────────────────────────────────────────│
│ III KK 123/2023 • May 15, 2023 • Polish                     │
│                                                              │
│ The Supreme Court ruled that...                             │
│                                                              │
│ → View full document    Save to collection                  │
└──────────────────────────────────────────────────────────────┘
```

**Handling:**
- Title wraps to multiple lines
- Max 3 lines, then ellipsis
- Icon stays aligned at top

---

### 2. Missing Metadata

```
┌─[1]──────────────────────────────────────────────────────────┐
│ ⚖️  Court Judgment                                        [+]│
│ ────────────────────────────────────────────────────────────│
│ Document ID: abc123-def456                                   │
│                                                              │
│ (No preview available)                                       │
│                                                              │
│ → View full document                                         │
└──────────────────────────────────────────────────────────────┘
```

**Handling:**
- Shows generic document type
- Displays document ID
- Shows "(No preview available)" if no summary/thesis/text
- Still allows viewing full document

---

### 3. Very Long Preview Text

```
┌─[1]──────────────────────────────────────────────────────────┐
│ ⚖️  Supreme Court Judgment                                [+]│
│ ────────────────────────────────────────────────────────────│
│ III KK 123/2023 • May 15, 2023 • Polish                     │
│                                                              │
│ The Supreme Court ruled that the classification of          │
│ narcotics quantities must consider the specific type of     │
│ substance, the purity level, and the intended use. This...  │
│                                                              │
│ → View full document    Show more                           │
└──────────────────────────────────────────────────────────────┘
```

**Handling:**
- CSS line-clamp: 3 lines
- Ellipsis (...) after truncation
- Optional "Show more" link to expand

---

### 4. Multiple Languages

```
┌─[1]──────────────────────────────────────────────────────────┐
│ ⚖️  Supreme Court Judgment                                [+]│
│ ────────────────────────────────────────────────────────────│
│ III KK 123/2023 • May 15, 2023 • 🇵🇱 Polish                  │
│                                                              │
│ Sąd Najwyższy orzekł, że klasyfikacja znacznych ilości...  │
│                                                              │
│ → View full document                                         │
└──────────────────────────────────────────────────────────────┘
│                                                              │
┌─[2]──────────────────────────────────────────────────────────┐
│ 📋 Tax Interpretation                                     [+]│
│ ────────────────────────────────────────────────────────────│
│ DIR3/0112/ITPB1/415/2023 • March 20, 2023 • 🇬🇧 English    │
│                                                              │
│ Guidelines for taxation of currency exchange operations...  │
│                                                              │
│ → View full document                                         │
└──────────────────────────────────────────────────────────────┘
```

**Handling:**
- Language flag emoji (optional)
- Language name in metadata
- Preview text in original language
- No auto-translation (keep authentic)

---

### 5. Dark Mode

```
┌─────────────────────────────────────────────────────────────────┐
│ ████████████████████████████████████████████████ (Dark BG)     │
│                                                                  │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ 📚 2 sources cited • Click to expand      ▼ (Muted Gray) │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│ Expanded:                                                        │
│                                                                  │
│ ┌─[1]──────────────────────────────────────────────────────┐   │
│ │ ⚖️  Supreme Court Judgment              [+] (Light text)│   │
│ │ ──────────────────────────────────────────── (Dark line)│   │
│ │ III KK 123/2023 • May 15, 2023 • Polish (Gray text)     │   │
│ │                                                          │   │
│ │ Court ruled on classification... (Light gray text)      │   │
│ │                                                          │   │
│ │ → View full document (Primary blue)                     │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Dark Mode Colors:**
- Background: oklch(0.25 0 0) - Dark gray
- Text: oklch(0.92 0 0) - Light gray
- Borders: oklch(0.40 0 0) - Medium gray
- Primary: oklch(0.65 0.24 265.00) - Brighter blue
- Muted: oklch(0.27 0 0) - Slightly lighter gray

---

## Animation Sequences

### Expand Animation (300ms)

```
Frame 1 (0ms):
┌───────────────────────────────────────┐
│ 📚 2 sources cited              ▼    │  opacity: 1
└───────────────────────────────────────┘  height: 48px

Frame 2 (100ms):
┌───────────────────────────────────────┐
│ 📚 2 sources cited              ⤵    │  opacity: 1
└───────────────────────────────────────┘  height: 60px
┌───────────────────────────────────────┐
│ [1] Supreme Court...                  │  opacity: 0.3
└───────────────────────────────────────┘  transform: translateY(-8px)

Frame 3 (200ms):
┌───────────────────────────────────────┐
│ 📚 2 sources cited              ▲    │  opacity: 1
└───────────────────────────────────────┘  height: auto
┌─[1]───────────────────────────────────┐
│ ⚖️  Supreme Court Judgment        [+]│  opacity: 0.7
│ III KK 123/2023 • May 15, 2023       │  transform: translateY(-4px)
└───────────────────────────────────────┘

Frame 4 (300ms - Complete):
┌───────────────────────────────────────┐
│ 📚 2 sources cited              ▲    │
└───────────────────────────────────────┘
┌─[1]───────────────────────────────────┐
│ ⚖️  Supreme Court Judgment        [+]│  opacity: 1
│ III KK 123/2023 • May 15, 2023       │  transform: translateY(0)
│ Court ruled on narcotics...          │
│ → View full document                 │
└───────────────────────────────────────┘
┌─[2]───────────────────────────────────┐
│ 📋 Tax Interpretation             [+]│  opacity: 1
│ DIR3/0112/415/2023 • Mar 20, 2023    │  transform: translateY(0)
│ Guidelines for taxation...           │  delay: 50ms
│ → View full document                 │
└───────────────────────────────────────┘
```

---

## Responsive Breakpoints

### Desktop (1920px)
- Max content width: 800px
- Full source cards with all metadata
- 2-column layout for 6+ sources (optional)
- Preview: 3 lines

### Laptop (1366px)
- Max content width: 700px
- Full source cards
- Single column
- Preview: 3 lines

### Tablet (1024px)
- Max content width: 600px
- Full source cards
- Reduced padding: 14px
- Preview: 2 lines

### Tablet Portrait (768px)
- Max content width: 100%
- Compact source cards
- Padding: 12px
- Preview: 2 lines
- Metadata wraps

### Mobile (375px)
- Full width
- Minimal padding: 12px
- Abbreviated labels
- Preview: 2 lines
- Single action button
- Larger touch targets: 44px min

### Small Mobile (320px)
- Full width
- Minimal padding: 8px
- Very compact cards
- Preview: 1 line
- Essential info only

---

## Color Reference

### Light Mode

**Document Types:**
- Judgment: `#6366F1` (Indigo)
- Tax Interpretation: `#F59E0B` (Amber)
- Regulation: `#14B8A6` (Teal)
- Primary: `#6366F1` (Indigo)

**UI Elements:**
- Background: `#FFFFFF`
- Text: `#0F172A`
- Muted Text: `#64748B`
- Border: `#E2E8F0`
- Hover Background: `#F8FAFC`

### Dark Mode

**Document Types:**
- Judgment: `#818CF8` (Lighter Indigo)
- Tax Interpretation: `#FCD34D` (Lighter Amber)
- Regulation: `#5EEAD4` (Lighter Teal)
- Primary: `#818CF8` (Lighter Indigo)

**UI Elements:**
- Background: `#0F172A`
- Text: `#F1F5F9`
- Muted Text: `#94A3B8`
- Border: `#334155`
- Hover Background: `#1E293B`

---

This visual reference provides a complete picture of how the sources/citations feature should look and behave across all states, devices, and scenarios.
