# Guide: Creating New Components

## Overview

This guide provides step-by-step instructions for creating new components that follow the standardized color system and design patterns established in the design system.

---

## Prerequisites

Before creating a new component, ensure you understand:
- ✅ Color system standards (6-value opacity scale, 400/500 shades)
- ✅ 3-design-color system (Primary, Indigo+Purple, Blue)
- ✅ Focus state requirements
- ✅ Dark mode patterns
- ✅ Accessibility requirements

**Reference**: See the Colors Styling Guide for details.

---

## Step-by-Step Process

### Step 1: Determine Component Type

Identify which category your component belongs to:

- **Button**: Primary action, secondary action, accent, text, icon, toggle
- **Card**: Content container, clickable card
- **Input**: Text input, search input, textarea
- **Badge**: Status badge, AI badge, disclaimer badge
- **Header**: Page header, section header, secondary header
- **Other**: Empty state, message, loading indicator, etc.

**Action**: Choose the appropriate pattern from existing components.

**Reference**: See [Component Colors Cheat Sheet](./component-colors.md) for examples.

---

### Step 2: Choose Colors

#### Design Colors (Use for backgrounds, gradients)

1. **Primary**: Use `primary` CSS variable for brand elements
   ```tsx
   className="bg-primary text-primary-foreground"
   ```

2. **Indigo + Purple**: Use `indigo-400/500` + `purple-400/500` for gradients
   ```tsx
   className="from-indigo-400/30 via-purple-400/20 to-purple-400/15"
   className="dark:from-indigo-500/30 dark:via-purple-500/20 dark:to-purple-500/15"
   ```

3. **Blue**: Use `blue-400/500` for background gradients
   ```tsx
   className="from-blue-400/30"
   className="dark:from-blue-500/30"
   ```

#### Semantic Colors (Use for states)

- **Success**: `success` or `green-*`
- **Error**: `error` or `red-*`
- **Warning**: `warning` or `amber-*`
- **Info**: `info` or `blue-*`

#### Neutral Colors (Use for borders, text)

- **Borders**: `slate-200/50` (light) or `slate-800/50` (dark)
- **Text**: `foreground` or `muted-foreground`
- **Backgrounds**: `slate-50` (light) or `slate-900` (dark)

**Action**: Select colors based on component purpose.

---

### Step 3: Apply Opacity Scale

Use only these 6 values:

| Opacity | Value | Usage |
|---------|-------|-------|
| `/10` | 10% | Very subtle overlays |
| `/15` | 15% | Subtle backgrounds |
| `/20` | 20% | Light backgrounds |
| `/30` | 30% | Medium backgrounds (most common) |
| `/50` | 50% | Hover overlays |
| `/80` | 80% | Strong overlays |

**Action**: Choose appropriate opacity based on visual hierarchy.

**Reference**: See the Colors Styling Guide - Opacity Scale section.

---

### Step 4: Add Dark Mode Support

**Pattern**: Always include both light and dark mode classes

```tsx
// Light mode: 400 shades
"from-blue-400/30 via-indigo-400/20 to-purple-400/20"

// Dark mode: 500 shades
"dark:from-blue-500/30 dark:via-indigo-500/20 dark:to-purple-500/20"
```

**Action**: Add `dark:` variants for all color classes.

**Reference**: See the Colors Styling Guide - Dark Mode Guidelines section.

---

### Step 5: Add Focus State

**Required Pattern**: All interactive elements must have focus states

```tsx
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
```

**Action**: Add focus state to all interactive elements.

**Reference**: See the Colors Styling Guide - Accessibility Guidelines section.

---

### Step 6: Add Hover State

**Pattern**: Use overlay or gradient changes

**Buttons**:
```tsx
"hover:bg-white/50 dark:hover:bg-black/50"
```

**Cards**:
```tsx
"hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10"
```

**Action**: Add appropriate hover state.

---

### Step 7: Verify Touch Targets

**Requirement**: Minimum 44x44px for all interactive elements

```tsx
// Minimum size
className="h-11 w-11" // 44px
```

**Action**: Ensure all interactive elements meet minimum size.

---

