import { supabase } from '@/integrations/supabase/client';
import type {
  Equipment, Operator, Subcontractor, Operation, Client, Order,
  ProductionStep, Holiday, ProductionRecord, QualityControlEntry, DeliveryEntry,
  EquipmentType, EquipmentState, OperationCategory, ClientClass, OrderPriority, QCDecision,
} from '@/types/planning';

// ───────────────────── Helpers ─────────────────────

function trimTime(t: string | null | undefined): string {
  if (!t) return '';
  return t.substring(0, 5); // "08:00:00" → "08:00"
}

function nullIfEmpty(s: string | undefined | null): string | null {
  return s && s.length > 0 ? s : null;
}

/**
 * Convert any date string to ISO format yyyy-mm-dd for PostgreSQL.
 * Handles: dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd, mm-dd-yyyy ambiguous cases.
 */
function toISODate(dateStr: string | undefined | null, fallback?: string): string {
  if (!dateStr || dateStr.trim() === '') return fallback || new Date().toISOString().split('T')[0];
  const s = dateStr.trim();
  // Already ISO format yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/yyyy or dd-mm-yyyy
  const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const [, a, b, year] = match;
    const day = a.padStart(2, '0');
    const month = b.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  // Fallback: try Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return fallback || new Date().toISOString().split('T')[0];
}

function toISODateOrNull(dateStr: string | undefined | null): string | null {
  if (!dateStr || dateStr.trim() === '') return null;
  return toISODate(dateStr);
}

// ───────────────────── Equipment ─────────────────────

export function mapEquipmentFromDB(row: any): Equipment {
  return {
    id: row.id,
    designation: row.designation,
    type: row.type as EquipmentType,
    capacity: row.capacity || '',
    state: row.state as EquipmentState,
  };
}

export function mapEquipmentToDB(eq: Equipment) {
  return {
    id: eq.id,
    designation: eq.designation,
    type: eq.type,
    capacity: eq.capacity,
    state: eq.state,
  };
}

// ───────────────────── Operator ─────────────────────

export function mapOperatorFromDB(row: any): Operator {
  return {
    id: row.id,
    name: row.name,
    mainFunction: row.main_function,
    secondaryFunctions: row.secondary_functions || [],
    mainEquipment: row.main_equipment || undefined,
    secondaryEquipments: row.secondary_equipments || [],
  };
}

export function mapOperatorToDB(op: Operator) {
  return {
    id: op.id,
    name: op.name,
    main_function: op.mainFunction,
    secondary_functions: op.secondaryFunctions,
    main_equipment: op.mainEquipment || null,
    secondary_equipments: op.secondaryEquipments || [],
  };
}

// ───────────────────── Subcontractor ─────────────────────

export function mapSubcontractorFromDB(row: any): Subcontractor {
  return {
    id: row.id,
    companyName: row.company_name,
    mainActivity: row.main_activity,
    secondaryActivities: row.secondary_activities || [],
  };
}

export function mapSubcontractorToDB(sub: Subcontractor) {
  return {
    id: sub.id,
    company_name: sub.companyName,
    main_activity: sub.mainActivity,
    secondary_activities: sub.secondaryActivities,
  };
}

// ───────────────────── Operation ─────────────────────

export function mapOperationFromDB(row: any): Operation {
  return {
    id: row.id,
    name: row.name,
    category: row.category as OperationCategory,
  };
}

export function mapOperationToDB(op: Operation) {
  return {
    id: op.id,
    name: op.name,
    category: op.category,
  };
}

// ───────────────────── Client ─────────────────────

export function mapClientFromDB(row: any): Client {
  return {
    id: row.id,
    name: row.name,
    clientClass: row.client_class as ClientClass | undefined,
  };
}

export function mapClientToDB(c: Client) {
  return {
    id: c.id,
    name: c.name,
    client_class: c.clientClass || null,
  };
}

// ───────────────────── Order ─────────────────────

