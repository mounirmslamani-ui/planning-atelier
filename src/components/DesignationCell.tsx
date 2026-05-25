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

  const handleDriveClick = (e: React.MouseEvent) => {
    if (!folderLink) return;
    e.preventDefault();
    e.stopPropagation();

    // 1. On ouvre un onglet totalement vierge "about:blank" (sans aucune sécurité COOP héritée de Lovable)
    const newWindow = window.open('about:blank', '_blank', 'noopener,noreferrer');
    
    if (newWindow) {
      // 2. On coupe définitivement la relation de parenté (le opener)
      newWindow.opener = null;
      // 3. On redirige cet onglet vierge vers Google Drive. 
      // Vu du navigateur, la requête vient d'une page blanche neutre, le blocage saute !
      newWindow.location.href = folderLink;
    } else {
      // Si un bloqueur de pub bloque le pop-up, secours :
      toast.error("Veuillez autoriser les fenêtres pop-up pour ouvrir Google Drive");
    }
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
        <span
          onContextMenu={handleContextMenu}
          onClick={handleDriveClick}
          onPointerDown={e => e.stopPropagation()}
          className={[className, linkedCls].filter(Boolean).join(' ')}
          title={folderLink ? `Ouvrir : ${folderLink}` : 'Clic droit pour ajouter un lien Google Drive'}
        >
          {designation}
        </span>
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
