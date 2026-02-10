# Color Migration Examples

## Before/After Examples and Step-by-Step Migration Guides

---

## Migration Overview

This guide shows how to migrate components from old color patterns to the standardized color system.

---

## Example 1: Button Component

### Before (Inconsistent)

```tsx
<button className={cn(
  "px-4 py-2 rounded-lg",
  "bg-gradient-to-r from-blue-500/40 via-indigo-600/30 to-purple-600/30",
  "dark:from-blue-700/50 dark:via-indigo-700/40 dark:to-purple-700/40",
  "border border-slate-300",
  "hover:from-blue-500/60 hover:via-indigo-600/50 hover:to-purple-600/50"
)}>
  Click Me
</button>
```

**Issues**:
- ❌ Uses `500` shades in light mode (should be `400`)
- ❌ Uses `600` shades (not standardized)
- ❌ Uses `700` shades in dark mode (should be `500`)
- ❌ Uses `/40` opacity (not in 6-value scale)
- ❌ Inconsistent hover pattern

### After (Standardized)

```tsx
<button className={cn(
  "px-4 py-2 rounded-lg",
  // Standardized gradient with 400 shades for light mode
  "bg-gradient-to-br from-blue-400/30 via-indigo-400/30 via-purple-400/30 to-purple-400/20",
  // Standardized gradient with 500 shades for dark mode
  "dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/30 dark:via-purple-500/30 dark:to-purple-500/20",
  // Standardized border
  "border border-slate-200/50 dark:border-slate-800/50",
  // Standardized hover overlay
  "hover:bg-white/50 dark:hover:bg-black/50",
  // Focus state
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
)}>
  Click Me
</button>
```

**Improvements**:
- ✅ Uses `400` shades in light mode
- ✅ Uses `500` shades in dark mode
- ✅ Uses standardized opacity values (`/30`, `/20`)
- ✅ Consistent hover pattern (overlay instead of gradient change)
- ✅ Includes focus state

---

## Example 2: Card Component

### Before (Inconsistent)

```tsx
<div className={cn(
  "p-6 rounded-xl",
  "bg-gradient-to-br from-blue-100/90 via-indigo-100/80 via-purple-100/80 to-pink-100/60",
  "dark:from-blue-950/90 dark:via-indigo-950/80 dark:via-purple-950/80 dark:to-pink-950/60",
  "border border-slate-200",
  "hover:border-blue-400"
)}>
  Card Content
</div>
```

**Issues**:
- ❌ Uses `100` shades (not standardized)
- ❌ Uses `pink` color (not in 3-design-color system)
- ❌ Uses `/90`, `/80`, `/60` opacity (not in 6-value scale)
- ❌ Uses `950` shades in dark mode (should be `500`)
- ❌ Inconsistent hover border

### After (Standardized)

```tsx
<div className={cn(
  "p-6 rounded-xl",
  // Standardized gradient with 400 shades for light mode
  "bg-gradient-to-br from-blue-400/30 via-indigo-400/20 via-purple-400/20 to-purple-400/15",
  // Standardized gradient with 500 shades for dark mode
  "dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/20 dark:via-purple-500/20 dark:to-purple-500/15",
  // Standardized border
  "border border-slate-200/50 dark:border-slate-800/50",
  // Standardized hover
  "hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10",
  // Focus state
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
)}>
  Card Content
</div>
```

**Improvements**:
- ✅ Uses `400` shades in light mode
- ✅ Uses `500` shades in dark mode
- ✅ Removed `pink` (consolidated to `purple`)
- ✅ Uses standardized opacity values (`/30`, `/20`, `/15`)
- ✅ Consistent hover pattern
- ✅ Includes focus state

---

## Example 3: Input Component

### Before (Missing States)

```tsx
<input className={cn(
  "px-4 py-2 rounded-lg",
  "bg-white",
  "border border-slate-300",
  "focus:border-blue-500"
)} />
```

**Issues**:
- ❌ No dark mode support
- ❌ No focus ring
- ❌ No hover state
- ❌ Uses `slate-300` (should be `slate-200/50`)

### After (Complete)

```tsx
<input className={cn(
  "px-4 py-2 rounded-lg",
  // Standardized background with dark mode
  "bg-white/80 dark:bg-slate-950/80 backdrop-blur-md",
  // Standardized border
  "border border-slate-200/50 dark:border-slate-800/50",
  // Standardized hover
  "hover:border-primary/20",
  // Standardized focus
  "focus:border-primary/30 focus:ring-2 focus:ring-primary/20",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
)} />
```