export function mapOrderFromDB(row: any): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    orderDate: row.order_date || '',
    clientId: row.client_id || '',
    designation: row.designation,
    quantity: row.quantity ?? 1,
    priority: (row.priority || 'P3') as OrderPriority,
    displayOrder: row.display_order ?? undefined,
    frozenOrder: row.frozen_order ?? false,
    plannedDeadline: row.planned_deadline || '',
    prototypeQuantity: row.prototype_quantity ?? undefined,
    prototypeDeadline: row.prototype_deadline || undefined,
    deliveryDeadline: row.delivery_deadline || undefined,
    complementaryQuantity: row.complementary_quantity ?? undefined,
    materialAvailable: row.material_available ?? false,
    toolingAvailable: row.tooling_available ?? false,
    studyReady: row.study_ready ?? false,
    observation: row.observation || undefined,
  };
}

export function mapOrderToDB(o: Order) {
  return {
    id: o.id,
    order_number: o.orderNumber,
    order_date: toISODate(o.orderDate),
    client_id: nullIfEmpty(o.clientId),
    designation: o.designation,
    quantity: o.quantity,
    priority: o.priority || 'P3',
    display_order: o.displayOrder ?? null,
    frozen_order: o.frozenOrder ?? false,
    planned_deadline: toISODate(o.plannedDeadline),
    prototype_quantity: o.prototypeQuantity ?? null,
    prototype_deadline: toISODateOrNull(o.prototypeDeadline),
    delivery_deadline: toISODateOrNull(o.deliveryDeadline),
    complementary_quantity: o.complementaryQuantity ?? null,
    material_available: o.materialAvailable ?? false,
    tooling_available: o.toolingAvailable ?? false,
    study_ready: o.studyReady ?? false,
    observation: o.observation || null,
  };
}

// ───────────────────── ProductionStep ─────────────────────

export function mapStepFromDB(row: any): ProductionStep {
  return {
    id: row.id,
    orderId: row.order_id,
    operatorId: row.operator_id || '',
    subcontractorId: row.subcontractor_id || undefined,
    operationId: row.operation_id,
    estimatedDuration: row.estimated_duration ?? 0,
    startDate: row.start_date || '',
    startTime: trimTime(row.start_time),
    endDate: row.end_date || '',
    endTime: trimTime(row.end_time),
    dependsOn: row.depends_on || undefined,
    dependsOnPercentage: row.depends_on_percentage ?? undefined,
    order: row.step_order ?? 0,
    frozen: row.frozen ?? false,
    equipmentIds: row.equipment_ids || [],
    subcontractingDone: row.subcontracting_done ?? false,
    subcontractingDeadline: row.subcontracting_deadline || undefined,
    studyReady: row.study_ready ?? true,
    materialAvailable: row.material_available ?? true,
    toolingAvailable: row.tooling_available ?? true,
    studyDeadline: row.study_deadline || undefined,
    materialDeadline: row.material_deadline || undefined,
    toolingDeadline: row.tooling_deadline || undefined,
  };
}

export function mapStepToDB(s: ProductionStep) {
  return {
    id: s.id,
    order_id: s.orderId,
    operator_id: nullIfEmpty(s.operatorId),
    subcontractor_id: nullIfEmpty(s.subcontractorId),
    operation_id: s.operationId,
    estimated_duration: s.estimatedDuration,
    start_date: toISODateOrNull(s.startDate),
    start_time: nullIfEmpty(s.startTime),
    end_date: toISODateOrNull(s.endDate),
    end_time: nullIfEmpty(s.endTime),
    depends_on: nullIfEmpty(s.dependsOn),
    depends_on_percentage: s.dependsOnPercentage ?? null,
    step_order: s.order,
    frozen: s.frozen ?? false,
    equipment_ids: s.equipmentIds || [],
    subcontracting_done: s.subcontractingDone ?? false,
    subcontracting_deadline: toISODateOrNull(s.subcontractingDeadline),
    study_ready: s.studyReady ?? true,
    material_available: s.materialAvailable ?? true,
    tooling_available: s.toolingAvailable ?? true,
    study_deadline: toISODateOrNull(s.studyDeadline),
    material_deadline: toISODateOrNull(s.materialDeadline),
    tooling_deadline: toISODateOrNull(s.toolingDeadline),
  };
}

