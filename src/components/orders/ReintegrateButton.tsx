import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

const ReintegrateButton: React.FC<Props> = ({ onClick, disabled, title = 'إعادة إدماج إلى الطلبيات الحالية' }) => (
  <Button
    variant="ghost"
    size="icon"
    className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
    onClick={onClick}
    disabled={disabled}
    title={title}
  >
    <RotateCcw className="w-4 h-4" />
  </Button>
);

export default ReintegrateButton;
