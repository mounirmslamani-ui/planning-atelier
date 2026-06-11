import { useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

export function useInactivityTimeout(opts: {
  totalMs?: number;
  warningBeforeMs?: number;
  onTimeout: () => void;
}) {
  const totalMs = opts.totalMs ?? 20 * 60 * 1000;
  const warningBeforeMs = opts.warningBeforeMs ?? 2 * 60 * 1000;
  const [warning, setWarning] = useState(false);
  const warnTimer = useRef<number | null>(null);
  const expireTimer = useRef<number | null>(null);

  const clear = () => {
    if (warnTimer.current) window.clearTimeout(warnTimer.current);
    if (expireTimer.current) window.clearTimeout(expireTimer.current);
  };

  const reset = () => {
    clear();
    setWarning(false);
    warnTimer.current = window.setTimeout(() => setWarning(true), totalMs - warningBeforeMs);
    expireTimer.current = window.setTimeout(() => {
      setWarning(false);
      opts.onTimeout();
    }, totalMs);
  };

  useEffect(() => {
    reset();
    const handler = () => { if (!warning) reset(); };
    ACTIVITY_EVENTS.forEach(ev => document.addEventListener(ev, handler, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach(ev => document.removeEventListener(ev, handler));
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { warning, extend: reset };
}
