import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type {
  Equipment, Operator, Subcontractor, Operation, Client, Order,
  ProductionStep, Holiday, ProductionRecord, QualityControlEntry, DeliveryEntry,
  EquipmentType, EquipmentState, OperationCategory, ClientClass, OrderPriority, QCDecision,
  ResourceStatus, DeliveredOrder, SalePriceStatus, CancelledOrder,
} from '@/types/planning';
import { statusToBool, boolToStatus } from '@/types/planning';

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
    representatives: Array.isArray(row.representatives) ? row.representatives : [],
    phones: row.phones || [],
    addresses: row.addresses || [],
    addressDetails: Array.isArray(row.address_details) ? row.address_details : [],
    emails: row.emails || [],
  };
}

export function mapSubcontractorToDB(sub: Subcontractor) {
  return {
    id: sub.id,
    company_name: sub.companyName,
    main_activity: sub.mainActivity,
    secondary_activities: sub.secondaryActivities,
    representatives: (sub.representatives || []) as any,
    phones: sub.phones || [],
    addresses: sub.addresses || [],
    address_details: (sub.addressDetails || []) as any,
    emails: sub.emails || [],
  };
}

// ───────────────────── Operation ─────────────────────

export function mapOperationFromDB(row: any): Operation {
  return {
    id: row.id,
    name: row.name,
    category: row.category as OperationCategory,
    hourlyRate1: row.hourly_rate_1 != null ? Number(row.hourly_rate_1) : undefined,
    hourlyRate2: row.hourly_rate_2 != null ? Number(row.hourly_rate_2) : undefined,
  };
}

export function mapOperationToDB(op: Operation) {
  return {
    id: op.id,
    name: op.name,
    category: op.category,
    hourly_rate_1: op.hourlyRate1 ?? null,
    hourly_rate_2: op.hourlyRate2 ?? null,
  };
}

// ───────────────────── Client ─────────────────────

export function mapClientFromDB(row: any): Client {
  const reps = Array.isArray(row.representatives) ? row.representatives : [];
  return {
    id: row.id,
    name: row.name,
    clientClass: row.client_class as ClientClass | undefined,
    activity: row.activity || undefined,
    representatives: reps.map((r: any) => {
      // Strip legacy `addresses` field from representatives
      const { addresses: _legacy, ...rest } = r || {};
      return rest;
    }),
    phones: row.phones || [],
    addresses: row.addresses || [],
    addressDetails: Array.isArray(row.address_details) ? row.address_details : [],
    emails: row.emails || [],
  };
}

export function mapClientToDB(c: Client) {
  return {
    id: c.id,
    name: c.name,
    client_class: c.clientClass || null,
    activity: c.activity || null,
    representatives: ((c.representatives || []) as any).map((r: any) => {
      const { addresses: _legacy, ...rest } = r || {};
      return rest;
    }),
    phones: c.phones || [],
    addresses: c.addresses || [],
    address_details: (c.addressDetails || []) as any,
    emails: c.emails || [],
  };
}

// ───────────────────── Order ─────────────────────

