# Guide: Adding Components to Style Demo Page

## Overview

This guide explains how to add a new component to the style demo page (`/app/style-demo/page.tsx`). The demo page automatically extracts and displays color configurations from component source files, making it easy to document and showcase component styling.

---

## Prerequisites

Before adding a component to the demo page, ensure:

- ✅ Component is created in `/lib/styles/components/`
- ✅ Component follows the color system standards
- ✅ Component uses Tailwind CSS classes (not hardcoded colors)
- ✅ Component has proper JSX comments for context (optional but recommended)

**Reference**: See [Creating New Components](./creating-components.md) for component creation guidelines.

---

## Step-by-Step Process

### Step 1: Create Color Extractor Function

First, create a color extractor function in `/lib/styles/utils/color-extractors.ts`.

#### Pattern for Dynamic Extraction (Recommended)

If your component is in `/lib/styles/components/`, use the automatic extraction:

```typescript
/**
 * Extract [ComponentName] colors
 */
export async function get[ComponentName]Colors() {
  return extractColorsFromComponentPath('@/lib/styles/components/[component-name].tsx');
}
```

**Example**:
```typescript
/**
 * Extract base card colors
 */
export async function getBaseCardColors() {
  return extractColorsFromComponentPath('@/lib/styles/components/base-card.tsx');
}
```

#### Pattern for Manual Extraction (Legacy)

If you need manual control (not recommended), you can return a static array:

```typescript
export function get[ComponentName]Colors() {
  return [
    {
      name: "Background Gradient",
      type: "gradient" as const,
      value: {
        light: "from-blue-400/20 via-indigo-400/15 to-purple-400/15",
        dark: "from-blue-500/20 via-indigo-500/15 to-purple-500/15",
      },
      usage: "Card background gradient",
    },
    {
      name: "Border",
      type: "color" as const,
      value: "slate-200",
      usage: "Card border color",
    },
  ];
}
```

**Note**: The dynamic extraction automatically:
- Parses component source code
- Extracts Tailwind classes (gradients, colors, borders, shadows)
- Generates descriptive names from context (JSX comments, className patterns)
- Handles light/dark mode variants
- Deduplicates gradients and colors

---

### Step 2: Import Component and Extractor

In `/app/style-demo/page.tsx`, add the imports:

#### Import the Component

```typescript
import { 
  [ComponentName],
  // ... other components
} from "@/lib/styles/components";
```

#### Import the Color Extractor

```typescript
import {
  get[ComponentName]Colors,
  // ... other extractors
} from "@/lib/styles/utils/color-extractors";
```

**Example**:
```typescript
import { 
  BaseCard,
  // ... other components
} from "@/lib/styles/components";

import {
  getBaseCardColors,
  // ... other extractors
} from "@/lib/styles/utils/color-extractors";
```

---

### Step 3: Add Component Section

Add a new section in the `StyleDemoPage` component. The structure depends on whether your component belongs to a family or is standalone.

#### Pattern A: Standalone Component

For components that don't belong to a family (like `EmptyState`, `ChatContainer`):

```typescript
{/* [ComponentName] Section */}
<section id="[component-id]" className="mb-6 scroll-mt-8">
  <Collapsible open={openSections['[component-id]']} onOpenChange={() => toggleSection('[component-id]')}>
    <Card className="border-2">
      <CollapsibleTrigger asChild>
        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ChevronDown
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform duration-200",
                  openSections['[component-id]'] && "rotate-180"
                )}
              />
              <div>
                <CardTitle className="text-2xl font-bold">[ComponentName]</CardTitle>
                <CardDescription className="mt-2">
                  [Brief description of the component]
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-sm">Element [N]</Badge>
          </div>
        </CardHeader>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CardContent className="space-y-8">
          {/* Usage Examples */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Usage Examples</h3>
            <div className="space-y-6">
              {/* Example 1 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Default Usage</Badge>
                  <code className="text-xs text-muted-foreground">Standard component usage</code>
                </div>
                <div className="p-4 bg-muted/30 rounded-lg">
                  <[ComponentName]>
                    {/* Component content */}
                  </[ComponentName]>
                </div>
              </div>
            </div>
          </div>

          {/* Code Usage Section */}
          <CodeUsageSection code={`import { [ComponentName] } from "@/lib/styles/components";

<[ComponentName]>
  {/* Component content */}
</[ComponentName]>`} />

          {/* Color Configuration Section */}
          <AsyncColorConfigurationSection
            getColors={get[ComponentName]Colors}
          />
        </CardContent>
      </CollapsibleContent>
    </Card>
  </Collapsible>
</section>
```

