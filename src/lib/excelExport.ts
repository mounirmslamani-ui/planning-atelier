import * as XLSX from 'xlsx';

type ExcelRow = Record<string, string | number | boolean | null | undefined>;

const getExportTimestamp = () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year}_${hours}:${minutes}`;
};

export const exportTableToExcel = (tableName: string, rows: ExcelRow[], columnWidths?: number[]) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  if (columnWidths) ws['!cols'] = columnWidths.map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, tableName.slice(0, 31));
  XLSX.writeFile(wb, `${tableName}.${getExportTimestamp()}.xlsx`);
};