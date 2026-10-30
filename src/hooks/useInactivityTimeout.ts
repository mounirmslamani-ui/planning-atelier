import { useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

export function useInactivityTimeout(opts: {
  totalMs?: number;
  warningBeforeMs?: number;
  onTimeout: () => void;
}) {
  const totalMs = opts.totalMs ?? 15 * 60 * 1000;
  const warningBeforeMs = opts.warningBeforeMs ?? 5 * 60 * 1000;
  const [warning, setWarning] = useState(false);
  const warningRef = useRef(false);
  const warnTimer = useRef<number | null>(null);
  const expireTimer = useRef<number | null>(null);

  const clear = () => {
    if (warnTimer.current) window.clearTimeout(warnTimer.current);
    if (expireTimer.current) window.clearTimeout(expireTimer.current);
  };

  const reset = () => {
    clear();
    warningRef.current = false;
    setWarning(false);
    warnTimer.current = window.setTimeout(() => {
      warningRef.current = true;
      setWarning(true);
    }, totalMs - warningBeforeMs);
    expireTimer.current = window.setTimeout(() => {
      warningRef.current = false;
      setWarning(false);
      opts.onTimeout();
    }, totalMs);
  };

  useEffect(() => {
    reset();
    const handler = () => { if (!warningRef.current) reset(); };
    ACTIVITY_EVENTS.forEach(ev => document.addEventListener(ev, handler, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach(ev => document.removeEventListener(ev, handler));
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { warning, extend: reset };
}
