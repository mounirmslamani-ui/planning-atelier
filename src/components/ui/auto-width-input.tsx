import * as React from 'react';
import { Input } from '@/components/ui/input';

export interface AutoWidthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  minWidth?: number;
  maxWidth?: number;
}

export const AutoWidthInput = React.forwardRef<HTMLInputElement, AutoWidthInputProps>(
  ({ minWidth = 96, maxWidth = 420, value, placeholder, style, ...rest }, ref) => {
    const spanRef = React.useRef<HTMLSpanElement | null>(null);
    const [width, setWidth] = React.useState<number>(minWidth);

    const measureText = (value ?? '').toString() || placeholder || '';

    React.useLayoutEffect(() => {
      if (spanRef.current) {
        const w = spanRef.current.offsetWidth + 24;
        setWidth(Math.max(minWidth, Math.min(maxWidth, w)));
      }
    }, [measureText, minWidth, maxWidth]);

    return (
      <span style={{ position: 'relative', display: 'inline-block' }}>
        <span
          ref={spanRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            visibility: 'hidden',
            whiteSpace: 'pre',
            pointerEvents: 'none',
            font: 'inherit',
          }}
        >
          {measureText}
        </span>
        <Input
          ref={ref}
          value={value}
          placeholder={placeholder}
          style={{ width: `${width}px`, transition: 'width 120ms ease', ...style }}
          {...rest}
        />
      </span>
    );
  }
);

AutoWidthInput.displayName = 'AutoWidthInput';
