import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format an ISO date string (yyyy-mm-dd) to French format dd/mm/yyyy */
export function formatDateFR(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Format an ISO datetime to local "dd/mm/yyyy à HH:mm" */
export function formatDateTimeFR(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} à ${hh}:${mi}`;
}

/** Formate un montant en "5 600.00 DZD" (séparateur de milliers = espace, décimales = point) */
export function formatDZD(amount: number | undefined | null): string {
  const n = Number(amount) || 0;
  const [intPart, decPart] = n.toFixed(2).split('.');
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${withSpaces}.${decPart} DZD`;
}

/** Formate un montant en "5 000.00 دج" (تكلفة ساعية للعمليات) */
export function formatDA(amount: number | undefined | null): string {
  const n = Number(amount) || 0;
  const [intPart, decPart] = n.toFixed(2).split('.');
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `\u2066${withSpaces}.${decPart} دج\u2069`;
}
/** Formate un nombre d'heures décimal (2.5) en "02:30" pour affichage lisible */
export function formatHoursHHMM(decimalHours: number | undefined | null): string {
  const h = Number(decimalHours) || 0;
  const totalMinutes = Math.round(h * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
