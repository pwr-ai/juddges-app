# Opacity Scale Standard
**Version**: 1.0
**Date**: November 17, 2025

## Overview

This document defines the **standard opacity scale** used throughout the design system. Consistent opacity usage creates visual coherence and predictable behavior across components.

## The Opacity Scale

### Standard Scale (Tailwind /X notation)

```css
/10  - Very subtle accent/tint (barely visible)
/15  - Subtle gradient layer
/20  - Light gradient layer
/30  - Medium gradient/border (selected states, rings)
/40  - Medium-strong effect (hover rings, active borders)
/50  - Standard borders and subtle hover backgrounds
/60  - Primary backgrounds (cards, surfaces, inputs)
/70  - Strong backgrounds
/80  - Strong effects (enhanced borders, active states)
/90  - Very strong effects (enhanced focus rings)
/95  - Nearly opaque
/100 - Fully opaque (default, rarely specified)
```

---

## Usage by Category

### 🎨 Background Colors

#### Primary Surfaces (Cards, Popovers, Inputs)
Use `/60` for proper visibility while maintaining glass-morphism:

```typescript
// ✅ Correct
"bg-white/60 dark:bg-slate-800/60"
"bg-slate-100/60 dark:bg-slate-900/60"

// ❌ Incorrect
"bg-white/50 dark:bg-slate-800/50"  // Too transparent for primary surface
```

**Examples**:
- Card backgrounds: `/60`
- Input backgrounds: `/60`
- Popover backgrounds: `/60` to `/95`
- Button backgrounds: `/50` to `/60`

#### Secondary/Hover Backgrounds
Use `/50` for subtle state changes:

```typescript
// ✅ Correct
"hover:bg-slate-100/50 dark:hover:bg-slate-800/50"

// ❌ Incorrect
"hover:bg-slate-100/60"  // Too strong for hover
```

**Examples**:
- Hover backgrounds: `/50`
- Muted backgrounds: `/50`
- Subtle overlays: `/50`

#### Overlay Backgrounds
Use `/20` to `/40` for subtle effects:

```typescript
// ✅ Correct
"bg-gradient-to-br from-blue-400/30 via-indigo-400/30 to-purple-400/20"

// ❌ Incorrect
"bg-gradient-to-br from-blue-400/60"  // Too opaque for gradient overlay
```

**Examples**:
- Gradient overlays: `/20` to `/30`
- Tint overlays: `/10` to `/15`
- Hover overlays: `/30` to `/40`

---

### 🖼️ Border Colors

#### Standard Borders
Use `/50` for default borders:

```typescript
// ✅ Correct
"border-slate-200/50 dark:border-slate-700/50"
"border-slate-200/50 dark:border-slate-800/50"

// ❌ Incorrect
"border-slate-200/30"  // Too subtle, hard to see
```

**Examples**:
- Card borders: `/50`
- Input borders: `/50`
- Dividers: `/30` (can be more subtle)

#### Enhanced/Active Borders
Use `/60` to `/80` for emphasis:

```typescript
// ✅ Correct
"hover:border-primary/60"
"border-primary/30 ring-2 ring-primary/30"  // Selected state
"focus:border-primary/80"  // Enhanced focus

// ❌ Incorrect
"hover:border-primary/30"  // Too subtle for hover feedback
```

**Examples**:
- Hover borders: `/60` to `/70`
- Enhanced hover: `/80`
- Selected state border: `/30` (with ring)
- Enhanced focus border: `/80`

---

### 💍 Ring Colors

