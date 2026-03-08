import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Users, Wrench, Building2, ShoppingCart, CalendarDays, 
  Factory, ListChecks, Truck, LayoutDashboard 
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Planning', icon: LayoutDashboard },
  { to: '/operators', label: 'Opérateurs', icon: Users },
  { to: '/operations', label: 'Opérations', icon: Wrench },
  { to: '/clients', label: 'Clients', icon: Building2 },
  { to: '/subcontractors', label: 'Sous-traitants', icon: Truck },
  { to: '/orders', label: 'Commandes', icon: ShoppingCart },
  { to: '/steps', label: 'Affectations', icon: ListChecks },
  { to: '/holidays', label: 'Jours fériés', icon: CalendarDays },
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
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
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
      </nav>
      <div className="p-4 border-t border-sidebar-border">
        <p className="text-xs text-sidebar-foreground/50 font-heading">v1.0 — Atelier</p>
      </div>
    </aside>
  );
};

export default AppSidebar;