#### Pattern B: Component in a Family

For components that belong to a family (like buttons, badges, headers), use `FamilyCard` and `ComponentSubSection`:

```typescript
{/* [FamilyName] Family */}
<FamilyCard
  id="[family-id]"
  title="[FamilyName]"
  description="[Family description]"
  icon={[IconComponent]}
  isOpen={openSections['[family-id]']}
  onToggle={() => toggleSection('[family-id]')}
>
  <ComponentSubSection
    id="[component-id]"
    title="[ComponentName]"
    description="[Component description]"
    icon={[IconComponent]}
    isOpen={openSections['[component-id]']}
    onToggle={() => toggleSection('[component-id]')}
  >
    <div className="space-y-8">
      {/* Usage Examples */}
      <UsageExamplesSection
        examples={[
          {
            label: "Default Usage",
            description: "Standard component usage",
            content: (
              <[ComponentName]>Content</[ComponentName]>
            ),
          },
          // Add more examples as needed
        ]}
      />
      
      {/* Color Configuration Section */}
      <AsyncColorConfigurationSection
        getColors={get[ComponentName]Colors}
      />
    </div>
  </ComponentSubSection>
</FamilyCard>
```

---

### Step 4: Choose the Right Color Configuration Component

There are two components for displaying colors:

#### `AsyncColorConfigurationSection` (Recommended)

Use this for components that use **dynamic extraction** (async functions):

```typescript
<AsyncColorConfigurationSection
  getColors={get[ComponentName]Colors}
/>
```

**When to use**:
- Component uses `extractColorsFromComponentPath()`
- Extractor function is `async`
- Colors are automatically extracted from source code

**Features**:
- Shows loading spinner while extracting colors
- Automatically handles errors
- No manual color definitions needed

#### `ColorConfigurationSection` (Legacy)

Use this for components that use **manual extraction** (synchronous functions):

```typescript
<ColorConfigurationSection
  colors={get[ComponentName]Colors()}
/>
```

**When to use**:
- Component uses manual color definitions
- Extractor function is synchronous
- You need full control over displayed colors

**Note**: Prefer `AsyncColorConfigurationSection` for new components to leverage automatic extraction.

---

### Step 5: Add Section to State Management

Add the component section ID to the `openSections` state initialization:

```typescript
const [openSections, setOpenSections] = useState<Record<string, boolean>>({
  // ... existing sections
  '[component-id]': false, // Add your component ID here
});
```

---

## Complete Example

Here's a complete example for adding a new `StatusBadge` component:

### 1. Color Extractor (`color-extractors.ts`)

```typescript
/**
 * Extract status badge colors
 */
export async function getStatusBadgeColors() {
  return extractColorsFromComponentPath('@/lib/styles/components/status-badge.tsx');
}
```

### 2. Imports (`page.tsx`)

```typescript
import { StatusBadge } from "@/lib/styles/components";
import { getStatusBadgeColors } from "@/lib/styles/utils/color-extractors";
import { CheckCircle } from "lucide-react";
```

### 3. Component Section (`page.tsx`)

```typescript
{/* Status Badge Section */}
<section id="status-badge" className="mb-6 scroll-mt-8">
  <Collapsible open={openSections['status-badge']} onOpenChange={() => toggleSection('status-badge')}>
    <Card className="border-2">
      <CollapsibleTrigger asChild>
        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ChevronDown
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform duration-200",
                  openSections['status-badge'] && "rotate-180"
                )}
              />
              <div>
                <CardTitle className="text-2xl font-bold">Status Badge</CardTitle>
                <CardDescription className="mt-2">
                  Badge component for displaying status indicators
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-sm">Element 10</Badge>
          </div>
        </CardHeader>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CardContent className="space-y-8">
          {/* Usage Examples */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Usage Examples</h3>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Default Usage</Badge>
                  <code className="text-xs text-muted-foreground">Standard status badge</code>
                </div>
                <div className="p-4 bg-muted/30 rounded-lg">
                  <StatusBadge status="success">Active</StatusBadge>
                </div>
              </div>
            </div>
          </div>

          <CodeUsageSection code={`import { StatusBadge } from "@/lib/styles/components";

<StatusBadge status="success">Active</StatusBadge>
<StatusBadge status="error">Inactive</StatusBadge>`} />

          <AsyncColorConfigurationSection
            getColors={getStatusBadgeColors}
          />
        </CardContent>
      </CollapsibleContent>
    </Card>
  </Collapsible>
</section>
```

### 4. State Management

```typescript
const [openSections, setOpenSections] = useState<Record<string, boolean>>({
  // ... existing sections
  'status-badge': false,
});
```