#### Standard Rings
Use `/30` for rings (they're additional to borders):

```typescript
// ✅ Correct
"ring-2 ring-primary/30"
"border-primary/30 ring-2 ring-primary/30"  // Selected state

// ❌ Incorrect
"ring-2 ring-primary/60"  // Too strong, competes with border
```

#### Enhanced Focus Rings
Use `/80` to `/90` for enhanced accessibility:

```typescript
// ✅ Correct
"focus-visible:ring-4 focus-visible:ring-primary/80"

// ❌ Incorrect
"focus-visible:ring-4 focus-visible:ring-primary/30"  // Not visible enough
```

---

### 🌟 Shadow Colors

Colored shadows use `/10` to `/60` depending on intensity:

```typescript
// Default shadow
"shadow-md shadow-primary/10"

// Hover shadow
"hover:shadow-xl hover:shadow-primary/20"

// Enhanced hover shadow
"hover:shadow-2xl hover:shadow-primary/50"

// Enhanced focus shadow
"focus-visible:shadow-lg focus-visible:shadow-primary/50"
```

**Scale**:
- Subtle shadows: `/10` to `/20`
- Medium shadows: `/30` to `/40`
- Strong shadows: `/50` to `/60`

---

### 🎭 Gradient Overlays

Gradients use multiple opacity levels for depth:

```typescript
// ✅ Correct - Multi-level opacity
"from-blue-400/30 via-indigo-400/30 via-purple-400/30 to-purple-400/20"
"from-blue-400/20 via-indigo-400/15 to-purple-400/15"

// ❌ Incorrect - Single opacity
"from-blue-400/50 via-indigo-400/50 to-purple-400/50"  // Too flat
```

**Pattern**:
- Start: `/20` to `/30`
- Middle: `/15` to `/30`
- End: `/10` to `/20`

**Dark mode** is typically darker:
```typescript
"dark:from-blue-500/30 dark:via-indigo-500/20 dark:to-purple-500/20"
```

---

## Component-Specific Standards

### Buttons

#### PrimaryButton
```typescript
// Base gradient
"from-blue-400/30 via-indigo-400/30 to-purple-400/20"
"dark:from-blue-500/30 dark:via-indigo-500/30 to-purple-500/20"

// Border (selected state)
"border-primary/30 ring-2 ring-primary/30"

// Hover border (enhanced)
"hover:border-primary/80 hover:ring-primary/40"
```

#### SecondaryButton
```typescript
// Background
"bg-white/60 dark:bg-slate-800/60"  // Changed from /50 to /60

// Border
"border-slate-200/50 dark:border-slate-800/50"

// Hover (default)
"hover:bg-white/80 dark:hover:bg-slate-800/80"

// Hover (enhanced)
"hover:border-primary/80"
"hover:ring-2 hover:ring-primary/40"
```

#### IconButton
```typescript
// Hover background
"hover:bg-muted"  // Uses semantic token (no opacity needed)
"hover:bg-primary/10"  // Variant hover

// Enhanced hover
"hover:bg-primary/30 dark:hover:bg-primary/40"
"hover:border-primary/60"
"hover:ring-2 hover:ring-primary/30"
```

---

### Cards & Surfaces

#### BaseCard / DocumentCard
```typescript
// Background
"bg-white/60 dark:bg-slate-800/60"

// Border
"border-slate-200/50 dark:border-slate-800/50"

// Gradient overlay
"from-blue-50/60 via-indigo-50/30 to-purple-50/20"
"dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-purple-950/20"
```

#### Popover / Dialog
```typescript
// Background (more opaque for readability)
"bg-white/95 dark:bg-slate-900/95"

// Border
"border-slate-200/50 dark:border-slate-700/50"
```

---

### Form Elements

#### Input
```typescript
// Background
"bg-background"  // Semantic token (usually opaque)

// Border (default)
"border-input"  // Semantic token

// Hover border
"hover:border-primary/50"

// Focus border (enhanced)
"focus-visible:border-primary"  // Fully opaque
"focus-visible:ring-4 focus-visible:ring-primary/80"

// Shadow
"hover:shadow-md hover:shadow-primary/20"
"focus-visible:shadow-lg focus-visible:shadow-primary/40"
```

#### Checkbox
```typescript
// Background
"bg-white/50 dark:bg-slate-900/50"

// Border
"border-slate-400 dark:border-slate-500"  // Opaque for clarity

// Checked
"data-[state=checked]:bg-primary"  // Fully opaque
"data-[state=checked]:border-primary"
```

---

### Badges

```typescript
// Outline variant
"border-slate-200/50 dark:border-slate-700/50"
"hover:bg-slate-100/50 dark:hover:bg-slate-800/50"

// Secondary variant
"bg-slate-100/60 dark:bg-slate-800/60"
"border-slate-200/30 dark:border-slate-700/30"
"hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
```

---

## Migration Guide

### Finding Non-Compliant Opacity

```bash
# Find all /50 backgrounds (should be /60 for surfaces)
grep -r "bg-.*\/50" --include="*.tsx" lib/styles/components/

# Find all /60 borders (should be /50)
grep -r "border-.*\/60" --include="*.tsx" lib/styles/components/

# Find inconsistent opacity
grep -r "\/[0-9]\{2\}" --include="*.tsx" lib/styles/components/ | sort | uniq
```

### Updating Components

**Before**:
```typescript
"bg-white/50 dark:bg-slate-800/50"  // Surface background
"border-slate-200/60"                // Border
```

**After**:
```typescript
"bg-white/60 dark:bg-slate-800/60"  // ✅ Correct surface opacity
"border-slate-200/50"                // ✅ Correct border opacity
```

---

## Testing Checklist

After standardization:
- [ ] Backgrounds are clearly visible
- [ ] Borders are distinct but not overpowering
- [ ] Hover states provide clear feedback
- [ ] Focus states are highly visible
- [ ] Dark mode maintains consistency
- [ ] Gradients have proper depth
- [ ] Shadows are appropriately subtle/strong

---

## Exceptions

### When to Deviate

1. **Semantic tokens**: Use semantic tokens without opacity when available
   ```typescript
   "bg-background"  // ✅ Prefer this
   "text-foreground"  // ✅ Over direct colors
   ```

2. **Full opacity**: Some contexts need opaque colors
   ```typescript
   "bg-primary"  // ✅ Checked states, active elements
   "text-destructive"  // ✅ Error text needs full opacity
   ```

3. **Artistic choice**: Subtle effects may use /10 to /15
   ```typescript
   "from-primary/15 via-indigo-400/15 to-purple-400/15"  // ✅ Icon glow
   ```

4. **Accessibility**: Never compromise contrast for opacity
   ```typescript
   "text-foreground"  // ✅ Always full opacity for text
   ```

---

## Quick Reference

| Use Case | Opacity | Example |
|----------|---------|---------|
| **Primary surfaces** | `/60` | Card backgrounds, inputs |
| **Hover backgrounds** | `/50` | Subtle state changes |
| **Borders (default)** | `/50` | Standard borders, dividers |
| **Borders (hover)** | `/60-/70` | Hover emphasis |
| **Borders (enhanced)** | `/80` | Enhanced hover/focus |
| **Selected border** | `/30` + ring `/30` | Active/selected state |
| **Rings (default)** | `/30` | Standard focus ring |
| **Rings (enhanced)** | `/80-/90` | Enhanced focus |
| **Shadows (subtle)** | `/10-/20` | Default shadows |
| **Shadows (strong)** | `/50-/60` | Enhanced shadows |
| **Gradients (start)** | `/20-/30` | Gradient overlays |
| **Gradients (end)** | `/10-/20` | Gradient overlays |
| **Overlays** | `/30-/40` | Hover effects |
| **Tints** | `/10-/15` | Subtle accents |

---

## Related Documentation

- [ENHANCEMENT_PATTERN_GUIDE.md](./ENHANCEMENT_PATTERN_GUIDE.md)
- [CHAT_COMPONENTS_STYLING_GUIDE.md](../results/chat-components/CHAT_COMPONENTS_STYLING_GUIDE.md)
- [NEW_COMPONENTS_ANALYSIS.md](../results/NEW_COMPONENTS_ANALYSIS.md)

---

**Last Updated**: November 17, 2025
**Status**: Active
**Review Date**: March 2026
