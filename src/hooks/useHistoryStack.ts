import { useCallback, useRef, useState } from 'react';

interface UseHistoryStackOptions<T> {
  initialPresent: T;
  limit?: number;
  isEqual?: (a: T, b: T) => boolean;
}

interface UseHistoryStackResult<T> {
  canUndo: boolean;
  canRedo: boolean;
  commit: (nextPresent: T) => void;
  undo: () => T | null;
  redo: () => T | null;
  reset: (nextPresent: T) => void;
}

export function useHistoryStack<T>({
  initialPresent,
  limit = 50,
  isEqual,
}: UseHistoryStackOptions<T>): UseHistoryStackResult<T> {
  const historyRef = useRef<T[]>([initialPresent]);
  const indexRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback(() => {
    setCanUndo(indexRef.current > 0);
    setCanRedo(indexRef.current < historyRef.current.length - 1);
  }, []);

  const reset = useCallback((nextPresent: T) => {
    historyRef.current = [nextPresent];
    indexRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const commit = useCallback((nextPresent: T) => {
    const currentPresent = historyRef.current[indexRef.current];
    if (isEqual?.(currentPresent, nextPresent)) {
      return;
    }

    const truncated = historyRef.current.slice(0, indexRef.current + 1);
    truncated.push(nextPresent);

    if (truncated.length > limit) {
      historyRef.current = truncated.slice(truncated.length - limit);
      indexRef.current = historyRef.current.length - 1;
    } else {
      historyRef.current = truncated;
      indexRef.current = truncated.length - 1;
    }

    syncFlags();
  }, [isEqual, limit, syncFlags]);

  const undo = useCallback(() => {
    if (indexRef.current === 0) {
      return null;
    }

    indexRef.current -= 1;
    syncFlags();
    return historyRef.current[indexRef.current];
  }, [syncFlags]);

  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) {
      return null;
    }

    indexRef.current += 1;
    syncFlags();
    return historyRef.current[indexRef.current];
  }, [syncFlags]);

  return {
    canUndo,
    canRedo,
    commit,
    undo,
    redo,
    reset,
  };
}