### Step 8: Add TypeScript Return Types

**Requirement**: All component functions must have explicit return types

**Pattern**: Use `React.JSX.Element` for components that return JSX

```tsx
export function NewButton({
  children,
  onClick,
  className,
  disabled = false,
  type = "button",
}: NewButtonProps): React.JSX.Element {
  // Component implementation
}
```

**For components that can return null**:
```tsx
export function OptionalComponent({
  show,
}: OptionalComponentProps): React.JSX.Element | null {
  if (!show) return null;
  // Component implementation
}
```

**For async functions**:
```tsx
export async function fetchData(): Promise<void> {
  // Async implementation
}
```

**For event handlers**:
```tsx
const handleClick = (): void => {
  // Handler implementation
};
```

**Action**: Add explicit return types to all functions.

**Reference**: See ESLint rule `@typescript-eslint/explicit-function-return-type`

---

### Step 9: Test Accessibility

1. **Contrast**: Verify text/background contrast (4.5:1 minimum)
2. **Focus**: Test keyboard navigation
3. **Colorblind**: Verify state changes use ring/border in addition to color
4. **Touch Targets**: Verify minimum 44x44px

**Action**: Test all accessibility requirements.

---

## Component Templates

### Template 1: Button Component

```tsx
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface NewButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

export function NewButton({
  children,
  onClick,
  className,
  disabled = false,
  type = "button",
}: NewButtonProps): React.JSX.Element {
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // Size - ensure minimum 44x44px
        "h-11 px-6 rounded-xl",
        // Background - use appropriate gradient
        "bg-gradient-to-br from-blue-400/30 via-indigo-400/30 via-purple-400/30 to-purple-400/20",
        "dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/30 dark:via-purple-500/30 dark:to-purple-500/20",
        // Border
        "border border-slate-200/50 dark:border-slate-800/50",
        // Text
        "text-foreground dark:text-white",
        // Hover overlay
        "hover:bg-white/50 dark:hover:bg-black/50",
        // Focus state (required)
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        // Transitions
        "transition-all duration-300",
        // Disabled state
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {children}
    </Button>
  );
}
```

### Template 2: Card Component

```tsx
"use client";

import React from 'react';
import { cn } from '@/lib/utils';

export interface NewCardProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  clickable?: boolean;
}

export function NewCard({
  children,
  onClick,
  className,
  clickable = true,
}: NewCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden",
        // Background gradient
        "bg-gradient-to-br from-blue-400/30 via-indigo-400/20 via-purple-400/20 to-purple-400/15",
        "dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/20 dark:via-purple-500/20 dark:to-purple-500/15",
        // Border
        "border border-slate-200/50 dark:border-slate-800/50",
        // Hover effects
        "hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10",
        // Focus state (required for clickable)
        clickable && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        // Transitions
        "transition-[transform,shadow,border-color] duration-300 ease-out",
        // Clickable effects
        clickable && "cursor-pointer hover:scale-[1.03] hover:-translate-y-1",
        // Layout
        "rounded-2xl p-6",
        className
      )}
      onClick={clickable && onClick ? onClick : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {children}
    </div>
  );
}
```

### Template 3: Input Component

```tsx
"use client";

import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface NewInputProps extends React.ComponentProps<typeof Input> {
  className?: string;
}

export const NewInput = React.forwardRef<HTMLInputElement, NewInputProps>(
  ({ className, ...props }, ref) => {
    return (
      <div className="relative group">
        {/* Glow effect on focus */}
        <div className={cn(
          "absolute inset-0 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-2xl -z-10",
          "bg-gradient-to-r from-primary/20 via-indigo-400/20 to-purple-400/20",
          "dark:from-primary/20 dark:via-indigo-500/20 dark:to-purple-500/20"
        )} />
        
        <Input
          ref={ref}
          className={cn(
            // Size
            "h-12 rounded-2xl",
            // Background
            "bg-white/80 dark:bg-slate-950/80 backdrop-blur-md",
            // Border
            "border border-slate-200/50 dark:border-slate-800/50",
            // Hover
            "hover:border-primary/20",
            // Focus
            "focus:border-primary/30 focus:ring-2 focus:ring-primary/20",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            // Transitions
            "transition-all duration-300",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

NewInput.displayName = "NewInput";
```

