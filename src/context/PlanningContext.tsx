import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'; // v5
import type { Operator, Subcontractor, Operation, Client, Order, ProductionStep, Holiday, GanttView, ProductionRecord, QualityControlEntry, DeliveryEntry, Equipment } from '@/types/planning';

interface PlanningState {
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
  equipments: Equipment[];
  ganttView: GanttView;
  ganttZeroDate: Date;
  selectedOperatorId: string | null;
  selectedOrderId: string | null;
}

interface PlanningContextType extends PlanningState {
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
  deleteHoliday: (id: string) => void;
  productionRecords: ProductionRecord[];
  addProductionRecord: (record: ProductionRecord) => void;
  deleteProductionRecord: (id: string) => void;
  qcEntries: QualityControlEntry[];
  addQCEntry: (entry: QualityControlEntry) => void;
  updateQCEntry: (entry: QualityControlEntry) => void;
  deleteQCEntry: (id: string) => void;
  deliveryEntries: DeliveryEntry[];
  addDeliveryEntry: (entry: DeliveryEntry) => void;
  deleteDeliveryEntry: (id: string) => void;
  equipments: Equipment[];
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

const defaultOperations: Operation[] = [
  { id: 'op-1', name: 'Tournage', category: 'operator' },
  { id: 'op-2', name: 'Fraisage', category: 'operator' },
  { id: 'op-3', name: 'Perçage', category: 'operator' },
  { id: 'op-4', name: 'Rectification', category: 'operator' },
  { id: 'op-5', name: 'Soudure', category: 'operator' },
  { id: 'op-6', name: 'Traitement thermique', category: 'subcontractor' },
  { id: 'op-7', name: 'Contrôle qualité', category: 'operator' },
  { id: 'op-8', name: 'Absence', category: 'operator' },
];

const defaultOperators: Operator[] = [
  { id: 'opr-1', name: 'Ahmed', mainFunction: 'Tournage', secondaryFunctions: ['Perçage'] },
  { id: 'opr-2', name: 'Mohamed', mainFunction: 'Tournage', secondaryFunctions: ['Fraisage'] },
  { id: 'opr-3', name: 'Karim', mainFunction: 'Fraisage', secondaryFunctions: ['Tournage'] },
  { id: 'opr-4', name: 'Youssef', mainFunction: 'Fraisage', secondaryFunctions: [] },
  { id: 'opr-5', name: 'Omar', mainFunction: 'Soudure', secondaryFunctions: ['Rectification'] },
];

const defaultClients: Client[] = [
  { id: 'cl-1', name: 'LGPA' },
  { id: 'cl-2', name: 'SARL Mécanique Plus' },
];

// Snapshot type for undo/redo (only data that matters)
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
  equipments: Equipment[];
}

const MAX_HISTORY = 50;

const PlanningContext = createContext<PlanningContextType | undefined>(undefined);

