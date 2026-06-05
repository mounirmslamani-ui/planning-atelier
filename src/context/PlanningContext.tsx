import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type {
  Operator, Subcontractor, Operation, Client, Order, ProductionStep,
  Holiday, GanttView, ProductionRecord, QualityControlEntry, DeliveryEntry, Equipment, DeliveredOrder, CancelledOrder,
} from '@/types/planning';
import {
  fetchAllData, syncAllDataToDB,
  ensureAbsenceOperation, ensureAbsenceOrder,
  dbInsertEquipment, dbUpdateEquipment, dbDeleteEquipment,
  dbInsertOperator, dbUpdateOperator, dbDeleteOperator,
  dbInsertSubcontractor, dbUpdateSubcontractor, dbDeleteSubcontractor,
  dbInsertOperation, dbUpdateOperation, dbDeleteOperation,
  dbInsertClient, dbUpdateClient, dbDeleteClient,
  dbInsertOrder, dbUpdateOrder, dbDeleteOrder, dbBulkUpdateOrders,
  dbInsertStep, dbUpdateStep, dbDeleteStep,
  dbInsertHoliday, dbUpdateHoliday, dbDeleteHoliday,
  dbInsertRecord, dbUpdateRecord, dbDeleteRecord,
  dbInsertQCEntry, dbUpdateQCEntry, dbDeleteQCEntry,
  dbInsertDelivery, dbUpdateDelivery, dbDeleteDelivery,
  dbInsertDeliveredOrder, dbUpdateDeliveredOrder, dbDeleteDeliveredOrder,

  dbInsertCancelledOrder, dbUpdateCancelledOrder, dbDeleteCancelledOrder,
} from '@/lib/supabase-data';
import { computeResyncedSteps } from '@/lib/resyncPlanning';

interface PlanningContextType {
  loading: boolean;
  absenceOperationId: string;
  absenceOrderId: string;
  operators: Operator[];
  subcontractors: Subcontractor[];
  operations: Operation[];
  clients: Client[];
  orders: Order[];
  steps: ProductionStep[];
  holidays: Holiday[];
  productionRecords: ProductionRecord[];
  qcEntries: QualityControlEntry[];
  deliveryEntries: DeliveryEntry[];
  deliveredOrders: DeliveredOrder[];
  cancelledOrders: CancelledOrder[];
  equipments: Equipment[];
  ganttView: GanttView;
  ganttZeroDate: Date;
  selectedOperatorId: string | null;
  selectedOrderId: string | null;
  setOperators: (ops: Operator[]) => void;
  addOperator: (op: Operator) => void;
  updateOperator: (op: Operator) => void;
  deleteOperator: (id: string) => void;
  setSubcontractors: (subs: Subcontractor[]) => void;
  addSubcontractor: (sub: Subcontractor) => void;
  updateSubcontractor: (sub: Subcontractor) => void;
  deleteSubcontractor: (id: string) => void;
  setOperations: (ops: Operation[]) => void;
  addOperation: (op: Operation) => void;
  updateOperation: (op: Operation) => void;
  deleteOperation: (id: string) => void;
  setClients: (clients: Client[]) => void;
  addClient: (client: Client) => void;
  updateClient: (client: Client) => void;
  deleteClient: (id: string) => void;
  setOrders: (orders: Order[]) => void;
  addOrder: (order: Order) => void;
  updateOrder: (order: Order) => void;
  deleteOrder: (id: string) => void;
  setSteps: (steps: ProductionStep[]) => void;
  addStep: (step: ProductionStep) => void;
  updateStep: (step: ProductionStep) => void;
  deleteStep: (id: string) => void;
  setHolidays: (holidays: Holiday[]) => void;
  addHoliday: (holiday: Holiday) => void;
  updateHoliday: (holiday: Holiday) => void;
  deleteHoliday: (id: string) => void;
  addProductionRecord: (record: ProductionRecord) => void;
  updateProductionRecord: (record: ProductionRecord) => void;
  deleteProductionRecord: (id: string) => void;
  addQCEntry: (entry: QualityControlEntry) => void;
  /** Add a QC SESSION (partial control). Bypasses the one-per-order guard. */
  addQCSession: (entry: QualityControlEntry) => void;
  updateQCEntry: (entry: QualityControlEntry) => void;
  deleteQCEntry: (id: string) => void;
  addDeliveryEntry: (entry: DeliveryEntry) => void;
  /** Add a DELIVERY-READY session (partial). Bypasses the one-per-order merge. */
  addDeliverySession: (entry: DeliveryEntry) => void;
  updateDeliveryEntry: (entry: DeliveryEntry) => void;
  deleteDeliveryEntry: (id: string) => void;
  addDeliveredOrder: (entry: DeliveredOrder) => void;
  /** Add a DELIVERED session (partial). Bypasses the one-per-order merge. */
  addDeliveredSession: (entry: DeliveredOrder) => void;
  updateDeliveredOrder: (entry: DeliveredOrder) => void;
  deleteDeliveredOrder: (id: string) => void;