export function mapOrderFromDB(row: any): Order {
  const materialStatus = (row.material_status || 'non-disponible') as ResourceStatus;
  const toolingStatus  = (row.tooling_status  || 'non-disponible') as ResourceStatus;
  const studyStatus    = (row.study_status    || 'non-disponible') as ResourceStatus;
  return {
    id: row.id,
    orderNumber: row.order_number,
    orderDate: row.order_date || '',
    clientId: row.client_id || '',
    designation: row.designation,
    quantity: row.quantity ?? 1,
    priority: (row.priority || 'undetermined') as OrderPriority,
    displayOrder: row.display_order ?? undefined,
    frozenOrder: row.frozen_order ?? false,
    manualSortOrder: row.manual_sort_order ?? undefined,
    plannedDeadline: row.planned_deadline || '',
    prototypeQuantity: row.prototype_quantity ?? undefined,
    prototypeDeadline: row.prototype_deadline || undefined,
    deliveryDeadline: row.delivery_deadline || undefined,
    complementaryQuantity: row.complementary_quantity ?? undefined,
    materialStatus,
    toolingStatus,
    studyStatus,
    materialAvailable: statusToBool(materialStatus),
    toolingAvailable: statusToBool(toolingStatus),
    studyReady: statusToBool(studyStatus),
    materialReceivedDate: row.material_received_date || undefined,
    observation: row.observation || undefined,
    clientRepresentative: row.client_representative || undefined,
    instructions: row.instructions || undefined,
    drawingModel: row.drawing_model || undefined,
    notesUpdatedAt: row.notes_updated_at || undefined,
    category: (row.category || 'fabrication') as any,
    reintegratedAt: (row as any).reintegrated_at || undefined,
    
    technicalComplexity: (row as any).technical_complexity || undefined,
    salePricePerUnit: row.sale_price_per_unit != null ? Number(row.sale_price_per_unit) : undefined,
  };
}

export function mapOrderToDB(o: Order) {
  // Prefer explicit status; fall back to legacy boolean.
  const material_status = o.materialStatus ?? boolToStatus(o.materialAvailable);
  const tooling_status  = o.toolingStatus  ?? boolToStatus(o.toolingAvailable);
  const study_status    = o.studyStatus    ?? boolToStatus(o.studyReady);
  return {
    id: o.id,
    order_number: o.orderNumber,
    order_date: toISODate(o.orderDate),
    client_id: nullIfEmpty(o.clientId),
    designation: o.designation,
    quantity: o.quantity,
    priority: o.priority || null,
    display_order: o.displayOrder ?? null,
    frozen_order: o.frozenOrder ?? false,
    manual_sort_order: o.manualSortOrder ?? null,
    planned_deadline: toISODate(o.plannedDeadline),
    prototype_quantity: o.prototypeQuantity ?? null,
    prototype_deadline: toISODateOrNull(o.prototypeDeadline),
    delivery_deadline: toISODateOrNull(o.deliveryDeadline),
    complementary_quantity: o.complementaryQuantity ?? null,
    material_status,
    tooling_status,
    study_status,
    material_received_date: toISODateOrNull(o.materialReceivedDate),
    observation: o.observation || null,
    client_representative: o.clientRepresentative || null,
    instructions: o.instructions || null,
    drawing_model: o.drawingModel || null,
    notes_updated_at: o.notesUpdatedAt || null,
    category: o.category || 'fabrication',
    reintegrated_at: o.reintegratedAt || null,
    
    technical_complexity: o.technicalComplexity || null,
    sale_price_per_unit: o.salePricePerUnit ?? null,
  };
}

// ───────────────────── ProductionStep ─────────────────────

export function mapStepFromDB(row: any): ProductionStep {
  const studyStatus    = (row.study_status    || 'non-disponible') as ResourceStatus;
  const materialStatus = (row.material_status || 'non-disponible') as ResourceStatus;
  const toolingStatus  = (row.tooling_status  || 'non-disponible') as ResourceStatus;
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
    studyStatus,
    materialStatus,
    toolingStatus,
    studyReady: statusToBool(studyStatus),
    materialAvailable: statusToBool(materialStatus),
    toolingAvailable: statusToBool(toolingStatus),
    studyDeadline: row.study_deadline || undefined,
    materialDeadline: row.material_deadline || undefined,
    toolingDeadline: row.tooling_deadline || undefined,
    studyCompletedDate: row.study_completed_date || undefined,
    toolingReceivedDate: row.tooling_received_date || undefined,
    subcontractingDone: row.subcontracting_done ?? false,
    subcontractingInProgress: row.subcontracting_in_progress ?? false,
    subcontractingDeadline: row.subcontracting_deadline || undefined,
    subcontractingReceivedDate: row.subcontracting_received_date || undefined,
    subcontractingCost: row.subcontracting_cost != null ? Number(row.subcontracting_cost) : undefined,
    subcontractingMargin: row.subcontracting_margin ?? undefined,
    hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : undefined,
    specialToolingItems: ((row as any).special_tooling_items || []) as any,
    rawMaterialItems: ((row as any).raw_material_items || []) as any,
    rawMaterialNotApplicable: (row as any).raw_material_not_applicable ?? false,
    specialToolingNotApplicable: (row as any).special_tooling_not_applicable ?? false,
    stepNotes: row.step_notes || undefined,
    resourceNotes: row.resource_notes || undefined,
    planningOrder: row.planning_order ?? undefined,
    shiftStartedDate: row.shift_started_date || undefined,
    shiftEndedDate: row.shift_ended_date || undefined,
  };
}

