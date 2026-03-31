/**
 * Tests for the useAsyncOperation and useAsyncOperationWithRetry hooks.
 *
 * Uses renderHook from React Testing Library to test hook behavior.
 */

import { renderHook, act } from '@testing-library/react';
import { useAsyncOperation, useAsyncOperationWithRetry } from '@/lib/hooks/useAsyncOperation';

describe('useAsyncOperation', () => {
  // ── Basic success flow ─────────────────────────────────────────────────

  it('starts with null data, no error, not loading', () => {
    const { result } = renderHook(() =>
      useAsyncOperation(async () => 'data')
    );

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('sets isLoading during execution and stores result', async () => {
    const asyncFn = jest.fn(async () => 'result');

    const { result } = renderHook(() => useAsyncOperation(asyncFn));

    let returnValue: string | null = null;
    await act(async () => {
      returnValue = await result.current.execute();
    });

    expect(returnValue).toBe('result');
    expect(result.current.data).toBe('result');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it('captures error message on failure', async () => {
    const asyncFn = jest.fn(async () => {
      throw new Error('boom');
    });

    const { result } = renderHook(() => useAsyncOperation(asyncFn));

    let returnValue: unknown = 'initial';
    await act(async () => {
      returnValue = await result.current.execute();
    });

    expect(returnValue).toBeNull();
    expect(result.current.error).toBe('boom');
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('handles string errors', async () => {
    const asyncFn = jest.fn(async () => {
      throw 'string error';
    });

    const { result } = renderHook(() => useAsyncOperation(asyncFn));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.error).toBe('string error');
  });

  it('handles unknown error types with default message', async () => {
    const asyncFn = jest.fn(async () => {
      throw 42;
    });

    const { result } = renderHook(() => useAsyncOperation(asyncFn));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.error).toBe('An unexpected error occurred');
  });

  // ── Callbacks ──────────────────────────────────────────────────────────

  it('calls onSuccess callback on success', async () => {
    const onSuccess = jest.fn();
    const { result } = renderHook(() =>
      useAsyncOperation(async () => 'data', { onSuccess })
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(onSuccess).toHaveBeenCalledWith('data');
  });

  it('calls onError callback on failure', async () => {
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useAsyncOperation(async () => { throw new Error('fail'); }, { onError })
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(onError).toHaveBeenCalledWith('fail');
  });

  // ── Custom error transform ────────────────────────────────────────────

  it('uses custom errorTransform', async () => {
    const { result } = renderHook(() =>
      useAsyncOperation(
        async () => { throw new Error('original'); },
        { errorTransform: () => 'transformed error' }
      )
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.error).toBe('transformed error');
  });

  // ── Initial data ──────────────────────────────────────────────────────

  it('supports initialData', () => {
    const { result } = renderHook(() =>
      useAsyncOperation(async () => 'new', { initialData: 'initial' })
    );

    expect(result.current.data).toBe('initial');
  });

  // ── reset ──────────────────────────────────────────────────────────────

  it('reset restores initial state', async () => {
    const { result } = renderHook(() =>
      useAsyncOperation(async () => 'data', { initialData: 'init' })
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toBe('data');

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toBe('init');
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  // ── setData / setError ─────────────────────────────────────────────────

  it('setData updates data directly', () => {
    const { result } = renderHook(() =>
      useAsyncOperation<string>(async () => 'data')
    );

    act(() => {
      result.current.setData('manual');
    });

    expect(result.current.data).toBe('manual');
  });

  it('setError updates error directly', () => {
    const { result } = renderHook(() =>
      useAsyncOperation(async () => 'data')
    );

    act(() => {
      result.current.setError('manual error');
    });

    expect(result.current.error).toBe('manual error');
  });

  // ── Passes parameters to async function ────────────────────────────────

  it('forwards parameters to the async function', async () => {
    const asyncFn = jest.fn(async (a: string, b: number) => `${a}-${b}`);

    const { result } = renderHook(() => useAsyncOperation(asyncFn));

    await act(async () => {
      await result.current.execute('hello', 42);
    });

    expect(asyncFn).toHaveBeenCalledWith('hello', 42);
    expect(result.current.data).toBe('hello-42');
  });
});

// ── useAsyncOperationWithRetry ───────────────────────────────────────────

describe('useAsyncOperationWithRetry', () => {
  it('retries on failure up to maxRetries', async () => {
    let attempts = 0;
    const asyncFn = jest.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error('fail');
      return 'success';
    });

    const { result } = renderHook(() =>
      useAsyncOperationWithRetry(asyncFn, { maxRetries: 3, retryDelay: 10 })
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toBe('success');
    expect(asyncFn).toHaveBeenCalledTimes(3);
  }, 15000);

  it('gives up after maxRetries and sets error', async () => {
    const asyncFn = jest.fn(async () => {
      throw new Error('always fails');
    });

    const { result } = renderHook(() =>
      useAsyncOperationWithRetry(asyncFn, { maxRetries: 2, retryDelay: 10 })
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.error).toBe('always fails');
    // 1 initial + 2 retries = 3 total calls
    expect(asyncFn).toHaveBeenCalledTimes(3);
  }, 15000);

  it('exposes retryCount', async () => {
    const asyncFn = jest.fn(async () => 'ok');

    const { result } = renderHook(() =>
      useAsyncOperationWithRetry(asyncFn, { maxRetries: 2, retryDelay: 10 })
    );

    await act(async () => {
      await result.current.execute();
    });

    // On first success, retryCount should be 0
    expect(result.current.retryCount).toBe(0);
  });
});