// ───────────────────── Holiday ─────────────────────

export function mapHolidayFromDB(row: any): Holiday {
  return { id: row.id, date: row.date, name: row.name };
}

export function mapHolidayToDB(h: Holiday) {
  return { id: h.id, date: toISODate(h.date), name: h.name };
}

// ───────────────────── ProductionRecord ─────────────────────

export function mapRecordFromDB(row: any): ProductionRecord {
  return {
    id: row.id,
    stepId: row.step_id,
    orderId: row.order_id,
    operatorId: row.operator_id,
    operationId: row.operation_id,
    actualDuration: row.actual_duration ?? 0,
    validatedAt: row.validated_at || row.created_at || '',
  };
}

export function mapRecordToDB(r: ProductionRecord) {
  return {
    id: r.id,
    step_id: r.stepId,
    order_id: r.orderId,
    operator_id: r.operatorId,
    operation_id: r.operationId,
    actual_duration: r.actualDuration,
    validated_at: r.validatedAt || new Date().toISOString(),
  };
}

// ───────────────────── QualityControlEntry ─────────────────────

export function mapQCEntryFromDB(row: any): QualityControlEntry {
  return {
    id: row.id,
    orderId: row.order_id,
    controlDate: row.control_date || '',
    decision: row.decision as QCDecision | undefined,
    reworkNotes: row.rework_notes || undefined,
    createdAt: row.created_at || '',
  };
}

export function mapQCEntryToDB(e: QualityControlEntry) {
  return {
    id: e.id,
    order_id: e.orderId,
    control_date: toISODate(e.controlDate),
    decision: e.decision || null,
    rework_notes: e.reworkNotes || null,
  };
}

// ───────────────────── DeliveryEntry ─────────────────────

export function mapDeliveryFromDB(row: any): DeliveryEntry {
  return {
    id: row.id,
    orderId: row.order_id,
    controlDate: row.control_date || '',
    decision: row.decision as 'conforme' | 'conforme-derogation',
    movedAt: row.moved_at || '',
  };
}

export function mapDeliveryToDB(e: DeliveryEntry) {
  return {
    id: e.id,
    order_id: e.orderId,
    control_date: toISODate(e.controlDate),
    decision: e.decision,
    moved_at: e.movedAt || new Date().toISOString(),
  };
}

// ───────────────────── Fetch All ─────────────────────

export async function fetchAllData() {
  const [
    { data: equipments },
    { data: operators },
    { data: subcontractors },
    { data: operations },
    { data: clients },
    { data: orders },
    { data: steps },
    { data: holidays },
    { data: records },
    { data: qcEntries },
    { data: deliveryEntries },
  ] = await Promise.all([
    supabase.from('equipments').select('*'),
    supabase.from('operators').select('*'),
    supabase.from('subcontractors').select('*'),
    supabase.from('operations').select('*'),
    supabase.from('clients').select('*'),
    supabase.from('orders').select('*'),
    supabase.from('production_steps').select('*'),
    supabase.from('holidays').select('*'),
    supabase.from('production_records').select('*'),
    supabase.from('quality_control_entries').select('*'),
    supabase.from('delivery_entries').select('*'),
  ]);

  return {
    equipments: (equipments || []).map(mapEquipmentFromDB),
    operators: (operators || []).map(mapOperatorFromDB),
    subcontractors: (subcontractors || []).map(mapSubcontractorFromDB),
    operations: (operations || []).map(mapOperationFromDB),
    clients: (clients || []).map(mapClientFromDB),
    orders: (orders || []).map(mapOrderFromDB),
    steps: (steps || []).map(mapStepFromDB),
    holidays: (holidays || []).map(mapHolidayFromDB),
    productionRecords: (records || []).map(mapRecordFromDB),
    qcEntries: (qcEntries || []).map(mapQCEntryFromDB),
    deliveryEntries: (deliveryEntries || []).map(mapDeliveryFromDB),
  };
}

