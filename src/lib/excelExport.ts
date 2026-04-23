import * as XLSX from 'xlsx';

export type ExcelRow = Record<string, string | number | boolean | null | undefined>;

type ExcelSheet = {
  name: string;
  rows: ExcelRow[];
  columnWidths?: number[];
};

export const getExportFilename = (tableName: string) => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${tableName} ${day}.${month}.${year} à ${hours}h${minutes}.xlsx`;
};

export const exportTableToExcel = (tableName: string, rows: ExcelRow[], columnWidths?: number[]) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  if (columnWidths) ws['!cols'] = columnWidths.map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, tableName.slice(0, 31));
  XLSX.writeFile(wb, getExportFilename(tableName));
};

const getSafeSheetName = (name: string, usedNames: Set<string>) => {
  const sanitized = (name || 'Feuille').replace(/[\\/?*[\]:]/g, ' ').trim() || 'Feuille';
  let candidate = sanitized.slice(0, 31);
  let index = 2;

  while (usedNames.has(candidate)) {
    const suffix = ` (${index})`;
    candidate = `${sanitized.slice(0, 31 - suffix.length)}${suffix}`;
    index += 1;
  }

  usedNames.add(candidate);
  return candidate;
};

export const exportSheetsToExcel = (tableName: string, sheets: ExcelSheet[]) => {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  sheets.forEach(sheet => {
    const ws = XLSX.utils.json_to_sheet(sheet.rows.length > 0 ? sheet.rows : [{}]);
    if (sheet.columnWidths) ws['!cols'] = sheet.columnWidths.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, getSafeSheetName(sheet.name, usedNames));
  });

  XLSX.writeFile(wb, getExportFilename(tableName));
};