export const PlanningProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [operators, setOperators] = useState<Operator[]>(defaultOperators);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([
    { id: 'sub-1', companyName: 'Traitements SA', mainActivity: 'Traitement thermique', secondaryActivities: [] },
  ]);
  const [operations, setOperations] = useState<Operation[]>(defaultOperations);
  const [clients, setClients] = useState<Client[]>(defaultClients);
  const [orders, setOrders] = useState<Order[]>([
    { id: 'order-absence', orderNumber: 'ABS', orderDate: '', clientId: '', designation: 'Absence', quantity: 0, urgency: 'low', plannedDeadline: '', materialAvailable: true, toolingAvailable: true, studyReady: true },
  ]);
  const [steps, setSteps] = useState<ProductionStep[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [productionRecords, setProductionRecords] = useState<ProductionRecord[]>([]);
  const [qcEntries, setQCEntries] = useState<QualityControlEntry[]>([]);
  const [deliveryEntries, setDeliveryEntries] = useState<DeliveryEntry[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [ganttView, setGanttView] = useState<GanttView>('day');
  const [ganttZeroDate, setGanttZeroDate] = useState<Date>(new Date());
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Undo/Redo history
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const [historyTrigger, setHistoryTrigger] = useState(0); // force re-render for canUndo/canRedo

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
    equipments: [...equipments],
  }), [operators, subcontractors, operations, clients, orders, steps, holidays, productionRecords, qcEntries, deliveryEntries, equipments]);

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
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // Wrapped setters that push undo before mutating
  const wrap = <T extends any[]>(fn: (...args: T) => void) =>
    useCallback((...args: T) => { pushUndo(); fn(...args); }, [pushUndo, fn]);

  const addOperator = wrap((op: Operator) => setOperators(prev => [...prev, op]));
  const updateOperator = wrap((op: Operator) => setOperators(prev => prev.map(o => o.id === op.id ? op : o)));
  const deleteOperator = wrap((id: string) => setOperators(prev => prev.filter(o => o.id !== id)));

  const addSubcontractor = wrap((sub: Subcontractor) => setSubcontractors(prev => [...prev, sub]));
  const updateSubcontractor = wrap((sub: Subcontractor) => setSubcontractors(prev => prev.map(s => s.id === sub.id ? sub : s)));
  const deleteSubcontractor = wrap((id: string) => setSubcontractors(prev => prev.filter(s => s.id !== id)));

  const addOperation = wrap((op: Operation) => setOperations(prev => [...prev, op]));
  const updateOperation = wrap((op: Operation) => setOperations(prev => prev.map(o => o.id === op.id ? op : o)));
  const deleteOperation = wrap((id: string) => setOperations(prev => prev.filter(o => o.id !== id)));

  const addClient = wrap((client: Client) => setClients(prev => [...prev, client]));
  const updateClient = wrap((client: Client) => setClients(prev => prev.map(c => c.id === client.id ? client : c)));
  const deleteClient = wrap((id: string) => setClients(prev => prev.filter(c => c.id !== id)));

  const addOrder = wrap((order: Order) => setOrders(prev => [...prev, order]));
  const updateOrder = wrap((order: Order) => setOrders(prev => prev.map(o => o.id === order.id ? order : o)));
  const deleteOrder = wrap((id: string) => setOrders(prev => prev.filter(o => o.id !== id)));

  const addStep = wrap((step: ProductionStep) => setSteps(prev => [...prev, step]));
  const updateStep = wrap((step: ProductionStep) => setSteps(prev => prev.map(s => s.id === step.id ? step : s)));
  const deleteStep = wrap((id: string) => setSteps(prev => prev.filter(s => s.id !== id)));

  const addHoliday = wrap((holiday: Holiday) => setHolidays(prev => [...prev, holiday]));
  const deleteHoliday = wrap((id: string) => setHolidays(prev => prev.filter(h => h.id !== id)));

  const addProductionRecord = wrap((record: ProductionRecord) => setProductionRecords(prev => [...prev, record]));
  const deleteProductionRecord = wrap((id: string) => setProductionRecords(prev => prev.filter(r => r.id !== id)));

  const addQCEntry = wrap((entry: QualityControlEntry) => setQCEntries(prev => [...prev, entry]));
  const updateQCEntry = wrap((entry: QualityControlEntry) => setQCEntries(prev => prev.map(e => e.id === entry.id ? entry : e)));
  const deleteQCEntry = wrap((id: string) => setQCEntries(prev => prev.filter(e => e.id !== id)));

  const addDeliveryEntry = wrap((entry: DeliveryEntry) => setDeliveryEntries(prev => [...prev, entry]));
  const deleteDeliveryEntry = wrap((id: string) => setDeliveryEntries(prev => prev.filter(e => e.id !== id)));

  return (
    <PlanningContext.Provider value={{
      operators, setOperators, addOperator, updateOperator, deleteOperator,
      subcontractors, setSubcontractors, addSubcontractor, updateSubcontractor, deleteSubcontractor,
      operations, setOperations, addOperation, updateOperation, deleteOperation,
      clients, setClients, addClient, updateClient, deleteClient,
      orders, setOrders, addOrder, updateOrder, deleteOrder,
      steps, setSteps, addStep, updateStep, deleteStep,
      holidays, setHolidays, addHoliday, deleteHoliday,
      productionRecords, addProductionRecord, deleteProductionRecord,
      qcEntries, addQCEntry, updateQCEntry, deleteQCEntry,
      deliveryEntries, addDeliveryEntry, deleteDeliveryEntry,
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