### Template 4: Badge Component

```tsx
"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface NewBadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'error';
  className?: string;
}

export function NewBadge({
  children,
  variant = 'default',
  className,
}: NewBadgeProps) {
  const variantStyles = {
    default: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
    primary: "bg-gradient-to-br from-primary/10 via-indigo-400/10 to-purple-400/10 text-primary",
    success: "bg-success/10 text-success border-success/30",
    error: "bg-error/10 text-error border-error/30",
  };

  return (
    <Badge
      className={cn(
        "px-3 py-1 rounded-lg border",
        variantStyles[variant],
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className
      )}
    >
      {children}
    </Badge>
  );
}
```

---

## Checklist

### Color System Compliance

- [ ] Uses standardized opacity values (`/10`, `/15`, `/20`, `/30`, `/50`, `/80`)
- [ ] Uses `400` shades in light mode, `500` shades in dark mode
- [ ] Uses 3-design-color system (Primary, Indigo+Purple, Blue)
- [ ] No hardcoded hex colors
- [ ] No non-standard colors (pink, cyan, violet, etc.)

### Dark Mode Support

- [ ] All colors have dark mode variants
- [ ] Uses `dark:` prefix for all dark mode classes
- [ ] Dark mode colors use `500` shades

### Accessibility

- [ ] Focus state present (`ring-2 ring-primary`)
- [ ] Touch targets meet 44x44px minimum
- [ ] Contrast ratios meet WCAG requirements (4.5:1 for text, 3:1 for large text)
- [ ] Colorblind support (ring/border changes for state changes)

### States

- [ ] Default state defined
- [ ] Hover state defined
- [ ] Focus state defined
- [ ] Active/selected state (if applicable)
- [ ] Disabled state (if applicable)

### Code Quality

- [ ] TypeScript types defined
- [ ] Props documented with JSDoc
- [ ] Examples provided
- [ ] Follows existing component patterns
- [ ] Exported from index file

---

## Common Patterns Reference

### Background Gradient (Card)

```tsx
"bg-gradient-to-br from-blue-400/30 via-indigo-400/20 via-purple-400/20 to-purple-400/15"
"dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/20 dark:via-purple-500/20 dark:to-purple-500/15"
```

### Background Gradient (Button)

```tsx
"bg-gradient-to-br from-blue-400/30 via-indigo-400/30 via-purple-400/30 to-purple-400/20"
"dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/30 dark:via-purple-500/30 dark:to-purple-500/20"
```

### Border

```tsx
"border border-slate-200/50 dark:border-slate-800/50"
```

### Focus State (Required)

```tsx
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
```

### Hover Overlay

```tsx
"hover:bg-white/50 dark:hover:bg-black/50"
```

### Hover Border

```tsx
"hover:border-primary/30"
```

### Hover Shadow

```tsx
"hover:shadow-2xl hover:shadow-primary/10"
```

### Active/Selected State

```tsx
"border-primary/30 ring-2 ring-primary/30"
```

### Disabled State

```tsx
"opacity-50 cursor-not-allowed"
```

---

## Real-World Examples

### Example 1: Simple Action Button

```tsx
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ActionButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function ActionButton({
  children,
  onClick,
  disabled = false,
  className,
}: ActionButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // Size - minimum 44x44px
        "h-11 px-6 rounded-xl",
        // Background gradient
        "bg-gradient-to-br from-blue-400/30 via-indigo-400/30 to-purple-400/20",
        "dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/30 dark:to-purple-500/20",
        // Border
        "border border-slate-200/50 dark:border-slate-800/50",
        // Text
        "text-foreground dark:text-white font-semibold",
        // Hover
        "hover:bg-white/50 dark:hover:bg-black/50",
        // Focus (required)
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        // Transitions
        "transition-all duration-300",
        // Disabled
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {children}
    </Button>
  );
}
```

### Example 2: Status Badge

