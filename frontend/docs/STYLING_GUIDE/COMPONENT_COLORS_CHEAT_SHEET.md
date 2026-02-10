# Component Colors Cheat Sheet

## Quick Lookup Table for Component Colors

---

## Buttons

| Component | Background | Border | Text | Hover | Focus |
|-----------|-----------|--------|------|-------|-------|
| **PrimaryButton** | Blue-indigo-purple gradient `/30` | `slate-200/50` | `foreground` | White/black overlay `/50` | `ring-2 ring-primary` |
| **SecondaryButton** | `white/50` or `slate-800/50` | `slate-200/50` | `foreground` | `white/80` or `slate-800/80` | `ring-2 ring-primary` |
| **AccentButton** | Primary gradient `/10` | `primary/30` | `primary` | Primary gradient `/15` | `ring-2 ring-primary` |
| **TextButton** | Transparent | None | `muted-foreground` | `foreground` | `ring-2 ring-primary` |
| **IconButton** | Transparent | None | `foreground` / `destructive` / `primary` / `muted-foreground` | `muted` / `destructive/10` / `primary/10` | `ring-2 ring-primary` |
| **ItemEditingButtons** | Transparent | None | Uses IconButton (muted + error) | Uses IconButton | Uses IconButton |
| **ToggleButton** (Active) | Card gradient | `primary/30` + `ring-2 ring-primary/30` | `foreground` | White/black overlay | `ring-2 ring-primary` |
| **ToggleButton** (Inactive) | White gradient | `slate-300/50` + `ring-1 ring-slate-300/30` | `muted-foreground` | Slate gradient | `ring-2 ring-primary` |
| **CollapsibleButton** | Blue-indigo-purple gradient `/30` → `/20` | `slate-200/50` | `foreground` | `border-primary/30` + `shadow-lg shadow-primary/10` | `ring-2 ring-primary` |

---

## Cards

| Component | Background | Border | Hover | Focus |
|-----------|-----------|--------|-------|-------|
| **BaseCard** | Blue-indigo-purple gradient `/30` → `/15` | `slate-200/50` | `border-primary/30` + `shadow-2xl shadow-primary/10` | `ring-2 ring-primary` |
| **CardMetadata** | `slate-50/50` or `slate-900/50` | `slate-200` or `slate-800` | N/A | N/A |
| **CollectionCard** | Inherits from BaseCard | Inherits from BaseCard | `border-primary/30` + title `text-primary` | `ring-2 ring-primary` |
| **DocumentCard** | Uses `sourceDocumentCardColors` utility | Uses utility | Card hover effects | `ring-2 ring-primary` |

---

## Inputs

| Component | Background | Border | Focus | Glow |
|-----------|-----------|--------|-------|------|
| **SearchInput** | `white/80` or `slate-950/80` | `slate-200/50` | `border-primary/30` + `ring-2 ring-primary/20` | Primary-indigo-purple gradient `/20` |
| **ChatInput** | `white` or `slate-900` | `slate-200/50` | `border-primary/50` + `ring-2 ring-primary/20` | Primary gradient `/10` |

---

## Badges

| Component | Background | Text | Icon |
|-----------|-----------|------|------|
| **AIBadge** | Primary-indigo-purple gradient `/10` | `primary` | `primary` |
| **AIDisclaimerBadge** | Slate gradient `/80` | `slate-700` or `slate-300` | `amber-600` or `amber-400` |

---

## Headers

| Component | Text | Description |
|-----------|------|-------------|
| **Header** | Gradient `from-foreground via-primary to-primary` | Gradient `from-slate-700 via-slate-600 to-primary` |
| **SecondaryHeader** | `foreground/80` | Icon: Primary gradient `/15` |
| **SectionHeader** | Gradient `from-foreground via-primary to-primary` | `muted-foreground/80` |
| **SubsectionHeader** | Gradient (via `getHeaderGradientStyle('sm')`) | N/A |

---

## Other Components

| Component | Background | Border | Text | Hover |
|-----------|-----------|--------|------|-------|
| **EmptyState** | Transparent | None | `foreground` | N/A |
| **FilterToggleGroup** | `white/50` or `slate-900/50` | `slate-200/30` | `foreground/80` | N/A |
| **Message** (User) | Primary gradient `/10` | `primary/20` | `slate-900` or `slate-100` | `shadow-lg shadow-primary/10` |
| **Message** (Error) | Red gradient `/50` | `red-200/50` | `red-800` or `red-200` | N/A |
| **ChatContainer** | White-slate gradient | `slate-200/50` | N/A | `border-primary/50` |

---

## State Colors

| State | Pattern | Example |
|-------|---------|---------|
| **Default** | Standard colors | See component tables above |
| **Hover** | Overlay or gradient change | `bg-white/50` or `border-primary/30` |
| **Focus** | `ring-2 ring-primary ring-offset-2` | `focus-visible:ring-2 focus-visible:ring-primary` |
| **Active** | `border-primary/30` + `ring-2 ring-primary/30` | ToggleButton active state |
| **Disabled** | `opacity-50 cursor-not-allowed` | All interactive components |

---

## Gradient Patterns

| Pattern | Usage | Classes |
|---------|-------|---------|
| **Card Background** | BaseCard, active buttons | `from-blue-400/30 via-indigo-400/20 via-purple-400/20 to-purple-400/15` |
| **Button Background** | PrimaryButton | `from-blue-400/30 via-indigo-400/30 via-purple-400/30 to-purple-400/20` |
| **Header Text** | Headers | `from-foreground via-primary to-primary bg-clip-text text-transparent` |
| **Overlay** | Hover effects | `from-primary/10 via-indigo-400/10 to-purple-400/10` |

---

## Dark Mode Mappings

| Light Mode | Dark Mode | Component |
|------------|-----------|-----------|
| `blue-400` | `blue-500` | All design colors |
| `indigo-400` | `indigo-500` | All design colors |
| `purple-400` | `purple-500` | All design colors |
| `slate-200` | `slate-800` | Borders |
| `slate-50` | `slate-900` | Backgrounds |
| `slate-700` | `slate-300` | Text |
| `white` | `slate-900` | Backgrounds |

---

## Quick Copy-Paste Patterns

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

### Standard Border
```tsx
"border border-slate-200/50 dark:border-slate-800/50"
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

**For detailed information, see [Colors Styling Guide](./COLORS_STYLING_GUIDE.md)**

