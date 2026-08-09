// Types for the workshop planning application

export type EquipmentState = 'En marche' | 'Mode dégradé' | 'Maintenance/réparation' | 'En panne';

export type EquipmentType =
  | 'Fraiseuse conventionnelle' | 'Tour conventionnel' | 'Tour CNC'
  | 'Rectifieuse plane' | 'Rectifieuse cylindrique' | 'Étau limeur'
  | 'Perceuse à colonne' | 'Four' | 'Touret' | 'Scie mécanique'
  | 'Scie circulaire' | 'Autres (Visseuse, meuleuse, perceuse, ...)'
  | 'Plateau diviseur' | 'Plateau circulaire' | 'Tête taraudeuse';

export interface Equipment {
  id: string;
  designation: string;
  type: EquipmentType;
  capacity: string;
  state: EquipmentState;
}

export interface Operator {
  id: string;
  name: string;
  mainFunction: string;
  secondaryFunctions: string[];
  mainEquipment?: string;
  secondaryEquipments?: string[];
}

export interface Representative {
  id: string;
  name: string;
  phones: string[];
  /** @deprecated removed from UI — kept optional for backward compatibility with legacy data */
  addresses?: string[];
  emails: string[];
}

export interface Subcontractor {
  id: string;
  companyName: string;
  mainActivity: string;
  secondaryActivities: string[];
  representatives?: Representative[];
  phones?: string[];
  addresses?: string[];
  addressDetails?: AddressDetail[];
  emails?: string[];
}

export type OperationCategory = 'operator' | 'subcontractor';

export interface Operation {
  id: string;
  name: string;
  category: OperationCategory;
}

export type ClientClass = 'A' | 'B' | 'C' | 'D' | 'E';

export type AddressNature = 'مصنع' | 'ملحقة' | 'ورشة' | 'إدارة' | 'مخزن';

export interface AddressDetail {
  nature?: AddressNature | '';
  gps?: string;
}

export interface Client {
  id: string;
  name: string;
  clientClass?: ClientClass;
  activity?: string;
  representatives?: Representative[];
  phones?: string[];
  addresses?: string[];
  addressDetails?: AddressDetail[];
  emails?: string[];
}

export type OrderPriority = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'undetermined';

export type OrderCategory = 'fabrication' | 'prestation' | 'divers' | 'slamani';

export const ORDER_CATEGORY_PREFIX: Record<OrderCategory, string> = {
  fabrication: 'F',
  prestation: 'P',
  divers: '',
  slamani: 'S',
};

export const ORDER_CATEGORY_LABEL: Record<OrderCategory, string> = {
  fabrication: 'Fabrications',
  prestation: 'Prestations',
  divers: 'Divers',
  slamani: 'SLAMANI',
};

export type ResourceStatus = 'disponible' | 'non-disponible' | 'partiel' | 'non-applicable';

/** A single resource line (raw material or special tooling) with its own availability status. */
export interface ResourceItem {
  id: string;
  label: string;
  status: ResourceStatus;
}

// Helper: legacy boolean view of a 4-state status (true only when "disponible")
export const statusToBool = (s: ResourceStatus | undefined): boolean => s === 'disponible';
export const boolToStatus = (b: boolean | undefined): ResourceStatus => (b ? 'disponible' : 'non-disponible');

export interface Order {
  id: string;
  orderNumber: string;
  orderDate: string;
  clientId: string;
  designation: string;
  quantity: number;
  priority?: OrderPriority;
  displayOrder?: number;
  frozenOrder?: boolean;
  manualSortOrder?: number;
  plannedDeadline: string;
  prototypeQuantity?: number;
  prototypeDeadline?: string;
  deliveryDeadline?: string;
  complementaryQuantity?: number;
  materialAvailable: boolean;
  toolingAvailable: boolean;
  studyReady: boolean;
  /** 4-state status — authoritative source. Booleans above are derived (true ⇔ "disponible"). */
  materialStatus: ResourceStatus;
  toolingStatus: ResourceStatus;
  studyStatus: ResourceStatus;
  materialReceivedDate?: string;
  observation?: string;
  clientRepresentative?: string;
  instructions?: string;
  drawingModel?: string;
  notesUpdatedAt?: string; // ISO timestamp of last observation change
  
  category?: OrderCategory;
  /** ISO timestamp set when the order was reintegrated from QC/Delivery/Delivered. Persistent — survives observation edits. */
  reintegratedAt?: string;
  /** Technical complexity level: level1..level4 */
  technicalComplexity?: 'level1' | 'level2' | 'level3' | 'level4';
}

