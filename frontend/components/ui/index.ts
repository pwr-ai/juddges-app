/**
 * UI Components Index
 *
 * Central export point for all UI components in the design system.
 */

// Existing components (examples - these may already be exported elsewhere)
export { Button, buttonVariants } from './button';
export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent } from './card';
export { Loader } from './loader';

// Loading States
export { LoadingSpinner, InlineSpinner } from './LoadingSpinner';
export { ProgressiveLoader } from './ProgressiveLoader';

// Skeleton Components
export {
  SkeletonText,
  SkeletonCard,
  SearchResultsSkeleton,
  ChatMessageSkeleton,
  TableSkeleton
} from './skeletons';

// Empty States
export { EmptyState } from './EmptyState';
export { EmptySearchResults } from './EmptySearchResults';
export { EmptyCollections } from './EmptyCollections';
export { EmptyChatHistory } from './EmptyChatHistory';
export { EmptyDocuments } from './EmptyDocuments';
export { EmptySavedItems } from './EmptySavedItems';