export function mapStepToDB(s: ProductionStep) {
  const study_status    = s.studyStatus    ?? boolToStatus(s.studyReady ?? false);
  const material_status = s.materialStatus ?? boolToStatus(s.materialAvailable ?? false);
  const tooling_status  = s.toolingStatus  ?? boolToStatus(s.toolingAvailable ?? false);
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
    study_status,
    material_status,
    tooling_status,
    study_deadline: toISODateOrNull(s.studyDeadline),
    material_deadline: toISODateOrNull(s.materialDeadline),
    tooling_deadline: toISODateOrNull(s.toolingDeadline),
    study_completed_date: toISODateOrNull(s.studyCompletedDate),
    tooling_received_date: toISODateOrNull(s.toolingReceivedDate),
    subcontracting_done: s.subcontractingDone ?? false,
    subcontracting_in_progress: s.subcontractingInProgress ?? false,
    subcontracting_deadline: toISODateOrNull(s.subcontractingDeadline),
    subcontracting_received_date: toISODateOrNull(s.subcontractingReceivedDate),
    subcontracting_cost: s.subcontractingCost ?? null,
    subcontracting_margin: s.subcontractingMargin ?? null,
    hourly_rate: s.hourlyRate ?? null,
    special_tooling_items: (s.specialToolingItems || []) as any,
    raw_material_items: (s.rawMaterialItems || []) as any,
    raw_material_not_applicable: s.rawMaterialNotApplicable ?? false,
    special_tooling_not_applicable: s.specialToolingNotApplicable ?? false,
    step_notes: s.stepNotes ?? null,
    resource_notes: s.resourceNotes ?? null,
    planning_order: s.planningOrder ?? null,
    shift_started_date: toISODateOrNull(s.shiftStartedDate),
    shift_ended_date: toISODateOrNull(s.shiftEndedDate),
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
    workDate: row.work_date ? toISODate(row.work_date) : undefined,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : undefined,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : undefined,
    pauseMinutes: row.pause_minutes ?? undefined,
    pauseComment: row.pause_comment ?? undefined,
    workStatus: row.work_status || 'done',
    nonBillableHours: row.non_billable_hours != null ? Number(row.non_billable_hours) : 0,
    nonBillableReason: row.non_billable_reason ?? undefined,
    billableHours: row.billable_hours != null ? Number(row.billable_hours) : undefined,
    orderNumberSnapshot: row.order_number_snapshot ?? undefined,
    clientNameSnapshot: row.client_name_snapshot ?? undefined,
    designationSnapshot: row.designation_snapshot ?? undefined,
    quantitySnapshot: row.quantity_snapshot ?? undefined,
    operationNameSnapshot: row.operation_name_snapshot ?? undefined,
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
    work_date: r.workDate ?? null,
    start_time: r.startTime ?? null,
    end_time: r.endTime ?? null,
    pause_minutes: r.pauseMinutes ?? null,
    pause_comment: r.pauseComment ?? null,
    work_status: r.workStatus || 'done',
    non_billable_hours: r.nonBillableHours ?? 0,
    non_billable_reason: r.nonBillableReason ?? null,
    order_number_snapshot: r.orderNumberSnapshot ?? null,
    client_name_snapshot: r.clientNameSnapshot ?? null,
    designation_snapshot: r.designationSnapshot ?? null,
    quantity_snapshot: r.quantitySnapshot ?? null,
    operation_name_snapshot: r.operationNameSnapshot ?? null,
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
    controlledQty: row.controlled_qty ?? undefined,
    acceptedQty: row.accepted_qty ?? undefined,
    rejectedQty: row.rejected_qty ?? undefined,
    pendingQty: row.pending_qty ?? undefined,
    forceClosed: !!row.force_closed,
  };
}

