import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Users, Building2, ShoppingCart, CalendarDays, 
  Factory, LayoutDashboard, ClipboardCheck,
  UserX, SearchCheck, PackageCheck, Handshake, Drill,
  PackagePlus, Hammer, FileSearch, Cog, TableProperties, Archive, Receipt,
  DownloadCloud,
} from 'lucide-react';
import { usePlanning } from '@/context/PlanningContext';
import { exportGlobalArchive } from '@/lib/globalArchiveExport';
import { toast } from 'sonner';

type DropTargetType = false | 'prod' | 'qc';

const sidebarGroups = [
  {
    title: 'القيادة والإدخال',
    items: [
      { to: '/orders', label: 'الطلبيات الجارية', icon: ShoppingCart, dropTarget: false as DropTargetType },
      { to: '/absences', label: 'الغيابات', icon: UserX, dropTarget: false as DropTargetType },
      { to: '/production-register', label: 'سجل الأعمال المنجزة', icon: ClipboardCheck, dropTarget: 'prod' as DropTargetType },
    ],
  },
  {
    title: 'البرمجة والمتابعة',
    items: [
      { to: '/planning-tableau', label: 'جدول البرمجة', icon: TableProperties, dropTarget: false as DropTargetType },
      { to: '/planning-gantt', label: 'برنامج غانت', icon: LayoutDashboard, dropTarget: false as DropTargetType },
      { to: '/study', label: 'دراسة', icon: FileSearch, dropTarget: false as DropTargetType },
      { to: '/material-purchases', label: 'مشتريات المواد الأولية', icon: PackagePlus, dropTarget: false as DropTargetType },
      { to: '/tooling-purchases', label: 'مشتريات العدة', icon: Hammer, dropTarget: false as DropTargetType },
      { to: '/subcontracting', label: 'مناولة', icon: Factory, dropTarget: false as DropTargetType },
      { to: '/quality-control', label: 'مراقبة الجودة', icon: SearchCheck, dropTarget: 'qc' as DropTargetType },
      { to: '/delivery', label: 'طلبيات جاهزة للتسليم', icon: PackageCheck, dropTarget: false as DropTargetType },
      { to: '/delivered-orders', label: 'طلبيات مسلمة', icon: Archive, dropTarget: false as DropTargetType },
      { to: '/pending-invoicing', label: 'طلبيات في انتظار الفوترة', icon: Receipt, dropTarget: false as DropTargetType },
    ],
  },
  {
    title: 'إعدادات',
    items: [
      { to: '/clients', label: 'الزبائن', icon: Building2, dropTarget: false as DropTargetType },
      { to: '/operators', label: 'العمال', icon: Users, dropTarget: false as DropTargetType },
      { to: '/equipment', label: 'المعدات', icon: Cog, dropTarget: false as DropTargetType },
      { to: '/operations', label: 'العمليات', icon: Drill, dropTarget: false as DropTargetType },
      { to: '/subcontractors', label: 'المناولون', icon: Handshake, dropTarget: false as DropTargetType },
      { to: '/holidays', label: 'العطل الرسمية', icon: CalendarDays, dropTarget: false as DropTargetType },
    ],
  },
];

interface AppSidebarProps {
  isOpen?: boolean;
  onProdDrop?: (stepId: string) => void;
  onQcDrop?: (stepId: string) => void;
}

const AppSidebar: React.FC<AppSidebarProps> = ({ isOpen = false, onProdDrop, onQcDrop }) => {
  const location = useLocation();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const dragPayloadWindow = window as Window & { __planningProdDragPayload?: string };
  const planning = usePlanning();

  const handleGlobalExport = () => {
    try {
      setExporting(true);
      exportGlobalArchive({
        orders: planning.orders,
        steps: planning.steps,
        productionRecords: planning.productionRecords,
        clients: planning.clients,
        operators: planning.operators,
        operations: planning.operations,
        deliveredOrders: planning.deliveredOrders,
        qcEntries: planning.qcEntries,
        absenceOrderId: planning.absenceOrderId,
        absenceOperationId: planning.absenceOperationId,
      });
      toast.success('تم تنزيل الأرشيف الكامل');
    } catch (e) {
      console.error(e);
      toast.error('فشل في إنشاء الأرشيف');
    } finally {
      setExporting(false);
    }
  };

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
    <aside className={`h-screen flex-shrink-0 overflow-hidden bg-sidebar transition-[width] duration-200 ease-out ${isOpen ? 'w-60 border-r border-sidebar-border' : 'w-0 border-r-0'}`}>
      <div className="flex h-full w-60 flex-col">
      <div className="p-4 border-b border-sidebar-border flex items-center gap-2">
        <Factory className="w-8 h-8 text-sidebar-primary" />
        <h1 className="font-heading text-lg font-bold text-sidebar-foreground tracking-wider uppercase">
          برمجة الورشة
        </h1>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {sidebarGroups.map((group, gi) => (
          <div key={group.title}>
            {gi > 0 && <div className="border-t border-sidebar-border my-2" />}
            <div className="px-3 py-2 text-sm font-heading font-bold text-sidebar-primary tracking-widest uppercase">
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
      <div className="p-3 border-t border-sidebar-border space-y-2">
        <button
          type="button"
          onClick={handleGlobalExport}
          disabled={exporting}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-heading font-semibold bg-sidebar-primary text-sidebar-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          title="تنزيل أرشيف كامل لجميع الجداول"
        >
          <DownloadCloud className="w-4 h-4" />
          {exporting ? '...جاري التحميل' : 'حفظ شامل'}
        </button>
        <p className="text-xs text-sidebar-foreground/50 font-heading text-center">v1.0 — الورشة</p>
      </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