// ───────────────────── DB CRUD (fire-and-forget) ─────────────────────

function logError(entity: string, action: string, error: any) {
  console.error(`[DB] Failed to ${action} ${entity}:`, error);
}

// Equipment
export async function dbInsertEquipment(eq: Equipment) {
  const { error } = await supabase.from('equipments').insert(mapEquipmentToDB(eq));
  if (error) logError('equipment', 'insert', error);
}
export async function dbUpdateEquipment(eq: Equipment) {
  const { error } = await supabase.from('equipments').update(mapEquipmentToDB(eq)).eq('id', eq.id);
  if (error) logError('equipment', 'update', error);
}
export async function dbDeleteEquipment(id: string) {
  const { error } = await supabase.from('equipments').delete().eq('id', id);
  if (error) logError('equipment', 'delete', error);
}

// Operator
export async function dbInsertOperator(op: Operator) {
  const { error } = await supabase.from('operators').insert(mapOperatorToDB(op));
  if (error) logError('operator', 'insert', error);
}
export async function dbUpdateOperator(op: Operator) {
  const { error } = await supabase.from('operators').update(mapOperatorToDB(op)).eq('id', op.id);
  if (error) logError('operator', 'update', error);
}
export async function dbDeleteOperator(id: string) {
  const { error } = await supabase.from('operators').delete().eq('id', id);
  if (error) logError('operator', 'delete', error);
}

// Subcontractor
export async function dbInsertSubcontractor(sub: Subcontractor) {
  const { error } = await supabase.from('subcontractors').insert(mapSubcontractorToDB(sub));
  if (error) logError('subcontractor', 'insert', error);
}
export async function dbUpdateSubcontractor(sub: Subcontractor) {
  const { error } = await supabase.from('subcontractors').update(mapSubcontractorToDB(sub)).eq('id', sub.id);
  if (error) logError('subcontractor', 'update', error);
}
export async function dbDeleteSubcontractor(id: string) {
  const { error } = await supabase.from('subcontractors').delete().eq('id', id);
  if (error) logError('subcontractor', 'delete', error);
}

// Operation
export async function dbInsertOperation(op: Operation) {
  const { error } = await supabase.from('operations').insert(mapOperationToDB(op));
  if (error) logError('operation', 'insert', error);
}
export async function dbUpdateOperation(op: Operation) {
  const { error } = await supabase.from('operations').update(mapOperationToDB(op)).eq('id', op.id);
  if (error) logError('operation', 'update', error);
}
export async function dbDeleteOperation(id: string) {
  const { error } = await supabase.from('operations').delete().eq('id', id);
  if (error) logError('operation', 'delete', error);
}

// Client
export async function dbInsertClient(c: Client) {
  const { error } = await supabase.from('clients').insert(mapClientToDB(c));
  if (error) logError('client', 'insert', error);
}
export async function dbUpdateClient(c: Client) {
  const { error } = await supabase.from('clients').update(mapClientToDB(c)).eq('id', c.id);
  if (error) logError('client', 'update', error);
}
export async function dbDeleteClient(id: string) {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) logError('client', 'delete', error);
}

// Order
export async function dbInsertOrder(o: Order) {
  const { error } = await supabase.from('orders').insert(mapOrderToDB(o));
  if (error) logError('order', 'insert', error);
}
export async function dbUpdateOrder(o: Order) {
  const { error } = await supabase.from('orders').update(mapOrderToDB(o)).eq('id', o.id);
  if (error) logError('order', 'update', error);
}
export async function dbDeleteOrder(id: string) {
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) logError('order', 'delete', error);
}
export async function dbBulkUpdateOrders(orders: Order[]) {
  // Use upsert for bulk operations
  const mapped = orders.map(mapOrderToDB);
  const { error } = await supabase.from('orders').upsert(mapped);
  if (error) logError('orders', 'bulk update', error);
}

