import React, { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePlanning } from '@/context/PlanningContext';
import { toast } from 'sonner';

interface DesignationCellProps {
  orderId?: string;
  designation: string;
  className?: string;
}

/**
 * Renders the order designation as a clickable Google Drive link (when set),
 * with right-click opening a popover to add/edit/remove the folder URL.
 */
const DesignationCell: React.FC<DesignationCellProps> = ({ orderId, designation, className }) => {
  const { orders, updateOrder } = usePlanning();
  const order = orderId ? orders.find(o => o.id === orderId) : undefined;
  const folderLink = order?.folderLink;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(folderLink || '');

  useEffect(() => { setValue(folderLink || ''); }, [folderLink, open]);

  // Without an order we cannot edit; render plain text
  if (!order) {
    return <span className={className}>{designation}</span>;
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      toast.error('Le lien doit commencer par http:// ou https://');
      return;
    }
    updateOrder({ ...order, folderLink: trimmed || undefined });
    toast.success(trimmed ? 'Lien enregistré' : 'Lien supprimé');
    setOpen(false);
  };

  const handleRemove = () => {
    updateOrder({ ...order, folderLink: undefined });
    setValue('');
    toast.success('Lien supprimé');
    setOpen(false);
  };

  const linkedCls = folderLink ? 'cursor-pointer underline decoration-dotted underline-offset-2 hover:decoration-solid' : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {folderLink ? (
          <a
            href={folderLink}
            target="_blank"
            rel="noreferrer noopener"
            onClick={e => e.stopPropagation()}
            onContextMenu={handleContextMenu}
            onPointerDown={e => e.stopPropagation()}
            className={[className, linkedCls].filter(Boolean).join(' ')}
            title={`Ouvrir : ${folderLink}`}
          >
            {designation}
          </a>
        ) : (
          <span
            onContextMenu={handleContextMenu}
            onPointerDown={e => e.stopPropagation()}
            className={className}
            title="Clic droit pour ajouter un lien Google Drive"
          >
            {designation}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80" onClick={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
        <div className="space-y-2">
          <label className="text-xs font-medium">Lien dossier Google Drive</label>
          <Input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="https://drive.google.com/..."
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          />
          <div className="flex justify-between gap-2 pt-1">
            <Button variant="destructive" size="sm" onClick={handleRemove} disabled={!folderLink}>
              Supprimer
            </Button>
            <Button size="sm" onClick={handleSave}>Valider</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DesignationCell;
