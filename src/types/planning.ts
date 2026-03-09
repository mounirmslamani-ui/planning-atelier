// Types for the workshop planning application

export interface Operator {
  id: string;
  name: string;
  mainFunction: string;
  secondaryFunctions: string[];
}

export interface Subcontractor {
  id: string;
  companyName: string;
  mainActivity: string;
  secondaryActivities: string[];
}

export interface Operation {
  id: string;
  name: string;
}

export type ClientClass = 'A' | 'B' | 'C' | 'D' | 'E';

export interface Client {
  id: string;
  name: string;
  clientClass?: ClientClass;
}

export type UrgencyLevel = 'urgent' | 'moderate' | 'normal' | 'not-urgent';

export type OrderPriority = 
  | 'P1-A' | 'P1-B' | 'P1-C' 
  | 'P2-A' | 'P2-B' | 'P2-C' 
  | 'P3-A' | 'P3-B';

export interface Order {
  id: string;
  orderNumber: string;
  orderDate: string;
  clientId: string;
  designation: string;
  quantity: number;
  urgency: UrgencyLevel;
  priority?: OrderPriority;
  displayOrder?: number;
  plannedDeadline: string;
  prototypeQuantity?: number;
  prototypeDeadline?: string;
  deliveryDeadline?: string;
  complementaryQuantity?: number;
  materialAvailable: boolean;
  toolingAvailable: boolean;
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