export function mapQCEntryToDB(e: QualityControlEntry) {
  return {
    id: e.id,
    order_id: e.orderId,
    control_date: toISODate(e.controlDate),
    decision: e.decision || null,
    rework_notes: e.reworkNotes || null,
    controlled_qty: e.controlledQty ?? null,
    accepted_qty: e.acceptedQty ?? null,
    rejected_qty: e.rejectedQty ?? null,
    pending_qty: e.pendingQty ?? null,
    force_closed: !!e.forceClosed,
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
    deliveredQty: row.delivered_qty ?? undefined,
    forceClosed: !!row.force_closed,
  };
}

export function mapDeliveryToDB(e: DeliveryEntry) {
  return {
    id: e.id,
    order_id: e.orderId,
    control_date: toISODate(e.controlDate),
    decision: e.decision,
    moved_at: e.movedAt || new Date().toISOString(),
    delivered_qty: e.deliveredQty ?? null,
    force_closed: !!e.forceClosed,
  };
}

// ───────────────────── DeliveredOrder ─────────────────────

export function mapDeliveredOrderFromDB(row: any): DeliveredOrder {
  return {
    id: row.id,
    orderId: row.order_id,
    deliveryDate: row.delivery_date || '',
    salePriceStatus: (row.sale_price_status || 'non-calcule') as SalePriceStatus,
    observation: row.observation || undefined,
    invoiceNumber: row.invoice_number || undefined,
    invoiceDate: row.invoice_date || undefined,
    createdAt: row.created_at || undefined,
    deliveredQty: row.delivered_qty ?? undefined,
    forceClosed: !!row.force_closed,
  };
}

export function mapDeliveredOrderToDB(d: DeliveredOrder) {
  return {
    id: d.id,
    order_id: d.orderId,
    delivery_date: toISODate(d.deliveryDate),
    sale_price_status: d.salePriceStatus,
    observation: d.observation || null,
    invoice_number: d.invoiceNumber || null,
    invoice_date: d.invoiceDate ? toISODate(d.invoiceDate) : null,
    delivered_qty: d.deliveredQty ?? null,
    force_closed: !!d.forceClosed,
  };
}


// ───────────────────── CancelledOrder ─────────────────────

export function mapCancelledOrderFromDB(row: any): CancelledOrder {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumberSnapshot: row.order_number_snapshot,
    clientNameSnapshot: row.client_name_snapshot || undefined,
    designationSnapshot: row.designation_snapshot,
    quantitySnapshot: row.quantity_snapshot ?? 1,
    orderDateSnapshot: row.order_date_snapshot || undefined,
    cancelDate: row.cancel_date || '',
    reason: row.reason,
    note: row.note || undefined,
  };
}

export function mapCancelledOrderToDB(c: CancelledOrder) {
  return {
    id: c.id,
    order_id: c.orderId,
    order_number_snapshot: c.orderNumberSnapshot,
    client_name_snapshot: c.clientNameSnapshot || null,
    designation_snapshot: c.designationSnapshot,
    quantity_snapshot: c.quantitySnapshot,
    order_date_snapshot: toISODateOrNull(c.orderDateSnapshot),
    cancel_date: toISODate(c.cancelDate),
    reason: c.reason,
    note: c.note || null,
  };
}