```tsx
"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface StatusBadgeProps {
  status: 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({
  status,
  children,
  className,
}: StatusBadgeProps) {
  const statusStyles = {
    success: "bg-success/10 text-success border-success/30",
    error: "bg-error/10 text-error border-error/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    info: "bg-info/10 text-info border-info/30",
  };

  return (
    <Badge
      className={cn(
        "px-3 py-1 rounded-lg border",
        statusStyles[status],
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className
      )}
    >
      {children}
    </Badge>
  );
}
```

### Example 3: Interactive Card

```tsx
"use client";

import React from 'react';
import { cn } from '@/lib/utils';

export interface InteractiveCardProps {
  title: string;
  description?: string;
  onClick?: () => void;
  className?: string;
}

export function InteractiveCard({
  title,
  description,
  onClick,
  className,
}: InteractiveCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden",
        // Background gradient
        "bg-gradient-to-br from-blue-400/30 via-indigo-400/20 via-purple-400/20 to-purple-400/15",
        "dark:bg-gradient-to-br dark:from-blue-500/30 dark:via-indigo-500/20 dark:via-purple-500/20 dark:to-purple-500/15",
        // Border
        "border border-slate-200/50 dark:border-slate-800/50",
        // Hover effects
        "hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10",
        // Focus state
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        // Transitions
        "transition-[transform,shadow,border-color] duration-300 ease-out",
        // Clickable effects
        "cursor-pointer hover:scale-[1.03] hover:-translate-y-1",
        // Layout
        "rounded-2xl p-6",
        className
      )}
      onClick={onClick}
      tabIndex={0}
      role="button"
      aria-label={title}
    >
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
```

---

## Testing Checklist

Before considering a component complete:

### Visual Testing

- [ ] Visual test in light mode
- [ ] Visual test in dark mode
- [ ] All states visible and working
- [ ] No visual regressions

### Functional Testing

- [ ] All interactive states work
- [ ] Keyboard navigation works
- [ ] Click/tap interactions work
- [ ] No console errors

### Accessibility Testing

- [ ] Focus state visible
- [ ] Keyboard navigation works
- [ ] Touch target size verified (44x44px minimum)
- [ ] Contrast ratios verified (4.5:1 for text, 3:1 for large text)
- [ ] Colorblind accessibility verified (ring/border changes)
- [ ] Screen reader tested (if applicable)

### Code Quality

- [ ] TypeScript types correct
- [ ] No linter errors
- [ ] Props documented
- [ ] Examples provided

---

## File Structure

When creating a new component, follow this structure:

```
frontend/lib/styles/components/
├── new-component.tsx          # Component implementation
└── index.ts                   # Export (add to existing)
```

### Component File Template

```tsx
/**
 * New Component
 * Brief description of what this component does
 * Used for [purpose]
 */

"use client";

import React from 'react';
import { cn } from '@/lib/utils';
// Import other dependencies as needed

/**
 * Props for NewComponent
 */
export interface NewComponentProps {
  /** Component content */
  children: React.ReactNode;
  /** Click handler */
  onClick?: () => void;
  /** Optional className for additional styling */
  className?: string;
  /** Optional disabled state */
  disabled?: boolean;
}

/**
 * New Component
 * 
 * A reusable component that [description].
 * 
 * @example
 * ```tsx
 * <NewComponent onClick={() => handleClick()}>
 *   Content
 * </NewComponent>
 * ```
 */
export function NewComponent({
  children,
  onClick,
  className,
  disabled = false,
}: NewComponentProps) {
  return (
    <div
      className={cn(
        // Add your classes here following the standards
        className
      )}
      onClick={onClick}
      // Add other props as needed
    >
      {children}
    </div>
  );
}
```

---

## Integration Steps

After creating a new component:

1. **Add to Component Library**
   - Create file in `/lib/styles/components/`
   - Follow naming convention (kebab-case)

2. **Export from Index**
   - Add export to `/lib/styles/components/index.ts`
   - Export both component and types

3. **Add to Style Demo**
   - Add component showcase to `/app/style-demo/page.tsx`
   - Document all color properties
   - Add usage examples

4. **Update Documentation**
   - Add to [Component Colors Cheat Sheet](./component-colors.md) if needed
   - Update the Colors Styling Guide if new patterns introduced

