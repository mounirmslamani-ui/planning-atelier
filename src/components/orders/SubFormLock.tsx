import React, { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';

/**
 * Per-sub-form RBAC lock.
 * - `locked` starts at `true` (read-only). All native form controls inside
 *   a wrapping `<fieldset disabled={locked}>` are automatically disabled.
 * - `unlock()` enters edit mode (called by the تعديل button).
 * - `lock()` returns to read-only (called after cancel or successful save).
 * - `EditButton` is rendered ONLY when `canEdit === true` (i.e. the user has
 *   RW on this sub-form). When `locked`, it is the clickable تعديل button.
 *   When unlocked, it shows a non-interactive « جاري التعديل » indicator.
 *
 * Place the EditButton OUTSIDE the disabled fieldset so it remains clickable.
 */
export function useSubFormLock(canEdit: boolean) {
  const [locked, setLocked] = useState(true);
  const unlock = useCallback(() => setLocked(false), []);
  const lock = useCallback(() => setLocked(true), []);

  const EditButton: React.FC<{ className?: string; size?: 'sm' | 'default' | 'lg' | 'icon' }> = ({ className, size = 'default' }) => {
    if (!canEdit) return null;
    if (!locked) {
      return (
        <Button
          type="button"
          size={size}
          variant="secondary"
          className={className}
          onClick={lock}
        >
          <Pencil className="w-4 h-4 ms-1" />
          إنهاء التعديل
        </Button>
      );
    }
    return (
      <Button
        type="button"
        size={size}
        variant="outline"
        className={className}
        onClick={() => setLocked(false)}
      >
        <Pencil className="w-4 h-4 ms-1" />
        تعديل
      </Button>
    );
  };

  return { locked, unlock, lock, EditButton };
}

export type SubFormLock = ReturnType<typeof useSubFormLock>;
