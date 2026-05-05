# Pagination Component Guide

## Overview

The `Pagination` component is a reusable, fully-styled pagination control that follows the unified styling guide. It provides comprehensive navigation controls with a modern glass-morphism design.

## Features

- **Navigation Controls**: First/Last, Previous/Next, and direct page number navigation
- **Smart Ellipsis**: Automatically shows ellipsis for large page ranges
- **Jump to Page**: Quick navigation input for jumping to any page
- **Page Size Selector**: Configurable page size dropdown
- **Results Counter**: Shows current range and total results
- **Fully Accessible**: ARIA labels, keyboard navigation, and focus indicators
- **Responsive**: Adapts to mobile and desktop layouts
- **Themed**: Automatically adapts to light/dark mode

## Styling

The component follows the unified styling guide with:

- **Semantic Tokens**: Uses CSS variables from `globals.css`
- **Gradient Overlays**: Consistent gradient patterns matching BaseCard
- **Backdrop Blur**: Modern glass-morphism effect
- **Hover Effects**: Smooth scale and shadow transitions
- **Active States**: Primary gradient for current page
- **Focus States**: Visible focus rings for accessibility

### Color System

```typescript
// Active page button
bg-gradient-to-br from-primary/20 via-indigo-500/20 to-purple-500/20
border-primary/30
text-primary
shadow-primary/10

// Inactive page button
bg-white/60 dark:bg-slate-800/60
border-slate-200/50 dark:border-slate-700/50
hover:from-primary/10 hover:via-indigo-500/10 hover:to-purple-500/10

// Navigation buttons
Same as inactive with hover effects
```

## Usage

### Basic Example

```tsx
import { Pagination } from '@/lib/styles/components';

function MyComponent() {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  return (
    <Pagination
      currentPage={currentPage}
      totalPages={10}
      totalResults={100}
      pageSize={pageSize}
      onPageChange={setCurrentPage}
      onPageSizeChange={setPageSize}
    />
  );
}
```

### Search Results Example

```tsx
import { Pagination } from '@/lib/styles/components';

function SearchResults() {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const totalResults = 487;
  const totalPages = Math.ceil(totalResults / size);

  return (
    <div>
      {/* Your results */}
      <div className="space-y-4">
        {results.map(result => <ResultCard key={result.id} {...result} />)}
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalResults={totalResults}
        pageSize={size}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setSize(newSize);
          setPage(1); // Reset to first page
        }}
        className="mt-6"
      />
    </div>
  );
}
```

### Without Page Size Selector

```tsx
<Pagination
  currentPage={currentPage}
  totalPages={10}
  totalResults={100}
  pageSize={10}
  onPageChange={setCurrentPage}
  onPageSizeChange={setPageSize}
  showPageSizeSelector={false}
/>
```

### Custom Page Size Options

```tsx
<Pagination
  currentPage={currentPage}
  totalPages={10}
  totalResults={100}
  pageSize={10}
  onPageChange={setCurrentPage}
  onPageSizeChange={setPageSize}
  pageSizeOptions={[5, 10, 25, 50]}
/>
```

### With Custom Styling

```tsx
<Pagination
  currentPage={currentPage}
  totalPages={10}
  totalResults={100}
  pageSize={10}
  onPageChange={setCurrentPage}
  onPageSizeChange={setPageSize}
  className="my-8 shadow-xl"
/>
```

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `currentPage` | `number` | Yes | - | Current active page (1-indexed) |
| `totalPages` | `number` | Yes | - | Total number of pages |
| `totalResults` | `number` | Yes | - | Total number of results |
| `pageSize` | `number` | Yes | - | Number of items per page |
| `onPageChange` | `(page: number) => void` | Yes | - | Callback when page changes |
| `onPageSizeChange` | `(size: number) => void` | Yes | - | Callback when page size changes |
| `className` | `string` | No | `""` | Additional CSS classes |
| `showPageSizeSelector` | `boolean` | No | `true` | Show/hide page size dropdown |
| `pageSizeOptions` | `number[]` | No | `[10, 20, 50, 100]` | Available page size options |

## Integration with Existing Code

