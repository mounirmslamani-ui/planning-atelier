import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Users, Building2, ShoppingCart, CalendarDays, 
  Factory, Truck, LayoutDashboard, ClipboardCheck,
  UserX, SearchCheck, PackageCheck
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePlanning } from '@/context/PlanningContext';
import { addWorkMinutes, workMinutesBetween } from '@/lib/workTime';

const navItems = [
  { to: '/', label: 'Planning', icon: LayoutDashboard },
  { to: '/orders', label: 'Commandes en cours', icon: ShoppingCart },
  { to: '/production-register', label: 'Registre Production', icon: ClipboardCheck },
  { to: '/quality-control', label: 'Contrôle Qualité', icon: SearchCheck },
  { to: '/delivery', label: 'Commandes à livrer', icon: PackageCheck },
  { to: '/operators', label: 'Opérateurs', icon: Users },
  { to: '/clients', label: 'Clients', icon: Building2 },
  { to: '/subcontractors', label: 'Sous-traitants', icon: Truck },
  { to: '/holidays', label: 'Jours fériés', icon: CalendarDays },
];

const AppSidebar: React.FC = () => {
  const location = useLocation();
  const { operators, steps, holidays, addStep, updateStep } = usePlanning();
  
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [absOperatorId, setAbsOperatorId] = useState('');
  const [absStartDate, setAbsStartDate] = useState('');
  const [absStartTime, setAbsStartTime] = useState('08:00');
  const [absEndDate, setAbsEndDate] = useState('');
  const [absEndTime, setAbsEndTime] = useState('16:00');

  const openAbsenceDialog = () => {
    setAbsOperatorId(operators[0]?.id || '');
    const today = new Date().toISOString().split('T')[0];
    setAbsStartDate(today);
    setAbsEndDate(today);
    setAbsStartTime('08:00');
    setAbsEndTime('16:00');
    setAbsenceOpen(true);
  };

  const handleAbsenceSave = () => {
    if (!absOperatorId || !absStartDate || !absEndDate) return;

    const absStart = new Date(`${absStartDate}T${absStartTime}`);
    const absEnd = new Date(`${absEndDate}T${absEndTime}`);
    const absDurationMin = workMinutesBetween(absStart, absEnd, holidays);
    if (absDurationMin <= 0) return;

    // Create absence block (yellow block on Gantt)
    const absenceStep: import('@/types/planning').ProductionStep = {
      id: `step-abs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      orderId: 'order-absence',
      operatorId: absOperatorId,
      operationId: 'op-8',
      estimatedDuration: absDurationMin,
      startDate: absStartDate,
      startTime: absStartTime,
      endDate: absEndDate,
      endTime: absEndTime,
      order: 0,
    };
    addStep(absenceStep);

    // Shift overlapping steps for this operator
    const operatorSteps = steps.filter(
      s => s.operatorId === absOperatorId && s.operationId !== 'op-8'
    );

    operatorSteps.forEach(s => {
      const stepStart = new Date(`${s.startDate}T${s.startTime}`);
      const stepEnd = new Date(`${s.endDate}T${s.endTime}`);

      // If step overlaps with absence period, shift it forward
      if (stepStart < absEnd && stepEnd > absStart) {
        const newStart = addWorkMinutes(absEnd, 0, holidays);
        const newEnd = addWorkMinutes(newStart, s.estimatedDuration, holidays);
        updateStep({
          ...s,
          startDate: newStart.toISOString().split('T')[0],
          startTime: `${String(newStart.getHours()).padStart(2, '0')}:${String(newStart.getMinutes()).padStart(2, '0')}`,
          endDate: newEnd.toISOString().split('T')[0],
          endTime: `${String(newEnd.getHours()).padStart(2, '0')}:${String(newEnd.getMinutes()).padStart(2, '0')}`,
        });
      }
    });

    setAbsenceOpen(false);
  };

  return (
    <aside className="w-60 min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-4 border-b border-sidebar-border flex items-center gap-2">
        <Factory className="w-6 h-6 text-sidebar-primary" />
        <h1 className="font-heading text-sm font-bold text-sidebar-foreground tracking-wider uppercase">
          Planning Atelier
        </h1>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to;
          return (
            <React.Fragment key={item.to}>
              <NavLink
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
              {/* Absence button after Commandes */}
              {item.to === '/orders' && (
                <button
                  onClick={openAbsenceDialog}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors w-full text-left text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                >
                  <UserX className="w-4 h-4" />
                  Absences
                </button>
              )}
            </React.Fragment>
          );
        })}
      </nav>
      <div className="p-4 border-t border-sidebar-border">
        <p className="text-xs text-sidebar-foreground/50 font-heading">v1.0 — Atelier</p>
      </div>

      {/* Absence Dialog */}
      <Dialog open={absenceOpen} onOpenChange={setAbsenceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Déclarer une absence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Opérateur</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={absOperatorId}
                onChange={e => setAbsOperatorId(e.target.value)}
              >
                {operators.map(op => (
                  <option key={op.id} value={op.id}>{op.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Date début</label>
                <Input type="date" value={absStartDate} onChange={e => setAbsStartDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Heure début</label>
                <Input type="time" value={absStartTime} onChange={e => setAbsStartTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Date fin</label>
                <Input type="date" value={absEndDate} onChange={e => setAbsEndDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Heure fin</label>
                <Input type="time" value={absEndTime} onChange={e => setAbsEndTime(e.target.value)} />
              </div>
            </div>
            {absStartDate && absEndDate && (() => {
              const s = new Date(`${absStartDate}T${absStartTime}`);
              const e = new Date(`${absEndDate}T${absEndTime}`);
              const dur = workMinutesBetween(s, e, holidays);
              return dur > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Durée d'absence : <strong>{(dur / 60).toFixed(2)}h</strong> ({dur} min de travail)
                </p>
              ) : null;
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbsenceOpen(false)}>Annuler</Button>
            <Button onClick={handleAbsenceSave}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
};

export default AppSidebar;
