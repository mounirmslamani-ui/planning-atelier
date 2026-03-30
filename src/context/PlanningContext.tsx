import React, { createContext, useContext, useState, useCallback } from 'react'; // v3
import type { Operator, Subcontractor, Operation, Client, Order, ProductionStep, Holiday, GanttView, ProductionRecord, QualityControlEntry, DeliveryEntry } from '@/types/planning';

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
  setGanttView: (view: GanttView) => void;
  setGanttZeroDate: (date: Date) => void;
  setSelectedOperatorId: (id: string | null) => void;
  setSelectedOrderId: (id: string | null) => void;
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
  const [ganttView, setGanttView] = useState<GanttView>('day');
  const [ganttZeroDate, setGanttZeroDate] = useState<Date>(new Date());
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const addOperator = useCallback((op: Operator) => setOperators(prev => [...prev, op]), []);
  const updateOperator = useCallback((op: Operator) => setOperators(prev => prev.map(o => o.id === op.id ? op : o)), []);
  const deleteOperator = useCallback((id: string) => setOperators(prev => prev.filter(o => o.id !== id)), []);

  const addSubcontractor = useCallback((sub: Subcontractor) => setSubcontractors(prev => [...prev, sub]), []);
  const updateSubcontractor = useCallback((sub: Subcontractor) => setSubcontractors(prev => prev.map(s => s.id === sub.id ? sub : s)), []);
  const deleteSubcontractor = useCallback((id: string) => setSubcontractors(prev => prev.filter(s => s.id !== id)), []);

  const addOperation = useCallback((op: Operation) => setOperations(prev => [...prev, op]), []);
  const updateOperation = useCallback((op: Operation) => setOperations(prev => prev.map(o => o.id === op.id ? op : o)), []);
  const deleteOperation = useCallback((id: string) => setOperations(prev => prev.filter(o => o.id !== id)), []);

  const addClient = useCallback((client: Client) => setClients(prev => [...prev, client]), []);
  const updateClient = useCallback((client: Client) => setClients(prev => prev.map(c => c.id === client.id ? client : c)), []);
  const deleteClient = useCallback((id: string) => setClients(prev => prev.filter(c => c.id !== id)), []);

  const addOrder = useCallback((order: Order) => setOrders(prev => [...prev, order]), []);
  const updateOrder = useCallback((order: Order) => setOrders(prev => prev.map(o => o.id === order.id ? order : o)), []);
  const deleteOrder = useCallback((id: string) => setOrders(prev => prev.filter(o => o.id !== id)), []);

  const addStep = useCallback((step: ProductionStep) => setSteps(prev => [...prev, step]), []);
  const updateStep = useCallback((step: ProductionStep) => setSteps(prev => prev.map(s => s.id === step.id ? step : s)), []);
  const deleteStep = useCallback((id: string) => setSteps(prev => prev.filter(s => s.id !== id)), []);

  const addHoliday = useCallback((holiday: Holiday) => setHolidays(prev => [...prev, holiday]), []);
  const deleteHoliday = useCallback((id: string) => setHolidays(prev => prev.filter(h => h.id !== id)), []);

  const addProductionRecord = useCallback((record: ProductionRecord) => setProductionRecords(prev => [...prev, record]), []);
  const deleteProductionRecord = useCallback((id: string) => setProductionRecords(prev => prev.filter(r => r.id !== id)), []);

  const addQCEntry = useCallback((entry: QualityControlEntry) => setQCEntries(prev => [...prev, entry]), []);
  const updateQCEntry = useCallback((entry: QualityControlEntry) => setQCEntries(prev => prev.map(e => e.id === entry.id ? entry : e)), []);
  const deleteQCEntry = useCallback((id: string) => setQCEntries(prev => prev.filter(e => e.id !== id)), []);

  const addDeliveryEntry = useCallback((entry: DeliveryEntry) => setDeliveryEntries(prev => [...prev, entry]), []);
  const deleteDeliveryEntry = useCallback((id: string) => setDeliveryEntries(prev => prev.filter(e => e.id !== id)), []);

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
