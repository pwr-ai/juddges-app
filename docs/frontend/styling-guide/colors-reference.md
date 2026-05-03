# Colors Quick Reference

## One-Page Quick Reference Guide

---

## Opacity Scale (6 Values)

| Value | Usage | Example |
|-------|-------|---------|
| `/10` | Very subtle | `bg-primary/10` |
| `/15` | Subtle | `bg-primary/15` |
| `/20` | Light | `bg-primary/20` |
| `/30` | Medium (most common) | `bg-primary/30` |
| `/50` | Strong | `bg-primary/50` |
| `/80` | Very strong | `bg-primary/80` |

---

## Color Shades

| Shade | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `400` | ✅ Standard | ❌ | Design colors (light mode) |
| `500` | ❌ | ✅ Standard | Design colors (dark mode) |
| `200` | ✅ | ✅ | Borders |
| `50` | ✅ | ❌ | Very light backgrounds |
| `950` | ❌ | ✅ | Very dark backgrounds |

---

## Design Colors (3 Core)

1. **Primary**: `primary` (CSS variable)
2. **Indigo + Purple**: `indigo-400/500` + `purple-400/500`
3. **Blue**: `blue-400/500`

---

## Common Patterns

### Card Background
```tsx
"bg-gradient-to-br from-blue-400/30 via-indigo-400/20 via-purple-400/20 to-purple-400/15"
"dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/20 dark:via-purple-500/20 dark:to-purple-500/15"
```

### Button Background
```tsx
"bg-gradient-to-br from-blue-400/30 via-indigo-400/30 via-purple-400/30 to-purple-400/20"
"dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/30 dark:via-purple-500/30 dark:to-purple-500/20"
```

### Border
```tsx
"border-slate-200/50 dark:border-slate-800/50"
```

### Focus State
```tsx
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
```

### Hover Overlay
```tsx
"bg-white/50 dark:bg-black/50"
```

---

## Component Quick Lookup

### Primary Button
- Background: Blue-indigo-purple gradient `/30`
- Border: `slate-200/50`
- Hover: White/black overlay `/50`

### Secondary Button
- Background: `white/50` or `slate-800/50`
- Border: `slate-200/50`

### Card
- Background: Blue-indigo-purple gradient `/30` → `/15`
- Border: `slate-200/50`
- Hover: `border-primary/30`

### Input
- Background: `white/80` or `slate-950/80`
- Border: `slate-200/50`
- Focus: `border-primary/30 ring-2 ring-primary/20`

---

## Dark Mode Pattern

Always include both:
```tsx
"from-blue-400/30 dark:from-blue-500/30"
```

---

## Accessibility

- Focus: `ring-2 ring-primary ring-offset-2`
- Touch Target: Minimum `h-11 w-11` (44px)
- Contrast: 4.5:1 for text, 3:1 for large text

---

## Semantic Colors

- Success: `success` or `green-*`
- Error: `error` or `red-*`
- Warning: `warning` or `amber-*`
- Info: `info` or `blue-*`

---

## When to Use What

| Use Case | Solution |
|----------|----------|
| Brand color | `primary` (CSS variable) |
| Card background | Blue-indigo-purple gradient |
| Button background | Blue-indigo-purple gradient |
| Border | `slate-200/50` (light) or `slate-800/50` (dark) |
| Text | `text-foreground` or `text-muted-foreground` |
| Overlay | `/10` to `/50` depending on intensity |
| Focus indicator | `ring-2 ring-primary` |

---

**For detailed information, see Colors Styling Guide.**