### SearchPagination Component

The existing `SearchPagination` component has been refactored to use the new reusable `Pagination` component:

```tsx
// Before: Custom implementation
// After: Wrapper around Pagination
import { Pagination } from '@/lib/styles/components';

export function SearchPagination(props) {
  return <Pagination {...props} />;
}
```

This ensures backward compatibility while centralizing the pagination logic.

## Page Number Display Logic

The component uses smart ellipsis to handle large page ranges:

- **≤7 pages**: Shows all page numbers
- **Near start**: Shows first pages + ellipsis + last page
- **Near end**: Shows first page + ellipsis + last pages
- **Middle**: Shows first page + ellipsis + range around current + ellipsis + last page

Example for page 15 of 50:
```
1 ... 13 14 [15] 16 17 ... 50
```

## Accessibility

The component follows WCAG 2.1 AA standards:

- **ARIA Labels**: All icon-only buttons have descriptive labels
- **Screen Reader Text**: Hidden text for screen readers
- **Focus Indicators**: Visible focus rings on all interactive elements
- **Keyboard Navigation**: Full keyboard support
- **Color Contrast**: All colors meet minimum contrast ratios

### Keyboard Shortcuts

- `Tab/Shift+Tab`: Navigate between controls
- `Enter/Space`: Activate buttons
- `Arrow Keys`: Navigate in dropdowns
- `Number Input + Enter`: Jump to specific page

## Responsive Behavior

- **Desktop (≥1024px)**: Single row layout with all controls visible
- **Tablet/Mobile (<1024px)**: Stacked layout with controls wrapping

## Theme Support

The component automatically adapts to light/dark mode using semantic tokens:

```css
/* Light Mode */
--primary: oklch(0.58 0.24 265.00);
--background: oklch(1.00 0 0);

/* Dark Mode */
--primary: oklch(0.65 0.24 265.00);
--background: oklch(0.20 0 0);
```

## Performance

- **Memoization**: Smart memoization of page number calculations
- **Efficient Rendering**: Only re-renders when props change
- **No External Dependencies**: Uses only built-in components

## Testing

### Unit Tests

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from '@/lib/styles/components';

test('navigates to next page', () => {
  const onPageChange = jest.fn();

  render(
    <Pagination
      currentPage={1}
      totalPages={10}
      totalResults={100}
      pageSize={10}
      onPageChange={onPageChange}
      onPageSizeChange={jest.fn()}
    />
  );

  fireEvent.click(screen.getByTitle('Next page'));
  expect(onPageChange).toHaveBeenCalledWith(2);
});
```

## Common Patterns

### Resetting to Page 1 on Filter Change

```tsx
useEffect(() => {
  setCurrentPage(1);
}, [filters]);
```

### Persisting Page State

```tsx
const [page, setPage] = useLocalStorage('page', 1);
const [size, setSize] = useLocalStorage('pageSize', 10);
```

### Loading States

```tsx
{isLoading ? (
  <div className="flex justify-center py-8">
    <LoadingIndicator size="lg" />
  </div>
) : (
  <Pagination {...paginationProps} />
)}
```

## Migration Guide

### From SearchPagination

No changes needed! `SearchPagination` now wraps the new `Pagination` component.

### From Custom Pagination

Replace your custom pagination with:

```tsx
// Before
<div className="custom-pagination">
  {/* Custom pagination logic */}
</div>

// After
import { Pagination } from '@/lib/styles/components';

<Pagination
  currentPage={currentPage}
  totalPages={totalPages}
  totalResults={totalResults}
  pageSize={pageSize}
  onPageChange={setCurrentPage}
  onPageSizeChange={setPageSize}
/>
```

## Related Components

- **SearchPagination**: Search-specific wrapper with different defaults
- **EmptyState**: Display when no results
- **LoadingIndicator**: Display during loading
- **BaseCard**: Uses same gradient patterns

## Support

For questions or issues:
1. Check this guide
2. Review the component source code
3. Check the styling guide documentation
4. Consult the component demo page

---

**Last Updated**: November 17, 2025
**Component Version**: 1.0.0
**Styling Guide Version**: 2.0
