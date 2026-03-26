# Enhancement Pattern Guide
**Version**: 1.0
**Date**: November 17, 2025

## Overview

This guide explains the **enhancement pattern** used across interactive components in the design system. Enhancement props allow components to have more visible hover, focus, and active states when needed for better user feedback.

## The Enhancement Pattern

### What Are Enhancement Props?

Enhancement props are boolean flags that increase the visibility of interaction states:

```typescript
interface EnhancementProps {
  /** Makes hover effects more prominent - stronger shadows, larger scale, visible borders */
  enhancedHover?: boolean;

  /** Makes focus ring larger and more visible - better for accessibility-critical elements */
  enhancedFocus?: boolean;

  /** Makes active state more visible - provides stronger tactile feedback */
  enhancedActive?: boolean;
}
```

### Why Two Tiers?

We use a **two-tier interaction system**:

1. **Default** (`enhanced=false`): Subtle, elegant interactions for secondary elements
2. **Enhanced** (`enhanced=true`): Strong, visible interactions for primary actions

This creates a **visual hierarchy** that guides users toward important actions while keeping secondary interactions refined.

---

## When to Use Enhancement

### ✅ Use Enhanced States For:

#### Primary Actions
```typescript
<PrimaryButton
  enhancedHover={true}
  enhancedFocus={true}
  enhancedActive={true}
>
  Submit
</PrimaryButton>
```
- Main CTA buttons
- Form submissions
- Search buttons
- Save/Apply actions

#### Accessibility-Critical Elements
```typescript
<IconButton
  icon={X}
  enhancedFocus={true}  // Keyboard users need clear focus
  aria-label="Close dialog"
/>
```
- Close buttons on modals
- Navigation elements
- Skip links
- Form inputs

#### High-Stakes Interactions
```typescript
<SecondaryButton
  enhancedHover={true}
  enhancedActive={true}
  onClick={handleDelete}
>
  Delete Account
</SecondaryButton>
```
- Destructive actions
- Data modifications
- State changes
- Navigation

---

### ❌ Don't Use Enhanced States For:

#### Secondary/Background Actions
```typescript
<IconButton
  icon={ChevronRight}
  // No enhancement needed
  onClick={nextPage}
/>
```
- List item actions
- Pagination controls (unless primary)
- Accordion triggers
- Collapsible headers

#### Dense Interfaces
```typescript
{items.map(item => (
  <IconButton
    icon={Edit}
    // Keep subtle in lists
    hoverStyle="color"
  />
))}
```
- Table row actions
- List item buttons
- Repeated elements
- Toolbars with many buttons

#### Decorative Elements
```typescript
<Badge variant="outline">
  {/* Badges don't need enhancement */}
  New
</Badge>
```
- Status indicators
- Labels
- Tags
- Informational badges

---

## Visual Comparison

### Default vs Enhanced Hover

```typescript
// DEFAULT HOVER
hover:scale-105           // Subtle scale (5%)
hover:shadow-md           // Medium shadow
hover:bg-white/80         // Subtle background change

// ENHANCED HOVER
hover:scale-[1.08]        // Noticeable scale (8%)
hover:-translate-y-1      // Lift effect
hover:shadow-2xl          // Strong shadow
hover:shadow-primary/50   // Colored shadow
hover:border-primary/80   // Visible border
hover:ring-2              // Additional ring
```

### Default vs Enhanced Focus

```typescript
// DEFAULT FOCUS
focus-visible:ring-2              // Standard ring
focus-visible:ring-primary        // Primary color
focus-visible:ring-offset-2       // Small offset

// ENHANCED FOCUS
focus-visible:ring-4              // Larger ring (2x)
focus-visible:ring-primary/80     // More visible
focus-visible:ring-offset-4       // Larger offset (2x)
focus-visible:shadow-lg           // Additional shadow
focus-visible:shadow-primary/50   // Colored shadow glow
```

### Default vs Enhanced Active

```typescript
// DEFAULT ACTIVE
active:scale-[0.95]       // Subtle press (5% shrink)
active:opacity-80         // Slight opacity change

// ENHANCED ACTIVE
active:scale-[0.90]       // Noticeable press (10% shrink)
active:opacity-70         // More visible opacity change
active:border-primary/50  // Border feedback
active:ring-2             // Ring feedback
```

---

## Component Support

