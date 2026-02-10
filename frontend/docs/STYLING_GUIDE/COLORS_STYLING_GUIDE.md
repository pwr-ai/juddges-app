# Colors Styling Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Color System Overview](#color-system-overview)
3. [Color Palette Reference](#color-palette-reference)
4. [Opacity Scale](#opacity-scale)
5. [Component Color Guidelines](#component-color-guidelines)
6. [Usage Patterns](#usage-patterns)
7. [State Colors](#state-colors)
8. [Dark Mode Guidelines](#dark-mode-guidelines)
9. [Accessibility Guidelines](#accessibility-guidelines)
10. [Common Patterns](#common-patterns)
11. [Implementation Guide](#implementation-guide)
12. [Reference Tables](#reference-tables)

---

## Introduction

### Overview

This guide documents the standardized color system used across all components in the application. It serves as the **single source of truth** for color usage, providing developers and designers with clear guidelines, examples, and best practices.

### Purpose and Goals

- **Consistency**: Ensure consistent color usage across all components
- **Accessibility**: Meet WCAG contrast requirements and support colorblind users
- **Maintainability**: Make it easy to update and maintain the color system
- **Developer Experience**: Provide clear guidelines and examples

### Design Principles

1. **Standardization**: Use standardized opacity values, color shades, and patterns
2. **Accessibility First**: All colors meet WCAG contrast requirements
3. **Dark Mode Support**: Comprehensive dark mode coverage
4. **Semantic Colors**: Use semantic colors for states (success, error, warning)
5. **Design Colors**: Limit to 3 core design colors (Primary, Indigo+Purple, Blue)

### How to Use This Guide

- **Quick Lookup**: Use the [Quick Reference](./COLORS_QUICK_REFERENCE.md) for common patterns
- **Component Colors**: See [Component Color Guidelines](#component-color-guidelines) for specific components
- **Implementation**: See [Implementation Guide](#implementation-guide) for code examples
- **Troubleshooting**: See [Reference Tables](#reference-tables) for complete lists

---

## Color System Overview

### Color Token Architecture

The color system uses a two-tier architecture:

1. **CSS Variables** (`globals.css`): Core colors, semantic colors, base colors
2. **Tailwind Classes**: Design colors, gradients, opacity variations

### CSS Variable Naming Conventions

**Pattern**: `--{category}-{name}`

**Categories**:
- `--primary`: Main brand color
- `--secondary`, `--muted`, `--accent`: Supporting colors
- `--destructive`, `--success`, `--warning`, `--error`, `--info`: Semantic colors
- `--background`, `--foreground`: Base colors
- `--border`, `--input`, `--ring`: UI element colors

**Example**:
```css
--primary: oklch(0.58 0.24 265.00);
--destructive: oklch(0.64 0.21 25.33);
```

### Color Categories

1. **Design Colors** (3 core colors)
   - Primary (CSS variable)
   - Indigo + Purple (gradient)
   - Blue (backgrounds)

2. **Semantic Colors**
   - Success, Error, Warning, Info

3. **Neutral Colors**
   - Slate scale (50-950)

4. **Gradient Colors**
   - Primary gradients
   - Card gradients
   - Accent gradients

### Dark Mode Support

All colors have dark mode variants defined in `.dark` selector in `globals.css`.

**Pattern**: Use `dark:` prefix for Tailwind classes

**Example**:
```tsx
"bg-blue-400/30 dark:bg-blue-500/30"
```

### Accessibility Considerations

- **Contrast**: Minimum 4.5:1 for normal text, 3:1 for large text
- **Colorblind Support**: Use ring/border changes in addition to color changes
- **Focus States**: All interactive elements have visible focus indicators
- **Touch Targets**: Minimum 44x44px for all interactive elements

---

## Color Palette Reference

### Primary Colors

#### Primary (Brand Color)

**CSS Variable**: `--primary`

**Light Mode**: `oklch(0.58 0.24 265.00)`
**Dark Mode**: `oklch(0.65 0.24 265.00)`

**Usage**:
- Primary actions (buttons, links)
- Highlights and accents
- Focus states
- Active/selected states

**Examples**:
```tsx
// Button background
className="bg-primary"

// Text color
className="text-primary"

// Border color
className="border-primary/30"
```

#### Indigo + Purple (Gradient)

**Tailwind**: `indigo-400/500` + `purple-400/500`

**Light Mode**: `indigo-400` + `purple-400`
**Dark Mode**: `indigo-500` + `purple-500`

**Usage**:
- Card backgrounds
- Button backgrounds
- Gradient overlays
- Accent effects

**Examples**:
```tsx
// Card background gradient
className="bg-gradient-to-br from-blue-400/30 via-indigo-400/20 via-purple-400/20 to-purple-400/15"
className="dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/20 dark:via-purple-500/20 dark:to-purple-500/15"
```

#### Blue (Background)

**Tailwind**: `blue-400/500`

**Light Mode**: `blue-400`
**Dark Mode**: `blue-500`

**Usage**:
- Background gradients
- Subtle accents
- Card backgrounds

**Examples**:
```tsx
// Background gradient start
className="from-blue-400/30"
className="dark:from-blue-500/30"
```

---

### Semantic Colors

#### Success

**CSS Variable**: `--success`
**Tailwind**: `success` or `green-*`

**Usage**: Success states, confirmations, positive feedback

**Example**:
```tsx
className="bg-success text-success-foreground"
```

#### Error

**CSS Variable**: `--error`
**Tailwind**: `error` or `red-*`

**Usage**: Error states, destructive actions, warnings

**Example**:
```tsx
className="bg-error text-error-foreground"
```

#### Warning

**CSS Variable**: `--warning`
**Tailwind**: `warning` or `amber-*`

**Usage**: Warning states, cautions

**Example**:
```tsx
className="bg-warning text-warning-foreground"
```

#### Info

**CSS Variable**: `--info`
**Tailwind**: `info` or `blue-*`

**Usage**: Informational states

**Example**:
```tsx
className="bg-info text-info-foreground"
```

#### Semantic Color Shade Exceptions

**Important**: While design colors (blue, indigo, purple) use the standard 400/500 shade range, semantic colors may use different shade ranges for better visibility and visual hierarchy.

**Red (Error/Destructive)**:
- **Standard Range**: `red-400` to `red-500` (for subtle effects)
- **Exception Range**: `red-600` to `red-950` (for buttons, warnings, destructive actions)
- **Reason**: Higher contrast needed for critical actions
- **Example**: `delete-button.tsx` uses `red-600` to `red-950` for gradient backgrounds

**Green (Success)**:
- **Standard Range**: `green-400` to `green-500` (recommended)
- **Usage**: Success states, confirmations

**Amber (Warning)**:
- **Standard Range**: `amber-400` to `amber-500` (for subtle warnings)
- **Exception Range**: `amber-50` to `amber-950` (for warning containers, error messages)
- **Reason**: Full range needed for warning backgrounds and text contrast
- **Example**: `document-card.tsx` uses `amber-50`, `amber-200`, `amber-300`, `amber-500`, `amber-900`, `amber-950` for error warnings

**Guideline**: 
- Use 400/500 range for subtle semantic color effects
- Use 600-950 range for buttons, critical actions, and high-contrast needs
- Use 50-300 range for light backgrounds and subtle warnings

---

### Neutral Colors

#### Slate Scale

**Tailwind**: `slate-{shade}` (50-950)

**Common Usage**:
- **50**: Very light backgrounds
- **200**: Borders, dividers
- **400**: Medium text, borders
- **700**: Dark text (light mode)
- **800**: Dark backgrounds, borders (dark mode)
- **900**: Very dark backgrounds
- **950**: Maximum dark backgrounds

**Examples**:
```tsx
// Border
className="border-slate-200/50 dark:border-slate-800/50"

// Background
className="bg-slate-50 dark:bg-slate-900"

// Text
className="text-slate-700 dark:text-slate-300"
```

---

## Opacity Scale

### Standard Opacity Values

The system uses a **6-value opacity scale** for consistency:

| Opacity | Value | Usage | Example |
|---------|-------|-------|---------|
| `/10` | 10% | Very subtle backgrounds, overlays | `bg-primary/10` |
| `/15` | 15% | Subtle backgrounds, light overlays | `bg-primary/15` |
| `/20` | 20% | Light backgrounds, subtle effects | `bg-primary/20` |
| `/30` | 30% | Medium backgrounds, card backgrounds | `bg-primary/30` |
| `/50` | 50% | Hover overlays, medium effects | `bg-primary/50` |
| `/80` | 80% | Strong overlays, prominent effects | `bg-primary/80` |

### When to Use Each Opacity

- **`/10`**: Very subtle effects, minimal contrast
- **`/15`**: Subtle backgrounds, light overlays
- **`/20`**: Light backgrounds, subtle effects
- **`/30`**: Medium backgrounds, card backgrounds (most common)
- **`/50`**: Hover overlays, medium effects
- **`/80`**: Strong overlays, prominent effects

### Examples

```tsx
// Very subtle overlay
className="bg-primary/10"

// Card background
className="bg-blue-400/30 dark:bg-blue-500/30"

// Hover overlay
className="bg-white/50 dark:bg-black/50"
```

---

## Component Color Guidelines

### Buttons

#### Primary Button

**Background**: Gradient from blue-400/30 via indigo-400/30 via purple-400/30 to purple-400/20
**Border**: `border-slate-200/50 dark:border-slate-800/50`
**Text**: `text-foreground dark:text-white`
**Hover**: Overlay `bg-white/50` (light) or `bg-black/50` (dark)
**Focus**: `ring-2 ring-primary ring-offset-2`

**Example**:
```tsx
<PrimaryButton onClick={handleClick}>
  Submit
</PrimaryButton>
```

#### Secondary Button

**Background**: `bg-white/50 dark:bg-slate-800/50`
**Border**: `border-slate-200/50 dark:border-slate-700/50`
**Text**: `text-foreground`
**Hover**: `bg-white/80 dark:bg-slate-800/80`

**Example**:
```tsx
<SecondaryButton onClick={handleClick}>
  Cancel
</SecondaryButton>
```

#### Accent Button

**Background**: Gradient `from-primary/10 via-indigo-400/10 to-purple-400/10`
**Border**: `border-primary/30`
**Text**: `text-primary`
**Hover**: Gradient `from-primary/15 via-indigo-400/15 to-purple-400/15`

**Example**:
```tsx
<AccentButton onClick={handleClick}>
  Save All
</AccentButton>
```

#### Toggle Button

**Active State**:
- Background: Card gradient
- Border: `border-primary/30`
- Ring: `ring-2 ring-primary/30`
- Text: `text-foreground`

**Inactive State**:
- Background: White gradient
- Border: `border-slate-300/50`
- Ring: `ring-1 ring-slate-300/30`
- Text: `text-muted-foreground`

**Example**:
```tsx
<ToggleButton 
  isActive={isActive}
  onClick={handleToggle}
>
  Toggle
</ToggleButton>
```

#### IconButton

**Variants**:
- **Default**: `text-foreground`
- **Error**: `text-destructive` (uses CSS variable - fixed)
- **Primary**: `text-primary`
- **Muted**: `text-muted-foreground`

**Hover Styles**:
- **Background** (default): `hover:bg-muted`, `hover:bg-destructive/10`, `hover:bg-primary/10`
- **Color**: `hover:text-foreground`, `hover:text-destructive`, `hover:text-primary`

**Icon Animations**:
- **Scale**: `iconHover="scale"` - icon scales on hover
- **Rotate**: `iconHover="rotate"` - icon rotates on hover
- **None**: `iconHover="none"` - no animation

**Compact Mode**: `compact={true}` - reduced padding, still meets 44x44px minimum

**Focus**: `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`

**Sizes**: All sizes meet 44x44px minimum touch target (h-11 w-11 = 44px) - fixed

**Example**:
```tsx
<IconButton 
  icon={Search} 
  variant="primary"
  hoverStyle="background"
  iconHover="scale"
  onClick={handleClick}
/>
```

#### ItemEditingButtons

**Composition Pattern**: Uses IconButton component
- **Edit Button**: `variant="muted"`, `hoverStyle="color"`, `iconHover="rotate"`
- **Delete Button**: `variant="error"`, `hoverStyle="color"`, `iconHover="scale"`
- **Spacing**: `-space-x-2` for tight grouping

**Example**:
```tsx
<ItemEditingButtons
  onEdit={() => handleEdit()}
  onDelete={() => handleDelete()}
  itemLabel="collection"
/>
```

---

### Cards

#### BaseCard

**Background**: Uses centralized `cardBackgroundGradients.base` with additional gradient overlays
**Border**: `border-slate-200/50 dark:border-slate-800/50`
**Hover**: `group-hover:border-primary/30` + `hover:shadow-2xl hover:shadow-primary/10`
**Focus**: `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`

**Gradient Overlays** (intentional design choices):
- Depth layer: `from-blue-400/20 via-indigo-400/15 via-purple-400/15 to-purple-400/15`
- Accent overlay: `from-blue-400/10 via-transparent to-purple-400/10`

**Title Gradient**: `from-slate-800 via-slate-600 to-slate-800` (light), `from-slate-100 via-slate-200 to-slate-100` (dark)
**Title Hover**: `group-hover:from-primary group-hover:via-indigo-400 group-hover:to-purple-400`

**Example**:
```tsx
<BaseCard 
  title="Card Title"
  description="Card description"
  onClick={handleClick}
/>
```

#### CardMetadata

**Background**: `bg-slate-50/50 dark:bg-slate-900/50`
**Border**: `border-slate-200 dark:border-slate-800`
**Text**: `text-xs text-muted-foreground` (labels), default text (values)
**Icons**: `text-muted-foreground` (Calendar, Scale, User icons)

**Example**:
```tsx
<CardMetadata
  dateIssued="2024-01-15"
  courtName="Supreme Court"
  presidingJudge="Judge Smith"
/>
```

#### CollectionCard

**Background**: Inherits from BaseCard
**Icon Background**: `bg-gradient-to-br from-primary/10 to-primary/10` (standardized from `/5`)
**Icon Hover**: `group-hover:from-primary/20 group-hover:to-primary/10`
**Title**: `text-lg font-semibold group-hover:text-primary`
**Description**: `text-sm text-muted-foreground`
**Delete Button**: `hover:bg-destructive/10 hover:text-destructive`

**Example**:
```tsx
<CollectionCard
  name="Tax Law Collection"
  description="Collection of tax law documents"
  documentCount={42}
  onClick={handleClick}
/>
```

---

### Inputs

#### SearchInput

**Background**: `bg-white/80 dark:bg-slate-950/80`
**Border**: `border-slate-200/50 dark:border-slate-800/50`
**Focus**: `border-primary/30 ring-2 ring-primary/20`
**Glow**: Gradient `from-primary/20 via-indigo-400/20 to-purple-400/20`

**Example**:
```tsx
<SearchInput
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  placeholder="Search..."
/>
```

---

### Badges

#### AIBadge

**Background**: Gradient `from-primary/10 via-indigo-400/10 to-purple-400/10`
**Text**: `text-primary`
**Icon**: `text-primary`

**Example**:
```tsx
<AIBadge text="AI" />
```

---

### Loading Indicators

#### LoadingIndicator

**Background**: Gradient `from-blue-400/20 via-indigo-400/20 to-purple-400/20` (fullscreen glow)
**Message Text**: Gradient `from-slate-900 via-primary to-slate-900` (light) / `dark:from-slate-100 dark:via-primary dark:to-slate-100` (dark)
**Subtitle**: `text-muted-foreground`
**Glow Effects**: Multiple gradient overlays with `/20` and `/30` opacity

**Variants**: `inline`, `centered`, `fullscreen`
**Sizes**: `sm`, `md`, `lg`

**Example**:
```tsx
<LoadingIndicator
  message="Loading documents..."
  subtitle="Please wait"
  variant="centered"
  size="md"
/>
```

---

### Buttons (Additional)

#### CollapsibleButton

**Background**: Gradient `from-blue-400/30 via-indigo-400/20 to-purple-400/20`
**Overlay**: Gradient `from-blue-400/20 via-indigo-400/15 to-purple-400/15` with hover opacity
**Border**: `border-slate-200/50 dark:border-slate-800/50`
**Hover Border**: `hover:!border-primary/30`
**Text**: `!text-foreground dark:!text-white`
**Shadow**: `!shadow-md` with `hover:!shadow-lg hover:!shadow-primary/10`
**Focus**: `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`

**Example**:
```tsx
<CollapsibleButton
  isExpanded={isExpanded}
  onClick={handleToggle}
  isLoading={isLoading}
>
  {isExpanded ? 'Collapse' : 'Expand'}
</CollapsibleButton>
```

#### DeleteButton

**Background**: Red gradient `!from-red-600 !via-red-700 !to-red-800` (light) / `dark:!from-red-700 dark:!via-red-800 dark:!to-red-900` (dark)
**Hover**: Darker red gradient
**Text**: `!text-white`
**Border**: `!border-red-600/50 dark:!border-red-800/50`
**Shadow**: `hover:shadow-md hover:shadow-red-600/30`
**Focus**: `focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2`
**Loading**: `opacity-50 cursor-wait`

**Note**: Uses semantic red colors (600-950 range) for destructive actions

**Example**:
```tsx
<DeleteButton
  onClick={handleDelete}
  isLoading={isDeleting}
>
  Delete
</DeleteButton>
```

---

### Cards (Additional)

#### DocumentCard

**Background**: Document-type-specific gradients
- **Judgment**: `from-blue-400/30 via-indigo-400/20 to-blue-400/15`
- **Tax Interpretation**: `from-purple-400/30 via-indigo-400/20 to-purple-400/15`
- **Default**: `from-blue-400/30 via-indigo-400/20 via-purple-400/20 to-purple-400/15`

**Overlay**: Document-type-specific overlays with `/50`, `/30`, `/30` opacity
**Border**: `border-slate-200/50 dark:border-slate-800/50`
**Hover Border**: `hover:border-primary/50`
**Title**: `text-sm font-semibold` with `group-hover:text-primary`
**Preview Text**: `text-slate-700 dark:text-slate-300`
**Type Label**: `text-foreground/80 dark:text-foreground/70`
**Error Warning**: Amber colors with appropriate contrast

**Example**:
```tsx
<DocumentCard
  document={document}
  onSaveToCollection={handleSave}
/>
```

---

### Dialogs

#### DeleteConfirmationDialog

**Background**: `bg-background`
**Border**: `border-slate-200/50 dark:border-slate-800/50`
**Shadow**: `shadow-2xl shadow-primary/10`
**Warning Icon Container**: `bg-red-50 dark:bg-red-950/50` with `border-red-200/50 dark:border-red-800/50`
**Warning Icon**: `text-red-600 dark:text-red-400`
**Title**: `text-lg font-semibold`
**Description**: `text-foreground/80` (improved contrast)
**Item Title**: `text-black dark:text-white font-semibold`

**Example**:
```tsx
<DeleteConfirmationDialog
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Delete Chat"
  itemTitle={chatTitle}
  onConfirm={handleDelete}
  isDeleting={isDeleting}
/>
```

---

### Popovers

#### SaveToCollectionPopover

**Background**: `from-white via-slate-50/80 to-white` (light) / `dark:from-slate-900 dark:via-slate-900 dark:to-slate-900` (dark)
**Border**: `border-slate-200/50 dark:border-slate-800/50`
**Shadow**: `shadow-lg shadow-primary/10`
**Title**: `text-foreground`
**Description**: `text-foreground/80` (improved contrast)
**Select Trigger**: Matches dropdown button styling
**Select Items**: `bg-primary/10` (hover) / `bg-primary/15` (selected)

**Example**:
```tsx
<SaveToCollectionPopover
  documents={documents}
  onClose={() => setIsOpen(false)}
  onNavigate={handleNavigate}
/>
```

---

### Toasts

#### SuccessToast

**Background**: `bg-white dark:bg-slate-900`
**Border**: `border-slate-200/50 dark:border-slate-800/50`
**Shadow**: `shadow-2xl shadow-primary/10`
**Title**: `font-semibold text-foreground`
**Description**: `text-sm text-foreground/80` (improved contrast)
**Icon**: `text-green-500 dark:text-green-400` (CheckCircle2)
**Actions**: Uses `SecondaryButton` and `PrimaryButton`

**Example**:
```tsx
showSuccessToast({
  title: "Success",
  description: "Document saved to collection",
  primaryAction: {
    label: "View Collection",
    onClick: () => router.push('/collections')
  },
  secondaryAction: {
    label: "Start Extraction",
    onClick: () => router.push('/extract')
  }
});
```

---

### Chat Components

#### ChatContainer (Updated)

**Background**: `from-white via-slate-50/80 to-white` (light) / `dark:from-slate-900 dark:via-slate-900 dark:to-slate-900` (dark)
**Border**: `border-slate-200/50 dark:border-slate-800/50`
**Focus**: `focus-within:border-0 focus-within:!border-0` (border removed on focus)
**Shadow**: `shadow-sm` with `hover:shadow-lg hover:shadow-primary/10` and `focus-within:shadow-lg focus-within:shadow-primary/10`
**Transform**: `hover:-translate-y-0.5` and `focus-within:-translate-y-0.5`

**Note**: Focus state uses shadow and transform instead of border for cleaner appearance

**Example**:
```tsx
<ChatContainer>
  <Textarea placeholder="Type your message..." />
  <Button>Send</Button>
</ChatContainer>
```

#### ChatInputFull (Updated)

**Focus Overlay**: `from-primary/10 via-transparent to-primary/10` with `opacity-0 focus-within:opacity-80`
**Textarea Text**: `text-slate-900 dark:text-slate-100`
**Placeholder**: `placeholder:text-foreground/60` (improved contrast)
**Toolbar Border**: `border-slate-200/50 dark:border-slate-800/50`
**Toolbar Background**: `from-slate-50/80 via-transparent to-transparent`
**Focus States**: `focus-visible:!border-none focus-visible:!ring-0` (border/ring removed, relies on container)

**Note**: Padding adjusted (`pt-4 !pb-3 !px-6`) and focus state improved

**Example**:
```tsx
<ChatInputFull
  value={message}
  onChange={setMessage}
  onSend={handleSend}
  isLoading={isLoading}
/>
```

---

## Usage Patterns

### Background Colors

#### When to Use Solid Colors

- Simple backgrounds
- High contrast needs
- Performance-critical areas

**Example**:
```tsx
className="bg-white dark:bg-slate-900"
```

#### When to Use Gradients

- Card backgrounds
- Button backgrounds
- Visual interest
- Brand consistency

**Example**:
```tsx
className="bg-gradient-to-br from-blue-400/30 via-indigo-400/20 to-purple-400/20"
```

#### When to Use Semi-Transparent Backgrounds

- Overlays
- Hover effects
- Subtle backgrounds
- Glassmorphism effects

**Example**:
```tsx
className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm"
```

---

### Text Colors

#### Primary Text

**Light Mode**: `text-slate-900` or `text-foreground`
**Dark Mode**: `text-slate-100` or `text-foreground`

**Example**:
```tsx
className="text-foreground"
```

#### Secondary Text

**Light Mode**: `text-slate-700`
**Dark Mode**: `text-slate-300`

**Example**:
```tsx
className="text-slate-700 dark:text-slate-300"
```

#### Muted Text

**CSS Variable**: `--muted-foreground`

**Example**:
```tsx
className="text-muted-foreground"
```

#### Gradient Text

**Pattern**: `bg-gradient-to-br from-foreground via-primary to-primary bg-clip-text text-transparent`

**Example**:
```tsx
<h1 className="bg-gradient-to-br from-foreground via-primary to-primary bg-clip-text text-transparent">
  Gradient Title
</h1>
```

---

### Border Colors

#### Default Borders

**Pattern**: `border-slate-200/50 dark:border-slate-800/50`

**Example**:
```tsx
className="border border-slate-200/50 dark:border-slate-800/50"
```

#### Focus Borders

**Pattern**: `border-primary/30 ring-2 ring-primary/20`

**Example**:
```tsx
className="focus:border-primary/30 focus:ring-2 focus:ring-primary/20"
```

#### Hover Borders

**Pattern**: `border-primary/30`

**Example**:
```tsx
className="hover:border-primary/30"
```

---

### Shadow Colors

#### Default Shadows

**Pattern**: `shadow-md` or `shadow-lg`

**Example**:
```tsx
className="shadow-md"
```

#### Hover Shadows

**Pattern**: `shadow-2xl shadow-primary/10`

**Example**:
```tsx
className="hover:shadow-2xl hover:shadow-primary/10"
```

---

## State Colors

### Default State

**Buttons**: Gradient backgrounds with standard borders
**Cards**: Gradient backgrounds with standard borders
**Inputs**: White/slate backgrounds with standard borders

### Hover State

**Pattern**: Overlay effects or gradient changes

**Buttons**:
```tsx
className="hover:bg-white/50 dark:hover:bg-black/50"
```

**Cards**:
```tsx
className="hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10"
```

### Focus State

**Pattern**: `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`

**Example**:
```tsx
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
```

### Active/Selected State

**Pattern**: Primary color with ring indicator

**Example**:
```tsx
className="border-primary/30 ring-2 ring-primary/30"
```

### Disabled State

**Pattern**: Reduced opacity

**Example**:
```tsx
className="opacity-50 cursor-not-allowed"
```

---

## Dark Mode Guidelines

### General Rules

1. **Design Colors**: Use `400` shades in light mode, `500` shades in dark mode
2. **Opacity**: Same opacity values in both modes
3. **Borders**: Lighter borders in dark mode for visibility
4. **Backgrounds**: Darker backgrounds in dark mode

### Color Mappings

| Light Mode | Dark Mode | Usage |
|------------|-----------|-------|
| `blue-400` | `blue-500` | Design colors |
| `indigo-400` | `indigo-500` | Design colors |
| `purple-400` | `purple-500` | Design colors |
| `slate-200` | `slate-800` | Borders |
| `slate-50` | `slate-900` | Backgrounds |
| `slate-700` | `slate-300` | Text |

### Pattern

```tsx
// Always include both light and dark mode classes
className="from-blue-400/30 dark:from-blue-500/30"
```

---

## Accessibility Guidelines

### WCAG Contrast Requirements

- **Normal Text**: Minimum 4.5:1 contrast ratio
- **Large Text**: Minimum 3:1 contrast ratio
- **Interactive Elements**: Minimum 3:1 contrast ratio

### Colorblind Support

**Pattern**: Use ring/border changes in addition to color changes

**Example**:
```tsx
// Active state: ring-2 ring-primary/30
// Inactive state: ring-1 ring-slate-300/30
```

### Focus Indicators

**Pattern**: `ring-2 ring-primary ring-offset-2`

**Example**:
```tsx
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
```

### Touch Targets

**Requirement**: Minimum 44x44px for all interactive elements

**Example**:
```tsx
className="h-11 w-11" // 44px minimum
```

---

## Common Patterns

### Gradient Patterns

#### Primary-Indigo-Purple Pattern (4-Stop - Cards)

**Usage**: Card backgrounds, complex surface elements

```tsx
className="bg-gradient-to-br from-blue-400/30 via-indigo-400/20 via-purple-400/20 to-purple-400/15"
className="dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/20 dark:via-purple-500/20 dark:to-purple-500/15"
```

**Used in**: `BaseCard`, `DocumentCard` (default)

#### Primary-Indigo-Purple Pattern (3-Stop - Buttons)

**Usage**: Button backgrounds, simpler surface elements

```tsx
className="bg-gradient-to-br from-blue-400/30 via-indigo-400/20 to-purple-400/20"
className="dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/20 dark:to-purple-500/20"
```

**Used in**: `CollapsibleButton`

#### Blue-Indigo-Purple Pattern (Primary Button)

**Usage**: Primary button backgrounds

```tsx
className="bg-gradient-to-br from-blue-400/30 via-indigo-400/30 via-purple-400/30 to-purple-400/20"
className="dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/30 dark:via-purple-500/30 dark:to-purple-500/20"
```

**Used in**: `PrimaryButton`

#### Document Type Gradients

**Judgment**:
```tsx
className="bg-gradient-to-br from-blue-400/30 via-indigo-400/20 to-blue-400/15"
className="dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/20 dark:to-blue-500/15"
```

**Tax Interpretation**:
```tsx
className="bg-gradient-to-br from-purple-400/30 via-indigo-400/20 to-purple-400/15"
className="dark:bg-gradient-to-br dark:from-purple-500/30 dark:via-indigo-500/20 dark:to-purple-500/15"
```

**Used in**: `DocumentCard`

#### Glow Effects

**Standard Glow**:
```tsx
className="from-blue-400/20 via-indigo-400/20 to-purple-400/20"
className="dark:from-blue-500/20 dark:via-indigo-500/20 dark:to-purple-500/20"
```

**Stronger Glow**:
```tsx
className="from-primary/30 via-indigo-400/30 to-purple-400/30"
className="dark:from-primary/30 dark:via-indigo-500/30 dark:to-purple-500/30"
```

**Used in**: `LoadingIndicator`, various glow effects

---

## Implementation Guide

### Using New Components

#### LoadingIndicator

```tsx
import { LoadingIndicator } from '@/lib/styles/components';

<LoadingIndicator
  message="Loading documents..."
  subtitle="Please wait"
  variant="centered"
  size="md"
/>
```

#### CollapsibleButton

```tsx
import { CollapsibleButton } from '@/lib/styles/components';

<CollapsibleButton
  isExpanded={isExpanded}
  onClick={handleToggle}
  isLoading={isLoading}
>
  {isExpanded ? 'Collapse' : 'Expand'}
</CollapsibleButton>
```

#### DocumentCard

```tsx
import { DocumentCard } from '@/lib/styles/components';

<DocumentCard
  document={document}
  onSaveToCollection={handleSave}
  from="chat"
  chatId={chatId}
/>
```

#### DeleteConfirmationDialog

```tsx
import { DeleteConfirmationDialog } from '@/lib/styles/components';

<DeleteConfirmationDialog
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Delete Chat"
  itemTitle={chatTitle}
  onConfirm={handleDelete}
  isDeleting={isDeleting}
/>
```

#### DeleteButton

```tsx
import { DeleteButton } from '@/lib/styles/components';

<DeleteButton
  onClick={handleDelete}
  isLoading={isDeleting}
  size="md"
>
  Delete
</DeleteButton>
```

#### SaveToCollectionPopover

```tsx
import { SaveToCollectionPopover } from '@/lib/styles/components';

<SaveToCollectionPopover
  documents={documents}
  onClose={() => setIsOpen(false)}
  onNavigate={handleNavigate}
/>
```

#### SuccessToast

```tsx
import { showSuccessToast } from '@/lib/styles/components';

showSuccessToast({
  title: "Success",
  description: "Document saved to collection",
  primaryAction: {
    label: "View Collection",
    onClick: () => router.push('/collections')
  }
});
```

### Using CSS Variables

**Access via Tailwind**:
```tsx
className="bg-primary text-primary-foreground"
```

**Direct CSS**:
```css
background-color: var(--primary);
color: var(--primary-foreground);
```

### Using Tailwind Classes

**Design Colors**:
```tsx
className="bg-blue-400/30 dark:bg-blue-500/30"
```

**Semantic Colors**:
```tsx
className="bg-success text-success-foreground"
```

### Creating New Components

1. **Choose Colors**: Use design colors (Primary, Indigo+Purple, Blue)
2. **Apply Opacity**: Use standardized opacity scale
3. **Add Dark Mode**: Always include dark mode variants
4. **Add Focus State**: Include focus-visible ring
5. **Test Contrast**: Verify WCAG compliance

**Example**:
```tsx
export function NewComponent() {
  return (
    <div className={cn(
      // Background
      "bg-gradient-to-br from-blue-400/30 via-indigo-400/20 to-purple-400/20",
      "dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/20 dark:to-purple-500/20",
      // Border
      "border border-slate-200/50 dark:border-slate-800/50",
      // Focus
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    )}>
      Content
    </div>
  );
}
```

---

## Reference Tables

### CSS Variables Reference

| Variable | Light Mode | Dark Mode | Usage |
|----------|------------|-----------|-------|
| `--primary` | `oklch(0.58 0.24 265.00)` | `oklch(0.65 0.24 265.00)` | Main brand color |
| `--secondary` | `oklch(0.97 0.00 264.54)` | `oklch(0.27 0 0)` | Supporting color |
| `--muted` | `oklch(0.98 0.00 247.84)` | `oklch(0.27 0 0)` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.60 0.02 264.36)` | `oklch(0.72 0 0)` | Muted text (use `text-foreground/80` for better contrast) |
| `--foreground` | `oklch(0.32 0 0)` | `oklch(0.92 0 0)` | Primary text color |
| `--background` | `oklch(1.00 0 0)` | `oklch(0.20 0 0)` | Background color |
| `--destructive` | `oklch(0.64 0.21 25.33)` | `oklch(0.64 0.21 25.33)` | Error/destructive |
| `--success` | `oklch(0.65 0.18 145.00)` | `oklch(0.70 0.18 145.00)` | Success state |
| `--warning` | `oklch(0.75 0.15 85.00)` | `oklch(0.78 0.15 85.00)` | Warning state |
| `--error` | `oklch(0.62 0.23 25.00)` | `oklch(0.68 0.23 25.00)` | Error state |
| `--info` | `oklch(0.60 0.20 230.00)` | `oklch(0.65 0.20 230.00)` | Info state |

### Opacity Reference

| Opacity | Value | Common Usage |
|---------|-------|--------------|
| `/10` | 10% | Very subtle overlays |
| `/15` | 15% | Subtle backgrounds |
| `/20` | 20% | Light backgrounds |
| `/30` | 30% | Card backgrounds |
| `/50` | 50% | Hover overlays |
| `/80` | 80% | Strong overlays |

### Color Shade Reference

| Shade | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `50` | `blue-50` | `blue-950` | Very light/dark |
| `200` | `blue-200` | `blue-800` | Borders |
| `400` | `blue-400` | - | Light mode standard (design colors) |
| `500` | - | `blue-500` | Dark mode standard (design colors) |
| `950` | `blue-950` | - | Very dark (light mode) |

### Component Color Reference

#### New Components (2025)

| Component | Primary Colors | Opacity Values | Special Notes |
|-----------|----------------|----------------|---------------|
| `LoadingIndicator` | blue-400/500, indigo-400/500, purple-400/500 | /10, /20, /30, /50, /80 | Multiple variants (inline, centered, fullscreen) |
| `CollapsibleButton` | blue-400/500, indigo-400/500, purple-400/500 | /15, /20, /30, /50 | 3-stop gradient (simpler than cards) |
| `DocumentCard` | blue-400/500, indigo-400/500, purple-400/500 | /15, /20, /30, /50, /80 | Document-type-specific gradients |
| `CardMetadata` | slate-50/900, slate-200/800 | /50 | Metadata display component |
| `CollectionCard` | primary, destructive | /10, /20 | Uses BaseCard, standardized opacity |
| `ItemEditingButtons` | muted, destructive (via IconButton) | /10 | Composition pattern using IconButton |
| `SubsectionHeader` | primary (via header gradient utility) | N/A | Uses centralized gradient function |
| `DeleteConfirmationDialog` | red-50-950 (semantic), slate-200/800 | /10, /50 | Uses semantic red colors |
| `DeleteButton` | red-600-950 (semantic) | /30, /50 | Semantic red colors for destructive actions |
| `SaveToCollectionPopover` | slate-50-900, primary | /10, /15, /20, /50, /80 | Popover-style background |
| `SuccessToast` | green-400/500 (semantic), slate-200/800 | /10, /50 | Uses semantic green colors |
| `ChatContainer` (updated) | slate-50/900, primary | /10, /50, /80 | Focus state uses shadow/transform |
| `ChatInputFull` (updated) | slate-50-900, primary, indigo-400/500 | /10, /15, /20, /50, /80 | Improved placeholder contrast |

#### Semantic Color Usage

**Red (Destructive)**:
- `DeleteButton`: `red-600` to `red-950` (for buttons/actions)
- `DeleteConfirmationDialog`: `red-50`, `red-200`, `red-400`, `red-600`, `red-800`, `red-950` (full range)

**Green (Success)**:
- `SuccessToast`: `green-400`, `green-500` (standard range)

**Amber (Warning)**:
- `DocumentCard` (error warning): `amber-50`, `amber-200`, `amber-300`, `amber-500`, `amber-900`, `amber-950` (full range)

---

## Summary

This guide provides comprehensive documentation for the standardized color system. Key takeaways:

- ✅ **6-value opacity scale** for consistency
- ✅ **Standardized color shades** (400 for light, 500 for dark)
- ✅ **3 core design colors** (Primary, Indigo+Purple, Blue)
- ✅ **Comprehensive dark mode support**
- ✅ **Accessibility-first approach**
- ✅ **Consistent patterns** across all components

For quick reference, see the [Quick Reference Guide](./COLORS_QUICK_REFERENCE.md).

