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
  operationId: string;
  estimatedDuration: number; // in minutes
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  dependsOn?: string; // ID of another step
  order: number; // chronological order
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export type GanttView = 'day' | 'week' | 'month';