/**
 * ⚠️ RÈGLE PROJET PERMANENTE — PAGINATION SUPABASE OBLIGATOIRE ⚠️
 *
 * Toute requête `supabase.from(...).select(...)` sur une table qui peut atteindre, dépasser
 * ou approcher 1000 lignes DOIT passer par `fetchAllPaginated`. Ne jamais utiliser `.range()`
 * seul, `.limit(n)` arbitraire, ni une requête sans pagination explicite : PostgREST applique
 * un plafond serveur (`max-rows`, défaut 1000) qui tronque silencieusement le résultat et
 * fait disparaître les lignes les plus anciennes/récentes selon le `.order()`.
 *
 * Tables actuellement concernées en priorité (volumes au 24/06/2026) :
 *   - production_records       (1026 — dépassée)
 *   - orders                   (1013 — dépassée)
 *   - quality_control_entries  (967  — critique)
 *   - production_steps         (956  — critique)
 *   - delivered_orders         (714  — sous surveillance)
 *   - clients                  (127  — surveillance long terme)
 *
 * Tables actuellement à faible volume (operators, equipments, subcontractors, holidays,
 * operations, profiles, rights_catalog, user_rights, audit_log, delivery_entries) :
 * la règle reste valable dès que leur volume approche 1000 lignes.
 *
 * Cette règle s'applique à tout nouveau code dans `supabase-data.ts` ET dans les pages
 * (cf. PlanningTableauPage qui charge `production_steps` directement).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * Fetch all rows from a Supabase SELECT, bypassing the PostgREST max-rows server cap (default 1000).
 * The caller provides a `builder` factory that returns a fresh query builder (already configured
 * with `.select(...).order(...).eq(...)` etc., but WITHOUT `.range()`/`.limit()`). This helper
 * then iterates with `.range(from, from+pageSize-1)` until a short page is returned.
 *
 * Safety cap at 100 000 rows to prevent runaway loops on misconfigured callers.
 */
