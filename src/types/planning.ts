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

export interface Subcontractor {
  id: string;
  companyName: string;
  mainActivity: string;
  secondaryActivities: string[];
}

export type OperationCategory = 'operator' | 'subcontractor';

export interface Operation {
  id: string;
  name: string;
  category: OperationCategory;
}

export type ClientClass = 'A' | 'B' | 'C' | 'D' | 'E';

export interface Client {
  id: string;
  name: string;
  clientClass?: ClientClass;
}

export type OrderPriority = 'P1' | 'P2' | 'P3' | 'P4';

export interface Order {
  id: string;
  orderNumber: string;
  orderDate: string;
  clientId: string;
  designation: string;
  quantity: number;
  priority: OrderPriority;
  displayOrder?: number;
  frozenOrder?: boolean;
  plannedDeadline: string;
  prototypeQuantity?: number;
  prototypeDeadline?: string;
  deliveryDeadline?: string;
  complementaryQuantity?: number;
  materialAvailable: boolean;
  toolingAvailable: boolean;
  studyReady: boolean;
  observation?: string;
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
  subcontractingDone?: boolean; // true when subcontracting is completed
  subcontractingDeadline?: string; // deadline for subcontracting (date string)
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
  validatedAt: string; // ISO date-time
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
}

export interface DeliveryEntry {
  id: string;
  orderId: string;
  controlDate: string;
  decision: 'conforme' | 'conforme-derogation';
  movedAt: string;
}