---

## Common Mistakes to Avoid

### ❌ Don't Do This

1. **Hardcoded Colors**: Don't use hex colors like `#3b82f6`
   ```tsx
   // ❌ Bad
   className="bg-[#3b82f6]"
   
   // ✅ Good
   className="bg-blue-400"
   ```

2. **Non-Standard Opacity**: Don't use opacity values outside the 6-value scale
   ```tsx
   // ❌ Bad
   className="bg-primary/40"
   
   // ✅ Good
   className="bg-primary/30" // or /50
   ```

3. **Wrong Color Shades**: Don't use `500` in light mode or `400` in dark mode
   ```tsx
   // ❌ Bad
   className="bg-blue-500 dark:bg-blue-400"
   
   // ✅ Good
   className="bg-blue-400 dark:bg-blue-500"
   ```

4. **Missing Dark Mode**: Don't forget dark mode variants
   ```tsx
   // ❌ Bad
   className="bg-blue-400/30"
   
   // ✅ Good
   className="bg-blue-400/30 dark:bg-blue-500/30"
   ```

5. **Missing Focus State**: Don't forget focus states for interactive elements
   ```tsx
   // ❌ Bad
   <button className="bg-primary">Click</button>
   
   // ✅ Good
   <button className={cn(
     "bg-primary",
     "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
   )}>
     Click
   </button>
   ```

6. **Too Small Touch Targets**: Don't make interactive elements smaller than 44x44px
   ```tsx
   // ❌ Bad
   className="h-8 w-8" // 32px - too small
   
   // ✅ Good
   className="h-11 w-11" // 44px - meets requirement
   ```

### ✅ Do This Instead

1. Use CSS variables or Tailwind classes
2. Use only the 6 standard opacity values
3. Use `400` for light mode, `500` for dark mode
4. Always include dark mode variants
5. Always include focus states
6. Ensure minimum 44x44px touch targets

---

## Quick Reference

### Color Selection Decision Tree

```
Is it a brand/primary element?
├─ Yes → Use `primary` CSS variable
└─ No → Is it a background/gradient?
    ├─ Yes → Use blue-indigo-purple gradient (400/500)
    └─ No → Is it a border/text?
        ├─ Yes → Use slate colors
        └─ No → Is it a state (success/error)?
            ├─ Yes → Use semantic colors
            └─ No → Review component purpose
```

### Opacity Selection Guide

```
Very subtle effect? → /10
Subtle background? → /15
Light background? → /20
Medium background? → /30 (most common)
Hover overlay? → /50
Strong overlay? → /80
```

---

## Resources

- **Colors Styling Guide**: see Styling Guide 2.0 ([guide-v2.md](./guide-v2.md))
- **Quick Reference**: [colors-reference.md](./colors-reference.md)
- **Component Cheat Sheet**: [component-colors.md](./component-colors.md)
- **Migration Examples**: [migration-examples.md](./migration-examples.md)
- **Existing Components**: `/lib/styles/components/`
- **Style Demo**: `/app/style-demo/page.tsx`

---

## Summary

Creating new components involves:

1. ✅ **Choose Component Type** - Select appropriate pattern
2. ✅ **Choose Colors** - Use 3-design-color system
3. ✅ **Apply Opacity** - Use 6-value scale
4. ✅ **Add Dark Mode** - Include `dark:` variants
5. ✅ **Add Focus State** - Required for accessibility
6. ✅ **Add Hover State** - Provide visual feedback
7. ✅ **Verify Touch Targets** - Minimum 44x44px
8. ✅ **Test Accessibility** - Contrast, keyboard, colorblind
9. ✅ **Test Thoroughly** - All states and modes
10. ✅ **Document** - Add to style-demo and guides

**Result**: Consistent, accessible, maintainable components that follow design system standards.

---

## Next Steps

1. ✅ Review existing components for patterns
2. ✅ Use templates provided above
3. ✅ Follow checklist
4. ✅ Test thoroughly
5. ✅ Document and integrate

**For questions or clarifications, refer to the Colors Styling Guide.**