async function fetchAllPaginated<T = any>(
  label: string,
  builder: () => any,
  pageSize: number = 1000,
): Promise<T[]> {
  const all: T[] = [];
  const HARD_CAP = 100_000;
  let from = 0;
  while (from < HARD_CAP) {
    const to = from + pageSize - 1;
    const { data, error } = await builder().range(from, to);
    if (error) {
      console.error(`[fetchAllPaginated] ${label} failed at range ${from}-${to}:`, error);
      throw error;
    }
    const page = (data || []) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function fetchAllData() {
  // Fetch everything in parallel. The `orders` array is returned raw — pages that need
  // to exclude delivered/cancelled orders apply their own local filter (cf. PlanningTableauPage
  // `activeOrders` memo). This keeps delivered/cancelled orders available for lookup
  // (delivered orders register, production records history, F176/26-style references…).
  //
  // IMPORTANT: tables that may exceed 1000 rows are fetched with `fetchAllPaginated` to
  // bypass the PostgREST max-rows server cap (default 1000). A bare `.range(0, 9999)` does
  // NOT bypass that cap — it silently truncates. Cf. bug F173/26 (26/06/2026).
  const [
    { data: equipments },
    { data: operators },
    { data: subcontractors },
    { data: operations },
    { data: clients },
    orders,
    steps,
    { data: holidays },
    records,
    qcEntries,
    { data: deliveryEntries },
    deliveredOrders,
    cancelledOrders,
  ] = await Promise.all([
    supabase.from('equipments').select('*'),
    supabase.from('operators').select('*'),
    supabase.from('subcontractors').select('*'),
    supabase.from('operations').select('*'),
    supabase.from('clients').select('*'),
    fetchAllPaginated<any>('orders', () =>
      supabase.from('orders').select('*').order('created_at', { ascending: false })
    ),
    fetchAllPaginated<any>('production_steps', () =>
      supabase.from('production_steps').select('*')
        .order('order_id', { ascending: true })
        .order('step_order', { ascending: true })
        .order('created_at', { ascending: true })
    ),
    supabase.from('holidays').select('*'),
    fetchAllPaginated<any>('production_records', () =>
      supabase.from('production_records').select('*').order('created_at', { ascending: false })
    ),
    fetchAllPaginated<any>('quality_control_entries', () =>
      supabase.from('quality_control_entries').select('*').order('created_at', { ascending: false })
    ),
    supabase.from('delivery_entries').select('*').order('created_at', { ascending: false }).range(0, 9999),
    fetchAllPaginated<any>('delivered_orders', () =>
      (supabase.from as any)('delivered_orders').select('*').order('id', { ascending: true })
    ),
    fetchAllPaginated<any>('cancelled_orders', () =>
      (supabase.from as any)('cancelled_orders').select('*').order('id', { ascending: true })
    ),
  ]);


  return {
    equipments: (equipments || []).map(mapEquipmentFromDB),
    operators: (operators || []).map(mapOperatorFromDB),
    subcontractors: (subcontractors || []).map(mapSubcontractorFromDB),
    operations: (operations || []).map(mapOperationFromDB),
    clients: (clients || []).map(mapClientFromDB),
    orders: (orders || []).map(mapOrderFromDB),
    steps: (steps || []).map(mapStepFromDB).sort((a, b) => {
      if (a.orderId !== b.orderId) return a.orderId < b.orderId ? -1 : 1;
      if ((a.order ?? 0) !== (b.order ?? 0)) return (a.order ?? 0) - (b.order ?? 0);
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    }),
    holidays: (holidays || []).map(mapHolidayFromDB),
    productionRecords: (records || []).map(mapRecordFromDB),
    qcEntries: (qcEntries || []).map(mapQCEntryFromDB),
    deliveryEntries: (deliveryEntries || []).map(mapDeliveryFromDB),
    deliveredOrders: (deliveredOrders || []).map(mapDeliveredOrderFromDB),
    cancelledOrders: (cancelledOrders || []).map(mapCancelledOrderFromDB),
  };
}


// ───────────────────── DB CRUD (fire-and-forget) ─────────────────────

function logError(entity: string, action: string, error: any) {
  const details = error
    ? `${error.message || ''}${error.code ? ` [code=${error.code}]` : ''}${error.details ? ` details=${error.details}` : ''}${error.hint ? ` hint=${error.hint}` : ''}`
    : 'unknown error';
  console.error(`[DB] Failed to ${action} ${entity}:`, error, details);
  try {
    toast.error(`Échec ${action} ${entity}`, { description: details || 'Erreur base de données' });
  } catch {
    // toast not available in non-UI context
  }
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
  return !error;
}
export async function dbUpdateOrder(o: Order) {
  const { error } = await supabase.from('orders').update(mapOrderToDB(o)).eq('id', o.id);
  if (error) logError('order', 'update', error);
  return !error;
}
export async function dbDeleteOrder(id: string) {
  // Hard delete: remove all dependent rows so the order_number is fully released
  // and can be reused immediately by another order.
  await Promise.all([
    supabase.from('production_records').delete().eq('order_id', id),
    supabase.from('production_steps').delete().eq('order_id', id),
    supabase.from('quality_control_entries').delete().eq('order_id', id),
    supabase.from('delivery_entries').delete().eq('order_id', id),
    supabase.from('delivered_orders').delete().eq('order_id', id),
    supabase.from('cancelled_orders').delete().eq('order_id', id),
  ]);
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) logError('order', 'delete', error);
}
export async function dbBulkUpdateOrders(orders: Order[]) {
  // Use upsert for bulk operations
  const mapped = orders.map(mapOrderToDB);
  const { error } = await supabase.from('orders').upsert(mapped);
  if (error) logError('orders', 'bulk update', error);
  return !error;
}

// Step
export async function dbInsertStep(s: ProductionStep, absenceOpId?: string, absenceOrderId?: string) {
  // Guard: never insert an Absence operation linked to a real order
  if (absenceOpId && s.operationId === absenceOpId && absenceOrderId && s.orderId !== absenceOrderId) {
    console.warn('[DB] Blocked insertion of Absence step linked to real order:', s.orderId);
    return;
  }
  const mapped = mapStepToDB(s);
  // Use UPSERT (not plain INSERT) so reused IDs from rescheduling don't crash
  // with a duplicate-key error (which previously caused step data loss / the
  // dreaded "duration → 0h00 + wrong order" bug on F101/26).
  const { error } = await supabase.from('production_steps').upsert(mapped, { onConflict: 'id' });
  if (error) logError('step', 'upsert', error);
  return !error;
}
export async function dbUpdateStep(s: ProductionStep) {
  const { error } = await supabase.from('production_steps').update(mapStepToDB(s)).eq('id', s.id);
  if (error) logError('step', 'update', error);
  return !error;
}
export async function dbDeleteStep(id: string) {
  const { error } = await supabase.from('production_steps').delete().eq('id', id);
  if (error) logError('step', 'delete', error);
  return !error;
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
export async function dbUpdateRecord(r: ProductionRecord) {
  const { error } = await supabase.from('production_records').update(mapRecordToDB(r)).eq('id', r.id);
  if (error) logError('record', 'update', error);
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

// Delivery Entry — multiple sessions per order are now allowed (partial deliveries).
export async function dbInsertDelivery(e: DeliveryEntry) {
  const { error } = await supabase
    .from('delivery_entries')
    .insert(mapDeliveryToDB(e));
  if (error) logError('delivery', 'insert', error);
}
export async function dbUpdateDelivery(e: DeliveryEntry) {
  const { error } = await supabase
    .from('delivery_entries')
    .update(mapDeliveryToDB(e))
    .eq('id', e.id);
  if (error) logError('delivery', 'update', error);
}
export async function dbDeleteDelivery(id: string) {
  const { error } = await supabase.from('delivery_entries').delete().eq('id', id);
  if (error) logError('delivery', 'delete', error);
}


// Delivered Orders (archive)
export async function dbInsertDeliveredOrder(d: DeliveredOrder) {
  const { error } = await (supabase.from as any)('delivered_orders').insert(mapDeliveredOrderToDB(d));
  if (error) logError('delivered_order', 'insert', error);
}
export async function dbUpdateDeliveredOrder(d: DeliveredOrder) {
  const { error } = await (supabase.from as any)('delivered_orders').update(mapDeliveredOrderToDB(d)).eq('id', d.id);
  if (error) logError('delivered_order', 'update', error);
}
export async function dbDeleteDeliveredOrder(id: string) {
  const { error } = await (supabase.from as any)('delivered_orders').delete().eq('id', id);
  if (error) logError('delivered_order', 'delete', error);
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
    materialStatus: 'non-applicable',
    toolingStatus: 'non-applicable',
    studyStatus: 'non-applicable',
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
  // Filter out any corrupted absence steps linked to real orders
  const absOp = data.operations.find(o => o.name === 'Absence');
  const absOrder = data.orders.find(o => o.orderNumber === 'ABS');
  const cleanSteps = absOp && absOrder
    ? data.steps.filter(s => !(s.operationId === absOp.id && s.orderId !== absOrder.id))
    : data.steps;
  if (cleanSteps.length > 0) {
    const { error } = await supabase.from('production_steps').upsert(cleanSteps.map(mapStepToDB));
    if (error) logError('steps', 'sync', error); else console.log(`[Sync] Steps: ${cleanSteps.length}`);
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

// Cancelled Orders
export async function dbInsertCancelledOrder(c: CancelledOrder) {
  const { error } = await (supabase.from as any)('cancelled_orders').insert(mapCancelledOrderToDB(c));
  if (error) logError('cancelled_order', 'insert', error);
  return !error;
}
export async function dbUpdateCancelledOrder(c: CancelledOrder) {
  const { error } = await (supabase.from as any)('cancelled_orders').update(mapCancelledOrderToDB(c)).eq('id', c.id);
  if (error) logError('cancelled_order', 'update', error);
  return !error;
}
export async function dbDeleteCancelledOrder(id: string) {
  const { error } = await (supabase.from as any)('cancelled_orders').delete().eq('id', id);
  if (error) logError('cancelled_order', 'delete', error);
}