---

## Best Practices

### 1. Use Descriptive JSX Comments

Add JSX comments to your component to help the automatic extractor generate better gradient names:

```tsx
{/* Gradient overlay - Vibrant multi-color depth layer */}
<div className={cn(
  "absolute inset-0 -z-10 pointer-events-none",
  "bg-gradient-to-br from-blue-400/20 via-indigo-400/15 to-purple-400/15",
  "dark:bg-gradient-to-br dark:from-blue-500/20 dark:via-indigo-500/15 dark:to-purple-500/15"
)} />
```

This will generate names like "Overlay Gradient" instead of "Blue 400 to Purple 400 Gradient".

### 2. Provide Multiple Usage Examples

Show different variants, states, and use cases:

```typescript
<UsageExamplesSection
  examples={[
    {
      label: "Default",
      description: "Standard usage",
      content: <Component>Content</Component>,
    },
    {
      label: "With Variant",
      description: "Using variant prop",
      content: <Component variant="secondary">Content</Component>,
    },
    {
      label: "Disabled State",
      description: "Disabled component",
      content: <Component disabled>Content</Component>,
    },
  ]}
/>
```

### 3. Include Code Examples

Always include a `CodeUsageSection` with import statements and usage examples:

```typescript
<CodeUsageSection code={`import { Component } from "@/lib/styles/components";

<Component prop="value">
  Content
</Component>`} />
```

### 4. Use Appropriate Icons

Choose icons that represent the component's purpose:

```typescript
import { CheckCircle, AlertCircle, Info } from "lucide-react";

// For success/status components
icon={CheckCircle}

// For error/warning components
icon={AlertCircle}

// For info components
icon={Info}
```

### 5. Organize Related Components

Group related components into families:

```typescript
<FamilyCard
  id="badges-family"
  title="Badges"
  description="Badge components for labels and indicators"
  icon={Sparkles}
>
  <ComponentSubSection id="ai-badge" ... />
  <ComponentSubSection id="status-badge" ... />
</FamilyCard>
```

---

## Troubleshooting

### Colors Not Showing

**Problem**: `AsyncColorConfigurationSection` shows loading spinner indefinitely or no colors.

**Solutions**:
1. Check that the component path in `extractColorsFromComponentPath()` is correct
2. Verify the component file exists at the specified path
3. Check browser console for errors
4. Ensure the API route `/api/component-source` is accessible
5. Verify the component uses Tailwind classes (not inline styles)

### Gradient Names Not Descriptive

**Problem**: Gradients show generic names like "Gradient 1" or "Primary via Indigo 500 to Purple 500 Gradient".

**Solutions**:
1. Add JSX comments before gradient elements:
   ```tsx
   {/* Overlay gradient for depth effect */}
   <div className="bg-gradient-to-br from-blue-400/20 ..." />
   ```
2. Use descriptive className patterns (e.g., `overlay-gradient`, `background-gradient`)
3. The extractor will automatically detect context from comments and classNames

### Component Not Rendering

**Problem**: Component doesn't appear in the demo page.

**Solutions**:
1. Check that the component is imported correctly
2. Verify the section ID is added to `openSections` state
3. Ensure the component is exported from `/lib/styles/components/index.ts`
4. Check for TypeScript errors in the component

### Type Errors

**Problem**: TypeScript errors when using `AsyncColorConfigurationSection`.

**Solutions**:
1. Ensure the extractor function returns `Promise<ColorEntry[]>`
2. Check that `ColorEntry` type matches the expected structure
3. Verify the function is properly exported

---

## Related Documentation

- **[Creating New Components](./creating-components.md)** - Guide for creating styled components
- **Colors Styling Guide** - Color system documentation
- **[Component Colors Cheat Sheet](./component-colors.md)** - Quick color reference
- **Style Demo Page**: `/app/style-demo/page.tsx` - Live examples

---

## Summary Checklist

When adding a component to the demo page:

- [ ] Create color extractor function in `color-extractors.ts`
- [ ] Import component in `page.tsx`
- [ ] Import color extractor function in `page.tsx`
- [ ] Add component section (standalone or in family)
- [ ] Add usage examples
- [ ] Add code usage section
- [ ] Add `AsyncColorConfigurationSection` or `ColorConfigurationSection`
- [ ] Add section ID to `openSections` state
- [ ] Test component renders correctly
- [ ] Test colors are extracted and displayed
- [ ] Verify gradient names are descriptive (add JSX comments if needed)

---

**Last Updated**: Based on automatic color extraction system
**Status**: ✅ Complete and up-to-date