  addCancelledOrder: (entry: CancelledOrder) => Promise<boolean>;
  updateCancelledOrder: (entry: CancelledOrder) => void;
  deleteCancelledOrder: (id: string) => void;
  setEquipments: (eqs: Equipment[]) => void;
  addEquipment: (eq: Equipment) => void;
  updateEquipment: (eq: Equipment) => void;
  deleteEquipment: (id: string) => void;
  setGanttView: (view: GanttView) => void;
  setGanttZeroDate: (date: Date) => void;
  setSelectedOperatorId: (id: string | null) => void;
  setSelectedOrderId: (id: string | null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface Snapshot {
  operators: Operator[];
  subcontractors: Subcontractor[];
  operations: Operation[];
  clients: Client[];
  orders: Order[];
  steps: ProductionStep[];
  holidays: Holiday[];
  productionRecords: ProductionRecord[];
  qcEntries: QualityControlEntry[];
  deliveryEntries: DeliveryEntry[];
  deliveredOrders: DeliveredOrder[];
  cancelledOrders: CancelledOrder[];
  equipments: Equipment[];
}

const MAX_HISTORY = 50;

const PlanningContext = createContext<PlanningContextType | undefined>(undefined);

export const PlanningProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [absenceOperationId, setAbsenceOperationId] = useState('');
  const [absenceOrderId, setAbsenceOrderId] = useState('');

  const [operators, setOperators] = useState<Operator[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [steps, setSteps] = useState<ProductionStep[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [productionRecords, setProductionRecords] = useState<ProductionRecord[]>([]);
  const [qcEntries, setQCEntries] = useState<QualityControlEntry[]>([]);
  const [deliveryEntries, setDeliveryEntries] = useState<DeliveryEntry[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState<DeliveredOrder[]>([]);
  const [cancelledOrders, setCancelledOrders] = useState<CancelledOrder[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [ganttView, setGanttView] = useState<GanttView>('day');
  const [ganttZeroDate, setGanttZeroDate] = useState<Date>(new Date());
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [currentDateKey, setCurrentDateKey] = useState(() => new Date().toISOString().split('T')[0]);

  // ───────────────────── Undo/Redo ─────────────────────
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const autoResyncInFlight = useRef(false);
  const [historyTrigger, setHistoryTrigger] = useState(0);

  const takeSnapshot = useCallback((): Snapshot => ({
    operators: [...operators],
    subcontractors: [...subcontractors],
    operations: [...operations],
    clients: [...clients],
    orders: [...orders],
    steps: [...steps],
    holidays: [...holidays],
    productionRecords: [...productionRecords],
    qcEntries: [...qcEntries],
    deliveryEntries: [...deliveryEntries],
    deliveredOrders: [...deliveredOrders],
    cancelledOrders: [...cancelledOrders],
    equipments: [...equipments],
  }), [operators, subcontractors, operations, clients, orders, steps, holidays, productionRecords, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders, equipments]);

  const pushUndo = useCallback(() => {
    const snap = takeSnapshot();
    undoStack.current = [...undoStack.current.slice(-(MAX_HISTORY - 1)), snap];
    redoStack.current = [];
    setHistoryTrigger(t => t + 1);
  }, [takeSnapshot]);

  const restoreSnapshot = useCallback((snap: Snapshot) => {
    setOperators(snap.operators);
    setSubcontractors(snap.subcontractors);
    setOperations(snap.operations);
    setClients(snap.clients);
    setOrders(snap.orders);
    setSteps(snap.steps);
    setHolidays(snap.holidays);
    setProductionRecords(snap.productionRecords);
    setQCEntries(snap.qcEntries);
    setDeliveryEntries(snap.deliveryEntries);
    setDeliveredOrders(snap.deliveredOrders);
    setCancelledOrders(snap.cancelledOrders);
    setEquipments(snap.equipments);
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const currentSnap = takeSnapshot();
    redoStack.current = [...redoStack.current, currentSnap];
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    restoreSnapshot(prev);
    setHistoryTrigger(t => t + 1);
  }, [takeSnapshot, restoreSnapshot]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const currentSnap = takeSnapshot();
    undoStack.current = [...undoStack.current, currentSnap];
    const next = redoStack.current[redoStack.current.length - 1];
    redoStack.current = redoStack.current.slice(0, -1);
    restoreSnapshot(next);
    setHistoryTrigger(t => t + 1);
  }, [takeSnapshot, restoreSnapshot]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // ───────────────────── Initial Data Load ─────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchAllData();

        // Ensure special Absence entities exist
        const absOp = await ensureAbsenceOperation(data.operations);
        const absOrder = await ensureAbsenceOrder(data.orders);

        // Add absence op to operations list if it was just created
        if (!data.operations.find(o => o.id === absOp.id)) {
          data.operations.push(absOp);
        }
        if (!data.orders.find(o => o.id === absOrder.id)) {
          data.orders.push(absOrder);
        }

        setAbsenceOperationId(absOp.id);
        setAbsenceOrderId(absOrder.id);

        const initialResync = computeResyncedSteps(data.steps, data.productionRecords, data.holidays, absOp.id, absOrder.id);
        if (initialResync.shifted.length > 0) {
          const shiftedMap = new Map(initialResync.shifted.map(step => [step.id, step]));
          data.steps = data.steps.map(step => shiftedMap.get(step.id) ?? step);
        }

        setEquipments(data.equipments);
        setOperators(data.operators);
        setSubcontractors(data.subcontractors);
        setOperations(data.operations);
        setClients(data.clients);
        setOrders(data.orders);
        setSteps(data.steps);
        setHolidays(data.holidays);
        setProductionRecords(data.productionRecords);
        // Nettoyer les qcEntries obsolètes (commandes déjà livrées / prêtes à livrer / annulées) et les doublons
        {
          const blockedOrderIds = new Set<string>([
            ...data.deliveredOrders.map(d => d.orderId),
            ...data.deliveryEntries.map(d => d.orderId),
            ...((data as any).cancelledOrders || []).map((c: any) => c.orderId),
          ]);
          const seen = new Set<string>();
          const kept: typeof data.qcEntries = [];
          const stale: typeof data.qcEntries = [];
          // Iterate from most recent to oldest so we keep the latest QC entry per order
          const sorted = [...data.qcEntries].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          for (const e of sorted) {
            if (blockedOrderIds.has(e.orderId) || seen.has(e.orderId)) {
              stale.push(e);
            } else {
              seen.add(e.orderId);
              kept.push(e);
            }
          }
          if (stale.length > 0) {
            console.warn(`[Cleanup] Suppression de ${stale.length} qcEntries obsolètes`);
            stale.forEach(e => dbDeleteQCEntry(e.id));
            data.qcEntries = kept;
          }
        }
        setQCEntries(data.qcEntries);
        // Dedupe delivery entries by orderId — keep most recent
        const dedupedDelivery = (() => {
          const byOrder = new Map<string, typeof data.deliveryEntries[number]>();
          for (const e of data.deliveryEntries) {
            const existing = byOrder.get(e.orderId);
            const ts = (e.movedAt || '') as string;
            const exTs = existing ? ((existing.movedAt || '') as string) : '';
            if (!existing || ts > exTs) byOrder.set(e.orderId, e);
          }
          const kept = new Set(Array.from(byOrder.values()).map(e => e.id));
          data.deliveryEntries.filter(e => !kept.has(e.id)).forEach(e => { void dbDeleteDelivery(e.id); });
          return Array.from(byOrder.values());
        })();
        setDeliveryEntries(dedupedDelivery);
        setDeliveredOrders(data.deliveredOrders);
        setCancelledOrders((data as any).cancelledOrders || []);

        // Re-sync all data to DB to fix date format issues and any automatic planning resync.
        
      } catch (err) {
        console.error('[PlanningContext] Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ───────────────────── Periodic Data Refresh (every 60s) ─────────────────────
  useEffect(() => {
    if (loading) return;
    const interval = window.setInterval(async () => {
      try {
        const data = await fetchAllData();
        setEquipments(data.equipments);
        setOperators(data.operators);
        setSubcontractors(data.subcontractors);
        setOperations(data.operations);
        setClients(data.clients);
        setOrders(data.orders);
        setSteps(data.steps);
        setHolidays(data.holidays);
        setProductionRecords(data.productionRecords);
        // Filter out qcEntries for orders that are now in delivery / delivered / cancelled (defensive against duplicates)
        {
          const blockedOrderIds = new Set<string>([
            ...data.deliveredOrders.map(d => d.orderId),
            ...data.deliveryEntries.map(d => d.orderId),
            ...((data as any).cancelledOrders || []).map((c: any) => c.orderId),
          ]);
          const seen = new Set<string>();
          const sorted = [...data.qcEntries].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          const kept: typeof data.qcEntries = [];
          for (const e of sorted) {
            if (blockedOrderIds.has(e.orderId) || seen.has(e.orderId)) {
              dbDeleteQCEntry(e.id);
            } else {
              seen.add(e.orderId);
              kept.push(e);
            }
          }
          setQCEntries(kept);
        }
        setDeliveryEntries(data.deliveryEntries);
        setDeliveredOrders(data.deliveredOrders);
        setCancelledOrders((data as any).cancelledOrders || []);
      } catch (err) {
        console.error('[PlanningContext] Periodic refresh failed:', err);
      }
    }, 60_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [loading]);

  useEffect(() => {
    const refreshDateKey = () => setCurrentDateKey(new Date().toISOString().split('T')[0]);
    const interval = window.setInterval(refreshDateKey, 60_000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  // Automatic planning resync: active operator tasks must never stay hidden in the past.
  useEffect(() => {
    if (loading || !absenceOperationId || !absenceOrderId || autoResyncInFlight.current) return;

    const { shifted } = computeResyncedSteps(steps, productionRecords, holidays, absenceOperationId, absenceOrderId, new Date(`${currentDateKey}T00:00:00`));
    if (shifted.length === 0) return;

    autoResyncInFlight.current = true;
    const shiftedMap = new Map(shifted.map(step => [step.id, step]));
    setSteps(prev => prev.map(step => shiftedMap.get(step.id) ?? step));

    Promise.all(shifted.map(step => dbUpdateStep(step)))
      .then(() => { autoResyncInFlight.current = false; })
      .catch(err => {
        console.error('[PlanningContext] Automatic planning resync failed:', err);
        autoResyncInFlight.current = false;
      });
  }, [loading, steps, productionRecords, holidays, absenceOperationId, absenceOrderId, currentDateKey]);

  // ───────────────────── CRUD with optimistic updates + DB sync ─────────────────────

  // Equipment
  const addEquipment = useCallback((eq: Equipment) => {
    pushUndo(); setEquipments(prev => [...prev, eq]); dbInsertEquipment(eq);
  }, [pushUndo]);
  const updateEquipment = useCallback((eq: Equipment) => {
    pushUndo(); setEquipments(prev => prev.map(e => e.id === eq.id ? eq : e)); dbUpdateEquipment(eq);
  }, [pushUndo]);
  const deleteEquipment = useCallback((id: string) => {
    pushUndo(); setEquipments(prev => prev.filter(e => e.id !== id)); dbDeleteEquipment(id);
  }, [pushUndo]);

  // Operator
  const addOperator = useCallback((op: Operator) => {
    pushUndo(); setOperators(prev => [...prev, op]); dbInsertOperator(op);
  }, [pushUndo]);
  const updateOperator = useCallback((op: Operator) => {
    pushUndo(); setOperators(prev => prev.map(o => o.id === op.id ? op : o)); dbUpdateOperator(op);
  }, [pushUndo]);
  const deleteOperator = useCallback((id: string) => {
    pushUndo(); setOperators(prev => prev.filter(o => o.id !== id)); dbDeleteOperator(id);
  }, [pushUndo]);

  // Subcontractor
  const addSubcontractor = useCallback((sub: Subcontractor) => {
    pushUndo(); setSubcontractors(prev => [...prev, sub]); dbInsertSubcontractor(sub);
  }, [pushUndo]);
  const updateSubcontractor = useCallback((sub: Subcontractor) => {
    pushUndo(); setSubcontractors(prev => prev.map(s => s.id === sub.id ? sub : s)); dbUpdateSubcontractor(sub);
  }, [pushUndo]);
  const deleteSubcontractor = useCallback((id: string) => {
    pushUndo(); setSubcontractors(prev => prev.filter(s => s.id !== id)); dbDeleteSubcontractor(id);
  }, [pushUndo]);

  // Operation
  const addOperation = useCallback((op: Operation) => {
    pushUndo(); setOperations(prev => [...prev, op]); dbInsertOperation(op);
  }, [pushUndo]);
  const updateOperation = useCallback((op: Operation) => {
    pushUndo(); setOperations(prev => prev.map(o => o.id === op.id ? op : o)); dbUpdateOperation(op);
  }, [pushUndo]);
  const deleteOperation = useCallback((id: string) => {
    pushUndo(); setOperations(prev => prev.filter(o => o.id !== id)); dbDeleteOperation(id);
  }, [pushUndo]);

  // Client
  const addClient = useCallback((client: Client) => {
    pushUndo(); setClients(prev => [...prev, client]); dbInsertClient(client);
  }, [pushUndo]);
  const updateClient = useCallback((client: Client) => {
    pushUndo(); setClients(prev => prev.map(c => c.id === client.id ? client : c)); dbUpdateClient(client);
  }, [pushUndo]);
  const deleteClient = useCallback((id: string) => {
    pushUndo(); setClients(prev => prev.filter(c => c.id !== id)); dbDeleteClient(id);
  }, [pushUndo]);

  // Order
  const addOrder = useCallback((order: Order) => {
    pushUndo();
    setOrders(prev => [...prev, order]);
    dbInsertOrder(order).then(ok => {
      if (!ok) setOrders(prev => prev.filter(o => o.id !== order.id));
    });
  }, [pushUndo]);
  const updateOrder = useCallback((order: Order) => {
    pushUndo();
    let previous: Order | undefined;
    let next: Order = order;
    setOrders(prev => {
      previous = prev.find(o => o.id === order.id);
      // Auto-stamp notesUpdatedAt when observation text changes
      if (previous && (previous.observation || '') !== (order.observation || '')) {
        next = { ...order, notesUpdatedAt: new Date().toISOString() };
      }
      return prev.map(o => o.id === order.id ? next : o);
    });
    dbUpdateOrder(next).then(ok => {
      if (!ok && previous) setOrders(prev => prev.map(o => o.id === order.id ? previous! : o));
    });
  }, [pushUndo]);
  const deleteOrder = useCallback((id: string) => {
    pushUndo();
    setOrders(prev => prev.filter(o => o.id !== id));
    setQCEntries(prev => prev.filter(e => e.orderId !== id));
    setDeliveryEntries(prev => prev.filter(e => e.orderId !== id));
    setDeliveredOrders(prev => prev.filter(e => e.orderId !== id));
    dbDeleteOrder(id);
  }, [pushUndo]);

  // Wrapped setOrders that also syncs to DB
  const setOrdersWrapped = useCallback((newOrders: Order[]) => {
    setOrders(newOrders);
    // Bulk update all non-ABS orders
    const toSync = newOrders.filter(o => o.orderNumber !== 'ABS');
    dbBulkUpdateOrders(toSync);
  }, []);

  // Step
  const addStep = useCallback((step: ProductionStep) => {
    pushUndo();
    setSteps(prev => prev.some(s => s.id === step.id)
      ? prev.map(s => s.id === step.id ? step : s)
      : [...prev, step]
    );
    dbInsertStep(step);
  }, [pushUndo]);
  const updateStep = useCallback((step: ProductionStep) => {
    pushUndo();
    setSteps(prev => {
      let replaced = false;
      const next: ProductionStep[] = [];
      for (const current of prev) {
        if (current.id !== step.id) {
          next.push(current);
          continue;
        }
        if (!replaced) {
          next.push(step);
          replaced = true;
        }
      }
      return replaced ? next : [...next, step];
    });
    dbUpdateStep(step);
  }, [pushUndo]);
  const deleteStep = useCallback((id: string) => {
    pushUndo(); setSteps(prev => prev.filter(s => s.id !== id)); dbDeleteStep(id);
  }, [pushUndo]);

  // Holiday
  const addHoliday = useCallback((holiday: Holiday) => {
    pushUndo(); setHolidays(prev => [...prev, holiday]); dbInsertHoliday(holiday);
  }, [pushUndo]);
  const updateHoliday = useCallback((holiday: Holiday) => {
    pushUndo(); setHolidays(prev => prev.map(h => h.id === holiday.id ? holiday : h)); dbUpdateHoliday(holiday);
  }, [pushUndo]);
  const deleteHoliday = useCallback((id: string) => {
    pushUndo(); setHolidays(prev => prev.filter(h => h.id !== id)); dbDeleteHoliday(id);
  }, [pushUndo]);

  // Production Record
  const addProductionRecord = useCallback((record: ProductionRecord) => {
    pushUndo(); setProductionRecords(prev => [...prev, record]); dbInsertRecord(record);
  }, [pushUndo]);
  const updateProductionRecord = useCallback((record: ProductionRecord) => {
    pushUndo(); setProductionRecords(prev => prev.map(r => r.id === record.id ? record : r)); dbUpdateRecord(record);
  }, [pushUndo]);
  const deleteProductionRecord = useCallback((id: string) => {
    pushUndo(); setProductionRecords(prev => prev.filter(r => r.id !== id)); dbDeleteRecord(id);
  }, [pushUndo]);

  // QC Entry — idempotent: skip if a QC entry already exists for that order,
  // or if the order is already in delivery_entries / delivered_orders / cancelled_orders.
  const addQCEntry = useCallback((entry: QualityControlEntry) => {
    if (qcEntries.some(e => e.orderId === entry.orderId)) return;
    if (deliveryEntries.some(e => e.orderId === entry.orderId)) return;
    if (deliveredOrders.some(e => e.orderId === entry.orderId)) return;
    if (cancelledOrders.some(e => e.orderId === entry.orderId)) return;
    pushUndo(); setQCEntries(prev => [...prev, entry]); dbInsertQCEntry(entry);
  }, [pushUndo, qcEntries, deliveryEntries, deliveredOrders, cancelledOrders]);
  const updateQCEntry = useCallback((entry: QualityControlEntry) => {
    pushUndo(); setQCEntries(prev => prev.map(e => e.id === entry.id ? entry : e)); dbUpdateQCEntry(entry);
  }, [pushUndo]);
  const deleteQCEntry = useCallback((id: string) => {
    pushUndo(); setQCEntries(prev => prev.filter(e => e.id !== id)); dbDeleteQCEntry(id);
  }, [pushUndo]);
  // Partial QC session — always inserts a NEW row.
  const addQCSession = useCallback((entry: QualityControlEntry) => {
    pushUndo();
    setQCEntries(prev => [...prev, entry]);
    dbInsertQCEntry(entry);
  }, [pushUndo]);

  // Delivery Entry — legacy: merges by orderId (back-compat for full-flow callers).
  const addDeliveryEntry = useCallback((entry: DeliveryEntry) => {
    pushUndo();
    setDeliveryEntries(prev => {
      const existing = prev.find(e => e.orderId === entry.orderId);
      if (existing) {
        const mergedEntry = { ...entry, id: existing.id };
        dbUpdateDelivery(mergedEntry);
        return prev.map(e => e.orderId === entry.orderId ? mergedEntry : e);
      }
      dbInsertDelivery(entry);
      return [...prev, entry];
    });
  }, [pushUndo]);
  // Partial delivery-ready session — always inserts a NEW row.
  const addDeliverySession = useCallback((entry: DeliveryEntry) => {
    pushUndo();
    setDeliveryEntries(prev => [...prev, entry]);
    dbInsertDelivery(entry);
  }, [pushUndo]);
  const updateDeliveryEntry = useCallback((entry: DeliveryEntry) => {
    pushUndo();
    setDeliveryEntries(prev => prev.map(e => e.id === entry.id ? entry : e));
    dbUpdateDelivery(entry);
  }, [pushUndo]);
  const deleteDeliveryEntry = useCallback((id: string) => {
    pushUndo(); setDeliveryEntries(prev => prev.filter(e => e.id !== id)); dbDeleteDelivery(id);
  }, [pushUndo]);

  // Delivered Orders (archive) — legacy: idempotent merge by orderId.
  const addDeliveredOrder = useCallback((entry: DeliveredOrder) => {
    pushUndo();
    setDeliveredOrders(prev => {
      const existing = prev.find(d => d.orderId === entry.orderId);
      if (existing) {
        const merged: DeliveredOrder = {
          ...existing,
          deliveryDate: entry.deliveryDate || existing.deliveryDate,
          salePriceStatus: entry.salePriceStatus ?? existing.salePriceStatus,
          observation: entry.observation ?? existing.observation,
          invoiceNumber: entry.invoiceNumber ?? existing.invoiceNumber,
          invoiceDate: entry.invoiceDate ?? existing.invoiceDate,
        };
        dbUpdateDeliveredOrder(merged);
        return prev.map(d => d.id === existing.id ? merged : d);
      }
      dbInsertDeliveredOrder(entry);
      return [...prev, entry];
    });
  }, [pushUndo]);
  // Partial delivered session — always inserts a NEW row.
  const addDeliveredSession = useCallback((entry: DeliveredOrder) => {
    pushUndo();
    setDeliveredOrders(prev => [...prev, entry]);
    dbInsertDeliveredOrder(entry);
  }, [pushUndo]);
  const updateDeliveredOrder = useCallback((entry: DeliveredOrder) => {
    pushUndo(); setDeliveredOrders(prev => prev.map(d => d.id === entry.id ? entry : d)); dbUpdateDeliveredOrder(entry);
  }, [pushUndo]);
  const deleteDeliveredOrder = useCallback((id: string) => {
    pushUndo(); setDeliveredOrders(prev => prev.filter(d => d.id !== id)); dbDeleteDeliveredOrder(id);
  }, [pushUndo]);


  // Cancelled Orders — idempotent: if a cancellation already exists for that orderId, no-op.
  const addCancelledOrder = useCallback(async (entry: CancelledOrder) => {
    if (cancelledOrders.some(c => c.orderId === entry.orderId)) return true;
    pushUndo();
    setCancelledOrders(prev => [...prev, entry]);
    const ok = await dbInsertCancelledOrder(entry);
    if (!ok) setCancelledOrders(prev => prev.filter(c => c.id !== entry.id));
    return ok;
  }, [pushUndo, cancelledOrders]);
  const updateCancelledOrder = useCallback((entry: CancelledOrder) => {
    pushUndo();
    setCancelledOrders(prev => prev.map(c => c.id === entry.id ? entry : c));
    dbUpdateCancelledOrder(entry);
  }, [pushUndo]);
  const deleteCancelledOrder = useCallback((id: string) => {
    pushUndo();
    setCancelledOrders(prev => prev.filter(c => c.id !== id));
    dbDeleteCancelledOrder(id);
  }, [pushUndo]);

  return (
    <PlanningContext.Provider value={{
      loading,
      absenceOperationId,
      absenceOrderId,
      operators, setOperators, addOperator, updateOperator, deleteOperator,
      subcontractors, setSubcontractors, addSubcontractor, updateSubcontractor, deleteSubcontractor,
      operations, setOperations, addOperation, updateOperation, deleteOperation,
      clients: [...clients].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })),
      setClients, addClient, updateClient, deleteClient,
      orders, setOrders: setOrdersWrapped, addOrder, updateOrder, deleteOrder,
      steps, setSteps, addStep, updateStep, deleteStep,
      holidays, setHolidays, addHoliday, updateHoliday, deleteHoliday,
      productionRecords, addProductionRecord, updateProductionRecord, deleteProductionRecord,
      qcEntries, addQCEntry, addQCSession, updateQCEntry, deleteQCEntry,
      deliveryEntries, addDeliveryEntry, addDeliverySession, updateDeliveryEntry, deleteDeliveryEntry,
      deliveredOrders, addDeliveredOrder, addDeliveredSession, updateDeliveredOrder, deleteDeliveredOrder,

      cancelledOrders, addCancelledOrder, updateCancelledOrder, deleteCancelledOrder,
      equipments, setEquipments, addEquipment, updateEquipment, deleteEquipment,
      ganttView, setGanttView,
      ganttZeroDate, setGanttZeroDate,
      selectedOperatorId, setSelectedOperatorId,
      selectedOrderId, setSelectedOrderId,
      undo, redo,
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
    }}>
      {children}
    </PlanningContext.Provider>
  );
};

export const usePlanning = () => {
  const ctx = useContext(PlanningContext);
  if (!ctx) throw new Error('usePlanning must be used within PlanningProvider');
  return ctx;
};
