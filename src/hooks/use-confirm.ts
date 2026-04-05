import { useState, useCallback } from 'react';

export function useConfirm() {
  const [state, setState] = useState<{ open: boolean; title: string; description?: string; onConfirm: () => void; variant?: 'destructive' | 'default' }>({
    open: false, title: '', onConfirm: () => {},
  });

  const confirm = useCallback((title: string, onConfirm: () => void, opts?: { description?: string; variant?: 'destructive' | 'default' }) => {
    setState({ open: true, title, onConfirm, description: opts?.description, variant: opts?.variant ?? 'destructive' });
  }, []);

  const handleConfirm = useCallback(() => {
    state.onConfirm();
    setState(s => ({ ...s, open: false }));
  }, [state]);

  const handleCancel = useCallback(() => {
    setState(s => ({ ...s, open: false }));
  }, []);

  return { confirmState: state, confirm, handleConfirm, handleCancel };
}
