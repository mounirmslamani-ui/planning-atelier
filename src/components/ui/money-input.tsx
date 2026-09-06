import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MoneyInputProps {
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  currencyLabel?: string;
  currencyPosition?: 'start' | 'end';
}

/**
 * Champ de saisie monétaire (DZD).
 * - Vide ⇒ `undefined` (aucune valeur saisie, à distinguer de 0).
 * - Accepte uniquement des nombres positifs, décimales avec point.
 */
const MoneyInput: React.FC<MoneyInputProps> = ({ value, onValueChange, disabled, className, placeholder = '0.00', currencyLabel = 'DZD', currencyPosition = 'end' }) => {
  const [text, setText] = React.useState<string>(value != null ? String(value) : '');

  React.useEffect(() => {
    setText(value != null ? String(value) : '');
  }, [value]);

  const handleChange = (raw: string) => {
    const cleaned = raw.replace(/,/g, '.').replace(/[^\d.]/g, '');
    setText(cleaned);
    if (cleaned === '') { onValueChange(undefined); return; }
    const n = Number(cleaned);
    if (!Number.isNaN(n) && n >= 0) onValueChange(n);
  };

  const isStart = currencyPosition === 'start';

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        dir="ltr"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        className={cn('h-8 text-xs text-left', isStart ? 'ps-12' : 'pe-12', className)}
      />
        <span className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground', isStart ? 'start-2' : 'end-2')}>{currencyLabel}</span>
    </div>
  );
};

export default MoneyInput;
