import React, { useState, useEffect, useRef } from 'react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePlanning } from '@/context/PlanningContext';
import { toast } from 'sonner';

interface DesignationCellProps {
  orderId?: string;
  designation: string;
  className?: string;
}

const DRIVE_LINK_HOSTS = new Set(['drive.google.com', 'docs.google.com']);

const isDriveLink = (url: string) => {
  try {
    const parsed = new URL(url);
    return DRIVE_LINK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
};

const buildRelayUrl = (url: string) => `/open-external.html?to=${encodeURIComponent(url)}`;

/**
 * Renders the order designation as a clickable Google Drive link (when set),
 * with right-click opening a popover to add/edit/remove the folder URL.
 *
 * Implémentation : on rend un vrai <a target="_blank" rel="noopener noreferrer">
 * sans PopoverTrigger pour que le clic gauche ouvre uniquement le lien.
 * Le popover est ouvert manuellement au clic droit. Cela évite l'erreur COOP /
 * ERR_BLOCKED_BY_RESPONSE / 403 que Drive renvoie quand on l'ouvre via
 * window.open() depuis l'iframe de prévisualisation.
 */
const DesignationCell: React.FC<DesignationCellProps> = ({ orderId, designation, className }) => {
  const { orders, updateOrder } = usePlanning();
  const order = orderId ? orders.find(o => o.id === orderId) : undefined;
  const folderLink = order?.folderLink;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(folderLink || '');
  const anchorRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => { setValue(folderLink || ''); }, [folderLink, open]);

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
    if (trimmed && !isDriveLink(trimmed)) {
      toast.error('Le lien doit être un lien Google Drive valide');
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
  const combinedClassName = [className, linkedCls].filter(Boolean).join(' ');

  // Si pas de lien : rendu simple avec clic droit pour configurer
  if (!folderLink) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <span
            onContextMenu={handleContextMenu}
            onPointerDown={e => e.stopPropagation()}
            className={className}
            title="Clic droit pour ajouter un lien Google Drive"
          >
            {designation}
          </span>
        </PopoverAnchor>
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
              <Button variant="destructive" size="sm" onClick={handleRemove} disabled>
                Supprimer
              </Button>
              <Button size="sm" onClick={handleSave}>Valider</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Avec lien : on rend un vrai <a> pour bénéficier d'une vraie navigation utilisateur
  const href = buildRelayUrl(folderLink);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <a
          ref={anchorRef}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          onContextMenu={handleContextMenu}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          className={combinedClassName}
          title={`Ouvrir : ${folderLink}`}
        >
          {designation}
        </a>
      </PopoverAnchor>
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
            <Button variant="destructive" size="sm" onClick={handleRemove}>
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