### Components with Enhancement Support

| Component | enhancedHover | enhancedFocus | enhancedActive | Notes |
|-----------|---------------|---------------|----------------|-------|
| `IconButton` | ✅ | ✅ | ✅ | Full support |
| `PrimaryButton` | ✅ | ✅ | ✅ | Full support |
| `SecondaryButton` | ✅ | ✅ | ✅ | Full support |
| `Pagination` | ✅ | ✅ | ✅ | Applied to nav buttons |
| `PageSizeToggle` | ✅ | ✅ | ✅ | Via button components |

### Components Without Enhancement (By Design)

- `Accordion` - Subtle by design
- `Badge` - Non-interactive
- `Checkbox` - Standard focus states sufficient
- `Collapsible` - Subtle by design
- `DocumentCard` - Complex component, managed internally

---

## Usage Examples

### Example 1: Primary Search Button

```typescript
<PrimaryButton
  icon={Search}
  enhancedHover={true}    // ✅ Makes it stand out as primary action
  enhancedFocus={true}    // ✅ Critical for keyboard users
  enhancedActive={true}   // ✅ Strong feedback on click
  onClick={handleSearch}
>
  Search
</PrimaryButton>
```

### Example 2: Modal Close Button

```typescript
<IconButton
  icon={X}
  enhancedFocus={true}    // ✅ Important for accessibility
  enhancedHover={false}   // ❌ Keep subtle, not primary action
  enhancedActive={false}  // ❌ Subtle is fine for close
  aria-label="Close"
/>
```

### Example 3: Pagination Controls

```typescript
<Pagination
  currentPage={page}
  totalPages={10}
  onPageChange={setPage}
  // Enhancement applied automatically to nav buttons
  // Page numbers use PrimaryButton/SecondaryButton with enhancement
/>
```

### Example 4: List Item Actions

```typescript
<div className="flex gap-2">
  <IconButton
    icon={Edit}
    hoverStyle="color"      // ✅ Minimal hover for list context
    enhancedHover={false}   // ❌ Don't compete with other items
    onClick={handleEdit}
  />
  <IconButton
    icon={Trash2}
    variant="error"
    enhancedFocus={true}    // ✅ Destructive action needs focus visibility
    onClick={handleDelete}
  />
</div>
```

### Example 5: Form Buttons

```typescript
<div className="flex gap-3">
  <SecondaryButton onClick={onCancel}>
    Cancel
  </SecondaryButton>

  <PrimaryButton
    enhancedHover={true}    // ✅ Primary form action
    enhancedFocus={true}    // ✅ Important for keyboard flow
    enhancedActive={true}   // ✅ Strong submit feedback
    onClick={onSubmit}
  >
    Save Changes
  </PrimaryButton>
</div>
```

---

## Best Practices

### 1. Consistent Application

✅ **Do**: Apply consistently across similar elements
```typescript
// All primary actions get full enhancement
<PrimaryButton enhancedHover enhancedFocus enhancedActive>Save</PrimaryButton>
<PrimaryButton enhancedHover enhancedFocus enhancedActive>Submit</PrimaryButton>
```

❌ **Don't**: Mix enhancement levels arbitrarily
```typescript
// Inconsistent - confusing for users
<PrimaryButton enhancedHover>Save</PrimaryButton>
<PrimaryButton>Submit</PrimaryButton>  // Why no enhancement?
```

### 2. Visual Hierarchy

✅ **Do**: Use enhancement to create hierarchy
```typescript
<PrimaryButton enhancedHover enhancedFocus enhancedActive>
  Create Account  {/* Most important */}
</PrimaryButton>
<SecondaryButton>
  Skip for now    {/* Less important */}
</SecondaryButton>
```

❌ **Don't**: Enhance everything equally
```typescript
// No hierarchy - everything competes for attention
<SecondaryButton enhancedHover enhancedFocus enhancedActive>Skip</SecondaryButton>
<SecondaryButton enhancedHover enhancedFocus enhancedActive>Back</SecondaryButton>
<SecondaryButton enhancedHover enhancedFocus enhancedActive>Next</SecondaryButton>
```

### 3. Accessibility Priority

✅ **Do**: Always enhance focus for critical elements
```typescript
<IconButton
  icon={X}
  enhancedFocus={true}  // ✅ Keyboard users need this
  aria-label="Close dialog"
/>
```

