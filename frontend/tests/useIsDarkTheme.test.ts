import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useIsDarkTheme } from '@/hooks/useIsDarkTheme';

describe('useIsDarkTheme', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('returns false when dark class is absent', () => {
    const { result } = renderHook(() => useIsDarkTheme());

    expect(result.current).toBe(false);
  });

  it('reacts to theme class changes', async () => {
    const { result } = renderHook(() => useIsDarkTheme());

    expect(result.current).toBe(false);

    act(() => {
      document.documentElement.classList.add('dark');
    });
    await waitFor(() => {
      expect(result.current).toBe(true);
    });

    act(() => {
      document.documentElement.classList.remove('dark');
    });
    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
