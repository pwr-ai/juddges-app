/**
 * Hook for managing async operations with loading, error, and data state.
 * Reduces boilerplate for common async patterns across components.
 */

import { useCallback, useState } from 'react';

export interface AsyncOperationState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

export interface AsyncOperationHandlers<T, P extends unknown[]> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  execute: (...params: P) => Promise<T | null>;
  reset: () => void;
  setData: (data: T | null) => void;
  setError: (error: string | null) => void;
}

export interface UseAsyncOperationOptions<T> {
  /** Initial data value */
  initialData?: T | null;
  /** Callback when operation succeeds */
  onSuccess?: (data: T) => void;
  /** Callback when operation fails */
  onError?: (error: string) => void;
  /** Transform error message before setting */
  errorTransform?: (error: unknown) => string;
}

/**
 * Default error transformer - extracts message from various error types
 */
const defaultErrorTransform = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unexpected error occurred';
};

/**
 * Hook for managing async operations with consistent loading and error state.
 *
 * @example
 * ```tsx
 * const { data, error, isLoading, execute } = useAsyncOperation(
 *   async (userId: string) => {
 *     const response = await fetch(`/api/users/${userId}`);
 *     if (!response.ok) throw new Error('Failed to fetch user');
 *     return response.json();
 *   },
 *   { onSuccess: (user) => console.log('User loaded:', user.name) }
 * );
 *
 * // Later: execute('123')
 * ```
 */
export function useAsyncOperation<T, P extends unknown[] = []>(
  asyncFn: (...params: P) => Promise<T>,
  options: UseAsyncOperationOptions<T> = {}
): AsyncOperationHandlers<T, P> {
  const {
    initialData = null,
    onSuccess,
    onError,
    errorTransform = defaultErrorTransform,
  } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const execute = useCallback(
    async (...params: P): Promise<T | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await asyncFn(...params);
        setData(result);
        onSuccess?.(result);
        return result;
      } catch (err) {
        const errorMessage = errorTransform(err);
        setError(errorMessage);
        onError?.(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [asyncFn, onSuccess, onError, errorTransform]
  );

  const reset = useCallback(() => {
    setData(initialData);
    setError(null);
    setIsLoading(false);
  }, [initialData]);

  return {
    data,
    error,
    isLoading,
    execute,
    reset,
    setData,
    setError,
  };
}

/**
 * Hook for managing multiple async operations of the same type.
 * Useful for batch operations or operations on collections.
 *
 * @example
 * ```tsx
 * const { results, execute, isAnyLoading } = useAsyncOperations<User>(
 *   async (userId: string) => fetchUser(userId)
 * );
 *
 * // Execute multiple operations
 * await Promise.all(userIds.map(id => execute(id)));
 * ```
 */
export function useAsyncOperationWithRetry<T, P extends unknown[] = []>(
  asyncFn: (...params: P) => Promise<T>,
  options: UseAsyncOperationOptions<T> & {
    maxRetries?: number;
    retryDelay?: number;
  } = {}
): AsyncOperationHandlers<T, P> & { retryCount: number } {
  const { maxRetries = 3, retryDelay = 1000, ...restOptions } = options;
  const [retryCount, setRetryCount] = useState(0);

  const retryingAsyncFn = useCallback(
    async (...params: P): Promise<T> => {
      let lastError: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          setRetryCount(attempt);
          return await asyncFn(...params);
        } catch (err) {
          lastError = err;
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          }
        }
      }

      throw lastError;
    },
    [asyncFn, maxRetries, retryDelay]
  );

  const handlers = useAsyncOperation(retryingAsyncFn, restOptions);

  return {
    ...handlers,
    retryCount,
  };
}

export default useAsyncOperation;
