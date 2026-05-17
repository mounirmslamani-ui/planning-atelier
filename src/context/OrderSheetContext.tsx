import React, { createContext, useCallback, useContext, useState } from 'react';
import OrderUnifiedSheet from '@/components/OrderUnifiedSheet';

type Tab = 'info' | 'resources' | 'steps' | 'qc';

interface Ctx {
  openOrderSheet: (orderId: string, tab?: Tab) => void;
}

const OrderSheetContext = createContext<Ctx | null>(null);

export const OrderSheetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('info');
  const [open, setOpen] = useState(false);

  const openOrderSheet = useCallback((id: string, t: Tab = 'info') => {
    setOrderId(id);
    setTab(t);
    setOpen(true);
  }, []);

  return (
    <OrderSheetContext.Provider value={{ openOrderSheet }}>
      {children}
      <OrderUnifiedSheet orderId={orderId} open={open} onOpenChange={setOpen} initialTab={tab} />
    </OrderSheetContext.Provider>
  );
};

export function useOrderSheet(): Ctx {
  const ctx = useContext(OrderSheetContext);
  if (!ctx) return { openOrderSheet: () => {} };
  return ctx;
}

interface LinkProps {
  orderId: string | null | undefined;
  orderNumber: string | null | undefined;
  className?: string;
  tab?: Tab;
}

export const OrderNumberLink: React.FC<LinkProps> = ({ orderId, orderNumber, className, tab }) => {
  const { openOrderSheet } = useOrderSheet();
  const label = orderNumber || '—';
  if (!orderId) return <span className={className}>{label}</span>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openOrderSheet(orderId, tab); }}
      className={`text-primary underline-offset-2 hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded ${className || ''}`}
      title="فتح بطاقة متابعة إنجاز الطلبية"
    >
      {label}
    </button>
  );
};