export interface ProductionStep {
  id: string;
  orderId: string;
  operatorId: string;
  subcontractorId?: string;
  operationId: string;
  estimatedDuration: number; // in minutes
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  dependsOn?: string; // ID of another step
  dependsOnPercentage?: number; // 0-100: % of predecessor that must complete before this can start
  order: number; // chronological order
  frozen?: boolean; // true if manually placed – excluded from auto-scheduling
  equipmentIds?: string[]; // required equipment for this step
  studyReady?: boolean; // step-level: study done (derived from studyStatus)
  materialAvailable?: boolean; // step-level: material available (derived from materialStatus)
  toolingAvailable?: boolean; // step-level: tooling available (derived from toolingStatus)
  /** 4-state status — authoritative for steps too */
  studyStatus?: ResourceStatus;
  materialStatus?: ResourceStatus;
  toolingStatus?: ResourceStatus;
  studyDeadline?: string; // expected date for study completion
  materialDeadline?: string; // expected date for material purchase
  toolingDeadline?: string; // expected date for tooling purchase
  studyCompletedDate?: string; // manually entered completion date
  toolingReceivedDate?: string; // manually entered receipt date
  // Subcontracting tracking (in-memory only — persisted via production_records validation)
  subcontractingDone?: boolean;
  /** True when subcontracting is in progress (intermediate state — exclusive with subcontractingDone). */
  subcontractingInProgress?: boolean;
  subcontractingDeadline?: string;
  subcontractingReceivedDate?: string;
  specialToolingNeeds?: string[];
  rawMaterialNeeds?: string[];
  /** Notes / instructions on the step (planning steps tab) */
  stepNotes?: string;
  /** Notes / instructions on the resources of the step (resources tab) */
  resourceNotes?: string;
  /** Pn — numéro d'ordre propre à chaque opérateur dans le planning */
  planningOrder?: number;
  shiftStartedDate?: string; // ISO date — posé par بداية دوام / تبديل الشغل
  shiftEndedDate?: string; // ISO date — posé par نهاية دوام
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface ProductionRecord {
  id: string;
  stepId: string;
  orderId: string;
  operatorId: string;
  operationId: string;
  actualDuration: number; // in minutes
  validatedAt: string; // ISO date-time (system timestamp)
  workDate?: string; // ISO date (YYYY-MM-DD) — date des travaux saisie par l'utilisateur
  startTime?: string; // HH:mm
  endTime?: string;   // HH:mm
  pauseMinutes?: number;
  pauseComment?: string;
  workStatus?: 'done' | 'continue';
  // Snapshots — preserved even if the source order is deleted later
  orderNumberSnapshot?: string;
  clientNameSnapshot?: string;
  designationSnapshot?: string;
  quantitySnapshot?: number;
  operationNameSnapshot?: string;
}

export type GanttView = 'day' | 'week' | 'month';

export type QCDecision = 'conforme' | 'reprise-retouche' | 'conforme-derogation' | 'non-conforme';

export interface QualityControlEntry {
  id: string;
  orderId: string;
  controlDate: string; // manually entered
  decision?: QCDecision;
  reworkNotes?: string; // notes for reprise/retouche
  createdAt: string;
  /** Quantity controlled during this session. NULL → legacy "covers full order". */
  controlledQty?: number;
  /** Quantity accepted (conforme) — only this qty is forwarded to delivery. */
  acceptedQty?: number;
  /** Quantity rejected (controlledQty − acceptedQty), kept for traceability. */
  rejectedQty?: number;
  /** Quantity sent partially to QC and awaiting a control decision. */
  pendingQty?: number;
  /** Administrator override: closes the QC as fully done even if remaining > 0. */
  forceClosed?: boolean;
}

export interface DeliveryEntry {
  id: string;
  orderId: string;
  controlDate: string;
  decision: 'conforme' | 'conforme-derogation';
  movedAt: string;
  /** Quantity ready to deliver in this session. NULL → legacy "covers full order". */
  deliveredQty?: number;
  forceClosed?: boolean;
}

export type SalePriceStatus = 'gratuit' | 'non-calcule' | 'non-valide' | 'valide';

export interface DeliveredOrder {
  id: string;
  orderId: string;
  deliveryDate: string;
  salePriceStatus: SalePriceStatus;
  observation?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  createdAt?: string;
  /** Quantity delivered in this session. NULL → legacy "covers full order". */
  deliveredQty?: number;
  forceClosed?: boolean;
}


export interface CancelledOrder {
  id: string;
  orderId: string;
  orderNumberSnapshot: string;
  clientNameSnapshot?: string;
  designationSnapshot: string;
  quantitySnapshot: number;
  orderDateSnapshot?: string;
  cancelDate: string;
  reason: string;
  note?: string;
}
