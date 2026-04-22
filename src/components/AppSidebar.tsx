import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Users, Building2, ShoppingCart, CalendarDays, 
  Factory, LayoutDashboard, ClipboardCheck,
  UserX, SearchCheck, PackageCheck, Handshake, Drill,
  PackagePlus, Hammer, FileSearch, Cog, TableProperties
} from 'lucide-react';

type DropTargetType = false | 'prod' | 'qc';

const sidebarGroups = [
  {
    title: 'PILOTAGE & SAISIE',
    items: [
      { to: '/orders', label: 'Commandes en cours', icon: ShoppingCart, dropTarget: false as DropTargetType },
      { to: '/absences', label: 'Absences', icon: UserX, dropTarget: false as DropTargetType },
      { to: '/production-register', label: 'Registre des travaux effectués', icon: ClipboardCheck, dropTarget: 'prod' as DropTargetType },
    ],
  },
  {
    title: 'PLANNING & SUIVI',
    items: [
      { to: '/planning-tableau', label: 'Planning Tableau', icon: TableProperties, dropTarget: false as DropTargetType },
      { to: '/', label: 'Planning (Gantt)', icon: LayoutDashboard, dropTarget: false as DropTargetType },
      { to: '/study', label: 'Étude', icon: FileSearch, dropTarget: false as DropTargetType },
      { to: '/material-purchases', label: 'Achats matière', icon: PackagePlus, dropTarget: false as DropTargetType },
      { to: '/tooling-purchases', label: 'Achats outillage', icon: Hammer, dropTarget: false as DropTargetType },
      { to: '/subcontracting', label: 'Sous-traitance', icon: Factory, dropTarget: false as DropTargetType },
      { to: '/quality-control', label: 'Contrôle Qualité', icon: SearchCheck, dropTarget: 'qc' as DropTargetType },
      { to: '/delivery', label: 'Commandes à livrer', icon: PackageCheck, dropTarget: false as DropTargetType },
    ],
  },
  {
    title: 'CONFIGURATION ATELIER',
    items: [
      { to: '/clients', label: 'Clients', icon: Building2, dropTarget: false as DropTargetType },
      { to: '/operators', label: 'Opérateurs', icon: Users, dropTarget: false as DropTargetType },
      { to: '/equipment', label: 'Équipements', icon: Cog, dropTarget: false as DropTargetType },
      { to: '/operations', label: 'Opérations', icon: Drill, dropTarget: false as DropTargetType },
      { to: '/subcontractors', label: 'Sous-traitants', icon: Handshake, dropTarget: false as DropTargetType },
      { to: '/holidays', label: 'Jours fériés', icon: CalendarDays, dropTarget: false as DropTargetType },
    ],
  },
];

interface AppSidebarProps {
  onProdDrop?: (stepId: string) => void;
  onQcDrop?: (stepId: string) => void;
}

const AppSidebar: React.FC<AppSidebarProps> = ({ onProdDrop, onQcDrop }) => {
  const location = useLocation();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragPayloadWindow = window as Window & { __planningProdDragPayload?: string };

  const handleDrop = (dropType: DropTargetType, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    try {
      const rawPayload =
        e.dataTransfer.getData('application/x-prod-step') ||
        e.dataTransfer.getData('text/x-prod-step') ||
        dragPayloadWindow.__planningProdDragPayload ||
        '';
      const data = rawPayload ? JSON.parse(rawPayload) : null;
      if (data?.stepId) {
        if (dropType === 'prod' && onProdDrop) onProdDrop(data.stepId);
        if (dropType === 'qc' && onQcDrop) onQcDrop(data.stepId);
      }
    } catch {}
    dragPayloadWindow.__planningProdDragPayload = undefined;
  };

  return (
    <aside className="w-60 h-screen sticky top-0 bg-sidebar border-r border-sidebar-border flex flex-col flex-shrink-0">
      <div className="p-4 border-b border-sidebar-border flex items-center gap-2">
        <Factory className="w-6 h-6 text-sidebar-primary" />
        <h1 className="font-heading text-sm font-bold text-sidebar-foreground tracking-wider uppercase">
          Planning Atelier
        </h1>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {sidebarGroups.map((group, gi) => (
          <div key={group.title}>
            {gi > 0 && <div className="border-t border-sidebar-border my-2" />}
            <div className="px-3 py-2 text-[10px] font-heading font-bold text-sidebar-primary tracking-widest uppercase">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.to;
                const isDropTarget = item.dropTarget && ((item.dropTarget === 'prod' && onProdDrop) || (item.dropTarget === 'qc' && onQcDrop));
                const isDraggedOver = dragOver === item.to;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onDragOver={isDropTarget ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOver(item.to); } : undefined}
                    onDragLeave={isDropTarget ? () => setDragOver(null) : undefined}
                    onDrop={isDropTarget ? (e) => handleDrop(item.dropTarget, e) : undefined}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive 
                        ? 'bg-sidebar-accent text-sidebar-primary font-medium' 
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                    } ${isDropTarget && isDraggedOver ? 'ring-2 ring-primary bg-primary/10' : ''}`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-sidebar-border">
        <p className="text-xs text-sidebar-foreground/50 font-heading">v1.0 — Atelier</p>
      </div>
    </aside>
  );
};

export default AppSidebar;