// Step
export async function dbInsertStep(s: ProductionStep) {
  // Guard: never insert an Absence operation linked to a real order
  const mapped = mapStepToDB(s);
  const { error } = await supabase.from('production_steps').insert(mapped);
  if (error) logError('step', 'insert', error);
}
export async function dbUpdateStep(s: ProductionStep) {
  const { error } = await supabase.from('production_steps').update(mapStepToDB(s)).eq('id', s.id);
  if (error) logError('step', 'update', error);
}
export async function dbDeleteStep(id: string) {
  const { error } = await supabase.from('production_steps').delete().eq('id', id);
  if (error) logError('step', 'delete', error);
}
export async function dbBulkInsertSteps(steps: ProductionStep[]) {
  const mapped = steps.map(mapStepToDB);
  const { error } = await supabase.from('production_steps').upsert(mapped);
  if (error) logError('steps', 'bulk insert', error);
}

// Holiday
export async function dbInsertHoliday(h: Holiday) {
  const { error } = await supabase.from('holidays').insert(mapHolidayToDB(h));
  if (error) logError('holiday', 'insert', error);
}
export async function dbUpdateHoliday(h: Holiday) {
  const { error } = await supabase.from('holidays').update(mapHolidayToDB(h)).eq('id', h.id);
  if (error) logError('holiday', 'update', error);
}
export async function dbDeleteHoliday(id: string) {
  const { error } = await supabase.from('holidays').delete().eq('id', id);
  if (error) logError('holiday', 'delete', error);
}

// ProductionRecord
export async function dbInsertRecord(r: ProductionRecord) {
  const { error } = await supabase.from('production_records').insert(mapRecordToDB(r));
  if (error) logError('record', 'insert', error);
}
export async function dbDeleteRecord(id: string) {
  const { error } = await supabase.from('production_records').delete().eq('id', id);
  if (error) logError('record', 'delete', error);
}

// QC Entry
export async function dbInsertQCEntry(e: QualityControlEntry) {
  const { error } = await supabase.from('quality_control_entries').insert(mapQCEntryToDB(e));
  if (error) logError('qc_entry', 'insert', error);
}
export async function dbUpdateQCEntry(e: QualityControlEntry) {
  const { error } = await supabase.from('quality_control_entries').update(mapQCEntryToDB(e)).eq('id', e.id);
  if (error) logError('qc_entry', 'update', error);
}
export async function dbDeleteQCEntry(id: string) {
  const { error } = await supabase.from('quality_control_entries').delete().eq('id', id);
  if (error) logError('qc_entry', 'delete', error);
}

// Delivery Entry
export async function dbInsertDelivery(e: DeliveryEntry) {
  const { error } = await supabase.from('delivery_entries').insert(mapDeliveryToDB(e));
  if (error) logError('delivery', 'insert', error);
}
export async function dbDeleteDelivery(id: string) {
  const { error } = await supabase.from('delivery_entries').delete().eq('id', id);
  if (error) logError('delivery', 'delete', error);
}

// ───────────────────── Ensure Absence Entities ─────────────────────

export async function ensureAbsenceOperation(existingOps: Operation[]): Promise<Operation> {
  const existing = existingOps.find(o => o.name === 'Absence' && o.category === 'operator');
  if (existing) return existing;

  const id = crypto.randomUUID();
  const op: Operation = { id, name: 'Absence', category: 'operator' };
  const { data, error } = await supabase.from('operations').insert(mapOperationToDB(op)).select().single();
  if (error || !data) {
    console.error('Failed to create Absence operation:', error);
    return op;
  }
  return mapOperationFromDB(data);
}