❌ **Don't**: Skip focus enhancement for modals/dialogs
```typescript
<IconButton
  icon={X}
  // ❌ Keyboard users may struggle to see focus
  onClick={onClose}
/>
```

### 4. Context Awareness

✅ **Do**: Reduce enhancement in dense interfaces
```typescript
<DataTable>
  {rows.map(row => (
    <IconButton
      icon={Edit}
      hoverStyle="color"  // ✅ Subtle in table context
    />
  ))}
</DataTable>
```

❌ **Don't**: Use strong enhancement in lists
```typescript
<DataTable>
  {rows.map(row => (
    <IconButton
      icon={Edit}
      enhancedHover={true}  // ❌ Too strong, creates visual noise
    />
  ))}
</DataTable>
```

---

## Technical Implementation

### Component Pattern

```typescript
export function MyButton({
  enhancedHover = false,
  enhancedFocus = false,
  enhancedActive = false,
  ...props
}: MyButtonProps) {
  return (
    <button
      className={cn(
        // Base styles
        "transition-all duration-300",

        // Default hover
        !enhancedHover && "hover:scale-105 hover:shadow-md",

        // Enhanced hover
        enhancedHover && cn(
          "hover:scale-[1.08] hover:-translate-y-1",
          "hover:shadow-2xl hover:shadow-primary/50",
          "hover:border-primary/80",
          "hover:ring-2 hover:ring-primary/40"
        ),

        // Default focus
        !enhancedFocus && "focus-visible:ring-2 focus-visible:ring-primary",

        // Enhanced focus
        enhancedFocus && cn(
          "focus-visible:ring-4 focus-visible:ring-primary/80 focus-visible:ring-offset-4",
          "focus-visible:shadow-lg focus-visible:shadow-primary/50"
        ),

        // Default active
        !enhancedActive && "active:scale-[0.95] active:opacity-80",

        // Enhanced active
        enhancedActive && cn(
          "active:scale-[0.90] active:opacity-70",
          "active:border-primary/50",
          "active:ring-2 active:ring-primary/30"
        )
      )}
      {...props}
    />
  );
}
```

### CSS Variables Used

Enhancement relies on semantic CSS variables:
```css
--primary         /* Primary brand color */
--primary/80      /* 80% opacity for hover borders */
--primary/50      /* 50% opacity for shadows */
--primary/40      /* 40% opacity for rings */
--primary/30      /* 30% opacity for active rings */
```

---

## Accessibility Notes

### WCAG Compliance

- **Default states** meet WCAG 2.1 AA (4.5:1 contrast minimum)
- **Enhanced focus** exceeds WCAG 2.1 AAA (7:1 contrast for focus indicators)
- All enhanced states maintain or improve accessibility

### Keyboard Navigation

Enhanced focus states are particularly important for:
- Tab navigation
- Arrow key navigation
- Screen reader users
- Motor impairment users

### Testing Checklist

When using enhancement:
- [ ] Hover state is visible
- [ ] Focus state is clearly visible (test with Tab key)
- [ ] Active state provides feedback
- [ ] Works in light and dark modes
- [ ] Color contrast meets WCAG standards
- [ ] Screen reader announces state changes

---

## Future Considerations

### Potential Improvements

1. **Single Enhancement Prop**:
   ```typescript
   // Possible future API:
   enhanced?: boolean | 'hover' | 'focus' | 'active' | 'all'
   ```

2. **Enhancement Levels**:
   ```typescript
   // Possible future API:
   enhancementLevel?: 'subtle' | 'normal' | 'strong'
   ```

3. **Context-Aware Defaults**:
   ```typescript
   // Possible future API:
   context?: 'primary' | 'secondary' | 'list' | 'toolbar'
   ```

These would be breaking changes and require careful migration planning.

---

## Related Documentation

- [CHAT_COMPONENTS_STYLING_GUIDE.md](../results/chat-components/CHAT_COMPONENTS_STYLING_GUIDE.md)
- [NEW_COMPONENTS_ANALYSIS.md](../results/NEW_COMPONENTS_ANALYSIS.md)
- [PAGINATION_COMPONENT_GUIDE.md](./PAGINATION_COMPONENT_GUIDE.md)

---

**Last Updated**: November 17, 2025
**Status**: Active
**Review Date**: March 2026