**Improvements**:
- ✅ Dark mode support
- ✅ Focus ring
- ✅ Hover state
- ✅ Standardized border colors
- ✅ Backdrop blur for modern effect

---

## Step-by-Step Migration Process

### Step 1: Identify Color Issues

1. Check for non-standard opacity values
2. Check for non-standard color shades
3. Check for non-standard colors (outside 3-design-color system)
4. Check for missing dark mode variants
5. Check for missing focus states

### Step 2: Map to Standard Values

1. **Opacity**: Map to nearest standard value (`/10`, `/15`, `/20`, `/30`, `/50`, `/80`)
2. **Shades**: Map `400` for light mode, `500` for dark mode
3. **Colors**: Map to 3-design-color system (Primary, Indigo+Purple, Blue)
4. **States**: Add missing states (hover, focus, active, disabled)

### Step 3: Update Classes

1. Replace old classes with standardized classes
2. Add dark mode variants
3. Add focus states
4. Add hover states if missing

### Step 4: Test

1. Visual testing in light mode
2. Visual testing in dark mode
3. Accessibility testing (contrast, focus states)
4. Functional testing (all states work)

---

## Common Migration Patterns

### Pattern 1: Opacity Consolidation

**Before**: `/40`, `/60`, `/90`
**After**: `/30`, `/50`, `/80`

```tsx
// Before
"bg-primary/40"

// After
"bg-primary/30" // or /50 depending on context
```

### Pattern 2: Color Shade Standardization

**Before**: `500` in light mode, `700` in dark mode
**After**: `400` in light mode, `500` in dark mode

```tsx
// Before
"bg-blue-500 dark:bg-blue-700"

// After
"bg-blue-400 dark:bg-blue-500"
```

### Pattern 3: Color Consolidation

**Before**: `pink`, `cyan`, `violet`
**After**: `purple`, `blue`

```tsx
// Before
"from-pink-400 to-cyan-400"

// After
"from-purple-400 to-blue-400"
```

### Pattern 4: Adding Focus States

**Before**: No focus state
**After**: Standard focus state

```tsx
// Before
<button className="bg-primary">Click</button>

// After
<button className={cn(
  "bg-primary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
)}>
  Click
</button>
```

### Pattern 5: Adding Dark Mode

**Before**: Light mode only
**After**: Light + dark mode

```tsx
// Before
"bg-white border-slate-200"

// After
"bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
```

---

## Migration Checklist

For each component:

- [ ] Replace non-standard opacity values
- [ ] Replace non-standard color shades
- [ ] Consolidate to 3-design-color system
- [ ] Add dark mode variants
- [ ] Add focus states
- [ ] Add hover states (if missing)
- [ ] Test in light mode
- [ ] Test in dark mode
- [ ] Test accessibility
- [ ] Update documentation

---

## Common Pitfalls

### ❌ Don't Do This

1. **Mixing opacity scales**: Don't use `/40` or `/60` alongside standard values
2. **Mixing color shades**: Don't use `500` in light mode or `400` in dark mode
3. **Missing dark mode**: Always include dark mode variants
4. **Missing focus states**: All interactive elements need focus states
5. **Inconsistent patterns**: Don't use different patterns for similar components

### ✅ Do This Instead

1. **Use standard opacity scale**: Only `/10`, `/15`, `/20`, `/30`, `/50`, `/80`
2. **Use standard shades**: `400` for light, `500` for dark
3. **Always include dark mode**: Use `dark:` prefix
4. **Always include focus states**: Use standard focus pattern
5. **Follow component patterns**: Use established patterns for consistency

---

## Before/After Comparison Table

| Aspect | Before | After |
|--------|--------|-------|
| **Opacity Values** | 19+ values | 6 values |
| **Color Shades** | Mixed (100-950) | Standardized (400/500) |
| **Design Colors** | 16+ colors | 3 colors |
| **Dark Mode** | Partial | Complete |
| **Focus States** | Missing | Complete |
| **Touch Targets** | Inconsistent | Standardized (44px) |
| **Accessibility** | Partial | Complete |

---

## Summary

Migration involves:
1. ✅ Consolidating opacity to 6 values
2. ✅ Standardizing color shades (400/500)
3. ✅ Consolidating to 3 design colors
4. ✅ Adding dark mode support
5. ✅ Adding focus states
6. ✅ Following consistent patterns

**Result**: Consistent, accessible, maintainable color system

---

**For detailed guidelines, see [Colors Styling Guide](./COLORS_STYLING_GUIDE.md)**