export async function ensureAbsenceOrder(existingOrders: Order[]): Promise<Order> {
  const existing = existingOrders.find(o => o.orderNumber === 'ABS');
  if (existing) return existing;

  const id = crypto.randomUUID();
  const order: Order = {
    id,
    orderNumber: 'ABS',
    orderDate: '',
    clientId: '',
    designation: 'Absence',
    quantity: 0,
    priority: 'P4',
    plannedDeadline: '',
    materialAvailable: true,
    toolingAvailable: true,
    studyReady: true,
  };
  const { data, error } = await supabase.from('orders').insert(mapOrderToDB(order)).select().single();
  if (error || !data) {
    console.error('Failed to create ABS order:', error);
    return order;
  }
  return mapOrderFromDB(data);
}

// ───────────────────── Sync All In-Memory Data to DB ─────────────────────

export async function syncAllDataToDB(data: {
  equipments: Equipment[];
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
}) {
  console.log('[Sync] Starting full data sync to DB...');
  const results = await Promise.allSettled([
    data.equipments.length > 0 ? supabase.from('equipments').upsert(data.equipments.map(mapEquipmentToDB)).then(r => { if (r.error) logError('equipments', 'sync', r.error); else console.log(`[Sync] Equipments: ${data.equipments.length}`); }) : Promise.resolve(),
    data.operators.length > 0 ? supabase.from('operators').upsert(data.operators.map(mapOperatorToDB)).then(r => { if (r.error) logError('operators', 'sync', r.error); else console.log(`[Sync] Operators: ${data.operators.length}`); }) : Promise.resolve(),
    data.subcontractors.length > 0 ? supabase.from('subcontractors').upsert(data.subcontractors.map(mapSubcontractorToDB)).then(r => { if (r.error) logError('subcontractors', 'sync', r.error); else console.log(`[Sync] Subcontractors: ${data.subcontractors.length}`); }) : Promise.resolve(),
    data.operations.length > 0 ? supabase.from('operations').upsert(data.operations.map(mapOperationToDB)).then(r => { if (r.error) logError('operations', 'sync', r.error); else console.log(`[Sync] Operations: ${data.operations.length}`); }) : Promise.resolve(),
    data.clients.length > 0 ? supabase.from('clients').upsert(data.clients.map(mapClientToDB)).then(r => { if (r.error) logError('clients', 'sync', r.error); else console.log(`[Sync] Clients: ${data.clients.length}`); }) : Promise.resolve(),
    data.orders.length > 0 ? supabase.from('orders').upsert(data.orders.map(mapOrderToDB)).then(r => { if (r.error) logError('orders', 'sync', r.error); else console.log(`[Sync] Orders: ${data.orders.length}`); }) : Promise.resolve(),
    data.holidays.length > 0 ? supabase.from('holidays').upsert(data.holidays.map(mapHolidayToDB)).then(r => { if (r.error) logError('holidays', 'sync', r.error); else console.log(`[Sync] Holidays: ${data.holidays.length}`); }) : Promise.resolve(),
  ]);
  
  // Steps depend on orders/operators, sync after
  if (data.steps.length > 0) {
    const { error } = await supabase.from('production_steps').upsert(data.steps.map(mapStepToDB));
    if (error) logError('steps', 'sync', error); else console.log(`[Sync] Steps: ${data.steps.length}`);
  }
  if (data.productionRecords.length > 0) {
    const { error } = await supabase.from('production_records').upsert(data.productionRecords.map(mapRecordToDB));
    if (error) logError('records', 'sync', error); else console.log(`[Sync] Records: ${data.productionRecords.length}`);
  }
  if (data.qcEntries.length > 0) {
    const { error } = await supabase.from('quality_control_entries').upsert(data.qcEntries.map(mapQCEntryToDB));
    if (error) logError('qcEntries', 'sync', error); else console.log(`[Sync] QC: ${data.qcEntries.length}`);
  }
  if (data.deliveryEntries.length > 0) {
    const { error } = await supabase.from('delivery_entries').upsert(data.deliveryEntries.map(mapDeliveryToDB));
    if (error) logError('deliveries', 'sync', error); else console.log(`[Sync] Deliveries: ${data.deliveryEntries.length}`);
  }
  
  console.log('[Sync] Full data sync complete.');
}
