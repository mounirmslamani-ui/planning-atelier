import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Users, Building2, ShoppingCart, CalendarDays, 
  Factory, LayoutDashboard, ClipboardCheck,
  UserX, SearchCheck, PackageCheck, Handshake, Drill,
  PackagePlus, Hammer, FileSearch, Cog
} from 'lucide-react';

const sidebarGroups = [
  {
    title: 'PILOTAGE & SAISIE',
    items: [
      { to: '/orders', label: 'Commandes en cours', icon: ShoppingCart },
      { to: '/absences', label: 'Absences', icon: UserX },
      { to: '/production-register', label: 'Registre de Production', icon: ClipboardCheck },
    ],
  },
  {
    title: 'PLANNING & SUIVI',
    items: [
      { to: '/', label: 'Planning (Gantt)', icon: LayoutDashboard },
      { to: '/study', label: 'Étude', icon: FileSearch },
      { to: '/material-purchases', label: 'Achats matière', icon: PackagePlus },
      { to: '/tooling-purchases', label: 'Achats outillage', icon: Hammer },
      { to: '/subcontracting', label: 'Sous-traitance', icon: Factory },
      { to: '/quality-control', label: 'Contrôle Qualité', icon: SearchCheck },
      { to: '/delivery', label: 'Commandes à livrer', icon: PackageCheck },
    ],
  },
  {
    title: 'CONFIGURATION ATELIER',
    items: [
      { to: '/clients', label: 'Clients', icon: Building2 },
      { to: '/operators', label: 'Opérateurs', icon: Users },
      { to: '/equipment', label: 'Équipements', icon: Cog },
      { to: '/operations', label: 'Opérations', icon: Drill },
      { to: '/subcontractors', label: 'Sous-traitants', icon: Handshake },
      { to: '/holidays', label: 'Jours fériés', icon: CalendarDays },
    ],
  },
];

const AppSidebar: React.FC = () => {
  const location = useLocation();

  return (
    <aside className="w-60 min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
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
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive 
                        ? 'bg-sidebar-accent text-sidebar-primary font-medium' 
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                    }`}
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
