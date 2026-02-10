# Styling Guide 2.0

## Legal Glassmorphism 2.0 Design System

**Version**: 2.0  
**Last Updated**: 2025-01-XX  
**Status**: Active

---

## Table of Contents

1. [Introduction](#introduction)
2. [Design Philosophy](#design-philosophy)
3. [Legal Glassmorphism 2.0](#legal-glassmorphism-20)
4. [Color System](#color-system)
5. [Component Patterns](#component-patterns)
6. [Icon Protocol](#icon-protocol)
7. [Typography](#typography)
8. [Spacing & Layout](#spacing--layout)
9. [Dark Mode Guidelines](#dark-mode-guidelines)
10. [Accessibility](#accessibility)
11. [Implementation Guide](#implementation-guide)
12. [Migration Guide](#migration-guide)
13. [Reference Tables](#reference-tables)

---

## Introduction

### Overview

Styling Guide 2.0 introduces **Legal Glassmorphism 2.0**, a refined design system optimized for legal technology applications. This guide provides comprehensive standards for creating consistent, accessible, and professional user interfaces.

### Key Principles

1. **Subtlety First**: Extremely subtle gradients and effects
2. **Consistency**: Centralized color definitions and standardized patterns
3. **Accessibility**: WCAG compliant with enhanced focus states
4. **Professionalism**: Authoritative aesthetic suitable for legal applications
5. **Dark Mode Excellence**: Clean, minimal dark mode experience

### What's New in 2.0

- **Legal Glassmorphism 2.0**: Heavy glass card system with standardized specifications
- **Purple Removal**: Simplified color palette (primary + indigo + blue only)
- **Extremely Subtle Gradients**: Reduced opacity for professional appearance
- **Icon Protocol**: Stroke-based icon rendering system
- **Centralized Colors**: Single source of truth for all color definitions
- **Enhanced States**: Improved hover, focus, and active states

---

## Design Philosophy

### Legal Professionalism

The design system prioritizes:

- **Authority**: Authoritative color choices and typography
- **Clarity**: High contrast, readable text
- **Refinement**: Subtle effects that don't distract
- **Trust**: Professional appearance that builds confidence

### Visual Hierarchy

1. **Primary Actions**: Bold, clear, high contrast
2. **Secondary Content**: Subtle backgrounds, muted colors
3. **Tertiary Elements**: Extremely subtle, minimal visual weight

### Color Philosophy

- **Limit Design Colors**: Primary, indigo, and blue only
- **Semantic Colors**: Use for states (success, error, warning)
- **Neutral Base**: Slate scale for backgrounds and borders
- **Subtle Accents**: Extremely low opacity for depth

---

## Legal Glassmorphism 2.0

### Specification

Legal Glassmorphism 2.0 defines a standardized glass card system with precise specifications:

#### Light Mode (Heavy Glass Card)

```css
/* Base Properties */
background: rgba(255, 255, 255, 0.9);        /* 90% White */
backdrop-filter: blur(32px) saturate(200%);  /* Heavy Blur */
border: 1px solid #FFFFFF;                   /* Rim Light: 100% White */
border-radius: 24px;                        /* Standard Corner Radius */
box-shadow: 0 8px 30px rgba(148, 163, 184, 0.15); /* Colored Shadow */
```

#### Dark Mode (Legal Glass Night Mode)

```css
/* Base Properties */
background: rgba(30, 41, 59, 0.6);          /* Slate 800 with transparency */
backdrop-filter: blur(32px) saturate(200%);  /* Heavy Blur */
border: 1px solid rgba(255, 255, 255, 0.1);  /* 10% White Border */
border-radius: 24px;                        /* Standard Corner Radius */
box-shadow: none;                            /* No Shadows */
```

### Hover States

#### Light Mode Hover

```css
/* Enhanced Hover */
border: 1px solid #FFFFFF;                   /* Full White Border */
background: rgba(255, 255, 255, 0.98);      /* 98% White */
box-shadow: 
  0 12px 40px rgba(148, 163, 184, 0.25),    /* Enhanced Shadow */
  inset 0 1px 0 rgba(255, 255, 255, 1);    /* Inset Rim Light */
transform: scale(1.02) translateY(-0.5px);  /* Subtle Lift */
```

#### Dark Mode Hover

```css
/* Subtle Hover */
border: 1px solid rgba(255, 255, 255, 0.12); /* 12% White Border */
background: rgba(30, 41, 59, 0.7);          /* Slightly Brighter */
box-shadow: none;                            /* No Shadows */
transform: scale(1.01);                      /* Minimal Scale */
```

### Implementation

Use the `BaseCard` component with Legal Glassmorphism 2.0 styling:

```tsx
import { BaseCard } from '@/lib/styles/components/base-card';

<BaseCard
  description="Card content"
  variant="default"  // or "light"
  highlighted={false}  // Optional vibrant gradient
/>
```

### Variants

#### Default Variant
- Full Legal Glassmorphism 2.0 styling
- Standard gradient overlay
- Suitable for primary content

#### Light Variant
- Lighter background (muted gradient)
- Subtle overlay
- Suitable for panels, sections, forms

#### Highlighted Mode
- Enhanced gradient overlay
- Additional glow effect
- Suitable for emphasized content

---

## Color System

### Color Palette

#### Design Colors (3 Core Colors)

1. **Primary** (CSS Variable: `--primary`)
   - Light: `oklch(0.58 0.24 265.00)`
   - Dark: `oklch(0.65 0.24 265.00)`
   - Usage: Primary actions, highlights, active states

2. **Indigo** (Tailwind: `indigo-400/500`)
   - Light: `indigo-400`
   - Dark: `indigo-500`
   - Usage: Gradients, accents, secondary elements

3. **Blue** (Tailwind: `blue-400/500`)
   - Light: `blue-400`
   - Dark: `blue-500`
   - Usage: Backgrounds, document types, tertiary elements

#### Semantic Colors

- **Success**: `oklch(0.65 0.18 145.00)` - Green
- **Error**: `oklch(0.62 0.23 25.00)` - Red
- **Warning**: `oklch(0.75 0.15 85.00)` - Yellow
- **Info**: `oklch(0.60 0.20 230.00)` - Blue

#### Neutral Colors

- **Slate Scale**: `slate-50` to `slate-950`
- **Usage**: Backgrounds, borders, text

### Opacity Scale

Standardized opacity values for consistent styling:

| Opacity | Value | Usage |
|--------|-------|-------|
| `/1` | 1% | Extremely subtle backgrounds |
| `/1.5` | 1.5% | Very subtle backgrounds |
| `/2` | 2% | Subtle backgrounds |
| `/3` | 3% | Light backgrounds |
| `/5` | 5% | Card overlays |
| `/8` | 8% | Hover overlays |
| `/10` | 10% | Active states |
| `/15` | 15% | Focus states |
| `/20` | 20% | Hover backgrounds |
| `/30` | 30% | Secondary backgrounds |
| `/50` | 50% | Semi-transparent overlays |
| `/80` | 80% | Strong overlays |

### Gradient Patterns

#### Primary Gradients

```tsx
// Simple Primary Gradient
'from-primary to-primary/90'

// Primary with Opacity Variation
'from-primary/10 to-primary/5'

// Primary Hover
'hover:from-primary/90 hover:to-primary/80'
```

#### Multi-Color Gradients (Extremely Subtle)

```tsx
// Card Background (Extremely Subtle)
'bg-gradient-to-br from-blue-400/1 via-indigo-400/0.5 to-blue-400/0.5'

// Card Overlay (Subtle)
'bg-gradient-to-br from-primary/3 via-blue-400/2 via-transparent to-blue-400/3'
```

#### Button Gradients

```tsx
// Primary Button
'from-primary to-primary/90'

// Primary Button Hover
'hover:from-primary/90 hover:to-primary/80'
```

### Centralized Color Definitions

All colors are defined in centralized files:

- **Surfaces**: `frontend/lib/styles/colors/surfaces.ts`
- **Gradients**: `frontend/lib/styles/colors/gradients.ts`

**Always import from centralized definitions:**

```tsx
import { cardBackgroundGradients } from '@/lib/styles/colors/surfaces';
import { buttonGradients } from '@/lib/styles/colors/gradients';
```

---

## Component Patterns

### BaseCard

The primary card component with Legal Glassmorphism 2.0 styling.

```tsx
import { BaseCard } from '@/lib/styles/components/base-card';

<BaseCard
  title="Card Title"
  description="Card description"
  icon={IconComponent}
  variant="default"  // or "light"
  highlighted={false}
  onClick={() => {}}
/>
```

**Variants:**
- `default`: Full Legal Glassmorphism 2.0
- `light`: Lighter background, subtle overlay

**Props:**
- `variant`: `'default' | 'light'`
- `highlighted`: `boolean` - Enhanced gradient for emphasis
- `clickable`: `boolean` - Makes card interactive
- `skeleton`: `boolean` - Loading state

### LightCard

Lightweight card for panels and sections.

```tsx
import { LightCard } from '@/lib/styles/components/light-card';

<LightCard
  title="Panel Title"
  padding="md"  // "sm" | "md" | "lg"
  showBorder={true}
  showShadow={false}
>
  Content here
</LightCard>
```

**Features:**
- Muted background gradient
- Subtle overlay
- Legal Glassmorphism 2.0 styling
- Configurable padding and borders

### IconButton

Enhanced icon button with multiple state options.

```tsx
import { IconButton } from '@/lib/styles/components/icon-button';

<IconButton
  icon={X}
  onClick={() => {}}
  size="md"  // "sm" | "md" | "lg"
  variant="default"  // "default" | "error" | "primary" | "muted"
  enhancedHover={false}
  enhancedFocus={false}
  enhancedActive={false}
/>
```

**Enhanced States:**
- `enhancedHover`: Stronger shadows, larger scale, visible borders
- `enhancedFocus`: Larger focus ring, stronger opacity, larger offset
- `enhancedActive`: Stronger scale reduction, more visible opacity change

### PrimaryButton

Primary action button with simplified gradient.

```tsx
import { PrimaryButton } from '@/lib/styles/components/primary-button';

<PrimaryButton
  onClick={() => {}}
  disabled={false}
>
  Button Text
</PrimaryButton>
```

**Styling:**
- Primary gradient: `from-primary to-primary/90`
- Hover: `hover:from-primary/90 hover:to-primary/80`
- Focus: Enhanced ring with offset

---

## Icon Protocol

### Stroke-Based Rendering

All sidebar icons must use stroke-based rendering:

#### Rules

1. **Canvas Size**: `1.25rem x 1.25rem` (20px)
2. **Fill Rule**: `fill="none"` (MANDATORY)
3. **Color Rule**: `stroke="currentColor"` (inherits text color)
4. **Idle State**: `stroke-width: 1.5` (thin/elegant)
5. **Active State**: `stroke-width: 2.5` (bold/emphasized)

#### Implementation

```tsx
// Icon Component
<Icon
  className="h-5 w-5"
  fill="none"
  stroke="currentColor"
  strokeWidth={1.5}  // Idle: 1.5, Active: 2.5
/>
```

#### CSS Overrides

```css
/* Idle State */
[data-sidebar="menu-button"] svg {
  fill: none !important;
  stroke: currentColor !important;
  stroke-width: 1.5 !important;
}

/* Active State */
[data-sidebar="menu-button"][data-active="true"] svg {
  stroke-width: 2.5 !important;
}
```

#### Overflow Fix

Icons must be able to overflow containers on hover:

```css
[data-sidebar="menu-button"] svg {
  overflow: visible !important;
}

[data-sidebar="menu-item"]:hover {
  z-index: 10;
  position: relative;
}
```

---

## Typography

### Headlines

**Light Mode**: Midnight Navy (`#0F172A`)  
**Dark Mode**: Slate 100 (`#F1F5F9`)

```tsx
<h3 className="text-[#0F172A] dark:text-[#F1F5F9]">
  Headline Text
</h3>
```

### Legal Text

```tsx
// Legal-specific typography
<p className="text-legal">Legal text</p>

// Case numbers
<span className="text-case-number">Case #12345</span>

// Dense legal text
<p className="text-legal-dense">Dense legal content</p>

// Expanded legal text
<p className="text-legal-expanded">Expanded legal content</p>
```

### Font Families

- **Sans**: Inter (UI elements)
- **Serif**: Source Serif 4 (body text)
- **Mono**: JetBrains Mono (code, legal references)

---

## Spacing & Layout

### Corner Radius

**Standard**: `24px` (`rounded-[24px]`)

All cards use the standard 24px corner radius for consistency.

### Padding

**Standard Card Padding**: `24px` to `32px` (`p-6` to `p-8`)

**LightCard Padding Options:**
- `sm`: `p-4` (16px)
- `md`: `p-6` (24px)
- `lg`: `p-8` (32px)

### Touch Targets

**Minimum**: `44x44px` (`h-11 w-11`)

All interactive elements must meet minimum touch target size.

---

## Dark Mode Guidelines

### Principles

1. **No Shadows**: Dark mode uses minimal or no shadows
2. **Subtle Borders**: 10-12% white borders for definition
3. **Brightness Hover**: Subtle brightness increase on hover
4. **Clean Aesthetic**: Minimal visual noise

### Color Adjustments

- **Backgrounds**: Slate 800 with transparency
- **Borders**: 10% white opacity
- **Text**: High contrast (Slate 100)
- **Shadows**: None or extremely subtle

### Implementation

Always provide dark mode variants:

```tsx
className="bg-white dark:bg-slate-900/60 border-white dark:border-white/10"
```

---

## Accessibility

### Focus States

All interactive elements must have visible focus indicators:

```tsx
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
```

**Enhanced Focus** (for critical elements):

```tsx
className="focus-visible:ring-4 focus-visible:ring-primary/80 focus-visible:ring-offset-4"
```

### Contrast Ratios

- **Normal Text**: Minimum 4.5:1
- **Large Text**: Minimum 3:1
- **Interactive Elements**: Minimum 3:1

### Touch Targets

- **Minimum Size**: 44x44px
- **Spacing**: Minimum 8px between targets

### Keyboard Navigation

- All interactive elements must be keyboard accessible
- Focus order must be logical
- Skip links for main content

---

## Implementation Guide

### Step 1: Import Centralized Colors

```tsx
import { cardBackgroundGradients } from '@/lib/styles/colors/surfaces';
import { buttonGradients } from '@/lib/styles/colors/gradients';
```

### Step 2: Apply Legal Glassmorphism 2.0

```tsx
<div className="bg-[rgba(255,255,255,0.9)] backdrop-blur-[32px] backdrop-saturate-[200%] border-[1px] border-solid border-[#FFFFFF] rounded-[24px] shadow-[0_8px_30px_rgba(148,163,184,0.15)] dark:bg-[rgba(30,41,59,0.6)] dark:border-[rgba(255,255,255,0.1)] dark:shadow-none">
  Content
</div>
```

### Step 3: Use Standardized Opacity

```tsx
// Extremely subtle background
className="bg-gradient-to-br from-blue-400/1 via-indigo-400/0.5 to-blue-400/0.5"

// Subtle overlay
className="bg-gradient-to-br from-primary/3 via-blue-400/2 to-primary/3"
```

### Step 4: Add Hover States

```tsx
className="hover:border-white dark:hover:border-white/12 hover:bg-[rgba(255,255,255,0.98)] dark:hover:bg-[rgba(30,41,59,0.7)] hover:shadow-[0_12px_40px_rgba(148,163,184,0.25)] dark:hover:shadow-none hover:scale-[1.02] hover:-translate-y-0.5"
```

### Step 5: Implement Focus States

```tsx
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
```

---

## Migration Guide

### From 1.0 to 2.0

#### 1. Remove Purple from Gradients

**Before:**
```tsx
'from-primary via-indigo-500 to-purple-500'
```

**After:**
```tsx
'from-primary to-primary/90'
```

#### 2. Reduce Opacity

**Before:**
```tsx
'from-blue-400/15 via-indigo-400/10 to-purple-400/8'
```

**After:**
```tsx
'from-blue-400/1 via-indigo-400/0.5 to-blue-400/0.5'
```

#### 3. Apply Legal Glassmorphism 2.0

**Before:**
```tsx
<div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-xl">
```

**After:**
```tsx
<div className="bg-[rgba(255,255,255,0.9)] backdrop-blur-[32px] backdrop-saturate-[200%] border-[1px] border-solid border-[#FFFFFF] rounded-[24px] shadow-[0_8px_30px_rgba(148,163,184,0.15)] dark:bg-[rgba(30,41,59,0.6)] dark:border-[rgba(255,255,255,0.1)] dark:shadow-none">
```

#### 4. Use Centralized Colors

**Before:**
```tsx
className="bg-gradient-to-br from-blue-400/15 via-indigo-400/10 to-purple-400/8"
```

**After:**
```tsx
import { cardBackgroundGradients } from '@/lib/styles/colors/surfaces';

className={cardBackgroundGradients.base.light}
```

---

## Reference Tables

### Opacity Scale Reference

| Opacity | Value | Common Usage |
|---------|-------|--------------|
| `/1` | 1% | Extremely subtle card backgrounds |
| `/1.5` | 1.5% | Very subtle document card backgrounds |
| `/2` | 2% | Subtle overlays |
| `/3` | 3% | Light card overlays |
| `/5` | 5% | Standard overlays |
| `/8` | 8% | Hover overlays |
| `/10` | 10% | Active states, glow effects |
| `/15` | 15% | Focus states, empty state icons |
| `/20` | 20% | Hover backgrounds |
| `/30` | 30% | Secondary backgrounds |
| `/50` | 50% | Semi-transparent elements |
| `/80` | 80% | Strong overlays |

### Color Shade Reference

| Shade | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `50` | `blue-50` | `blue-950` | Very light/dark backgrounds |
| `200` | `blue-200` | `blue-800` | Borders |
| `400` | `blue-400` | - | Light mode standard (design colors) |
| `500` | - | `blue-500` | Dark mode standard (design colors) |
| `950` | `blue-950` | - | Very dark (light mode) |

### Component Color Reference

| Component | Primary Colors | Opacity Values | Notes |
|-----------|----------------|----------------|-------|
| `BaseCard` | primary, blue-400/500, indigo-400/500 | /1, /0.5, /3, /5 | Legal Glassmorphism 2.0 |
| `LightCard` | muted, primary, blue-400/500 | /1, /3, /5 | Lighter variant |
| `IconButton` | primary, muted, destructive | /10, /30 | Enhanced states available |
| `PrimaryButton` | primary | /90, /80 | Simplified gradient |
| `DocumentCard` | blue-400/500, indigo-400/500 | /1, /1.5, /2 | Extremely subtle |

---

## Quick Reference

### Legal Glassmorphism 2.0 Classes

```tsx
// Base Card
"bg-[rgba(255,255,255,0.9)] backdrop-blur-[32px] backdrop-saturate-[200%] border-[1px] border-solid border-[#FFFFFF] rounded-[24px] shadow-[0_8px_30px_rgba(148,163,184,0.15)] dark:bg-[rgba(30,41,59,0.6)] dark:border-[rgba(255,255,255,0.1)] dark:shadow-none"

// Hover
"hover:border-white dark:hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.98)] dark:hover:bg-[rgba(30,41,59,0.7)] hover:shadow-[0_12px_40px_rgba(148,163,184,0.25)] dark:hover:shadow-none hover:scale-[1.02] hover:-translate-y-0.5"
```

### Common Gradients

```tsx
// Primary Button
"from-primary to-primary/90"

// Card Background (Extremely Subtle)
"bg-gradient-to-br from-blue-400/1 via-indigo-400/0.5 to-blue-400/0.5"

// Card Overlay
"bg-gradient-to-br from-primary/3 via-blue-400/2 to-primary/3"
```

### Typography

```tsx
// Headlines
"text-[#0F172A] dark:text-[#F1F5F9]"

// Legal Text
"text-legal"

// Case Numbers
"text-case-number"
```

---

*For detailed component-specific guidelines, see the [Component Colors Cheat Sheet](./COMPONENT_COLORS_CHEAT_SHEET.md).*

*For quick reference, see the [Colors Quick Reference](./COLORS_QUICK_REFERENCE.md).*

