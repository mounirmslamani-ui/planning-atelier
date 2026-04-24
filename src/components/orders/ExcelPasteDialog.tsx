import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClipboardPaste, AlertCircle } from 'lucide-react';
import type { Order, OrderPriority } from '@/types/planning';
import PriorityBadge from '@/components/orders/PriorityBadge';

interface ExcelPasteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (orders: Omit<Order, 'id'>[]) => void;
  clients: { id: string; name: string }[];
  nextDisplayOrder: number;
  existingOrderNumbers: string[];
}

const EXPECTED_COLUMNS = ['N° Commande', 'التاريخ', 'الزبون', 'التعيين', 'الكمية', 'الأولوية', 'أجل التسليم'];

const parsePriority = (val: string): OrderPriority | undefined => {
  const lower = val.toLowerCase().trim();
  if (!lower) return undefined;
  if (lower.includes('قصوى') || lower === 'p1' || lower === 'critical') return 'P1';
  if (lower.includes('نسبيا') || lower === 'p2' || lower === 'moderate') return 'P2';
  if (lower.includes('تعليق') || lower === 'p4' || lower === 'pending') return 'P4';
  if (lower.includes('غير مستعجل') || lower === 'p3' || lower === 'normal') return 'P3';
  return undefined;
};

const normalizeOrderNumber = (value: string) => value.trim().toLowerCase();

const ExcelPasteDialog: React.FC<ExcelPasteDialogProps> = ({ open, onOpenChange, onImport, clients, nextDisplayOrder, existingOrderNumbers }) => {
  const [rawText, setRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [step, setStep] = useState<'paste' | 'preview'>('paste');
  const [duplicateMessage, setDuplicateMessage] = useState('');

  const getDuplicateNumbers = (rows: string[][]) => {
    const existing = new Set(existingOrderNumbers.map(normalizeOrderNumber).filter(Boolean));
    const counts = new Map<string, number>();
    const duplicates = new Set<string>();
    rows.forEach(row => {
      const raw = row[0] || '';
      const normalized = normalizeOrderNumber(raw);
      if (!normalized) return;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    });
    rows.forEach(row => {
      const raw = row[0] || '';
      const normalized = normalizeOrderNumber(raw);
      if (normalized && (existing.has(normalized) || (counts.get(normalized) || 0) > 1)) duplicates.add(raw.trim());
    });
    return duplicates;
  };

  const handleParse = () => {
    const lines = rawText.trim().split('\n').filter(l => l.trim());
    let rows = lines.map(line => line.split('\t').map(cell => cell.trim()));
    const first = rows[0];
    const isHeader = first && first.some(c =>
      EXPECTED_COLUMNS.some(col => c.toLowerCase().includes(col.toLowerCase().substring(0, 4)))
    );
    if (isHeader) rows = rows.slice(1);
    const firstCols = rows.map(r => r[0]);
    const allNumeric = firstCols.length > 0 && firstCols.every(c => /^\d+$/.test(c));
    if (allNumeric) {
      rows = rows.map(r => r.slice(1));
    }
    rows = rows.map(r => {
      let end = r.length;
      while (end > 0 && r[end - 1] === '') end--;
      return r.slice(0, Math.max(end, EXPECTED_COLUMNS.length));
    });
    setParsedRows(rows);
    const duplicates = getDuplicateNumbers(rows);
    setDuplicateMessage(duplicates.size > 0 ? `Erreur : Ce numéro de commande existe déjà. Veuillez utiliser un identifiant unique. Numéros rejetés : ${Array.from(duplicates).join(', ')}` : '');
    setStep('preview');
  };

  const handleImport = () => {
    const duplicates = getDuplicateNumbers(parsedRows);
    const validRows = parsedRows.filter(row => !duplicates.has((row[0] || '').trim()));
    if (duplicates.size > 0) {
      setDuplicateMessage(`Erreur : Ce numéro de commande existe déjà. Veuillez utiliser un identifiant unique. Numéros rejetés : ${Array.from(duplicates).join(', ')}`);
    }
    const orders: Omit<Order, 'id'>[] = validRows.map((row, i) => {
      const clientName = row[2] || '';
      const matchedClient = clients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
      return {
        orderNumber: row[0] || '',
        orderDate: row[1] || new Date().toISOString().split('T')[0],
        clientId: matchedClient?.id || '',
        designation: row[3] || '',
        quantity: parseInt(row[4]) || 1,
        priority: parsePriority(row[5] || ''),
        plannedDeadline: row[6] || '',
        materialAvailable: false,
        toolingAvailable: false,
        studyReady: false,
        materialStatus: 'non-disponible',
        toolingStatus: 'non-disponible',
        studyStatus: 'non-disponible',
        displayOrder: nextDisplayOrder + i,
      };
    });
    if (orders.length > 0) onImport(orders);
    if (duplicates.size > 0) {
      setParsedRows(parsedRows.filter(row => duplicates.has((row[0] || '').trim())));
      return;
    }
    setRawText('');
    setParsedRows([]);
    setStep('paste');
    onOpenChange(false);
  };

  const handleClose = () => {
    setRawText('');
    setParsedRows([]);
    setStep('paste');
    setDuplicateMessage('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <ClipboardPaste className="w-5 h-5" /> Importer depuis Excel
          </DialogTitle>
          <DialogDescription>
            Copiez les lignes depuis Excel et collez-les ci-dessous. Colonnes attendues : {EXPECTED_COLUMNS.join(' | ')}
          </DialogDescription>
        </DialogHeader>

        {step === 'paste' && (
          <div className="space-y-4">
            <Textarea
              placeholder="Collez ici les données copiées depuis Excel (séparées par tabulations)..."
              className="min-h-[200px] font-mono text-xs"
              value={rawText}
              onChange={e => setRawText(e.target.value)}
            />
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Sélectionnez les lignes dans Excel (sans l'en-tête ou avec), copiez (Ctrl+C) puis collez (Ctrl+V) dans la zone ci-dessus.</span>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            {duplicateMessage && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {duplicateMessage}
              </div>
            )}
            <p className="text-sm text-muted-foreground">{parsedRows.length} ligne(s) détectée(s). Vérifiez avant d'importer :</p>
            <div className="border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {EXPECTED_COLUMNS.map(col => (
                      <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, i) => (
                    <TableRow key={i}>
                      {EXPECTED_COLUMNS.map((_, j) => (
                        <TableCell key={j} className="text-xs py-1.5">
                          {j === 5 ? <PriorityBadge priority={parsePriority(row[j] || '')} /> : row[j] || '—'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'preview' && (
            <Button variant="outline" onClick={() => setStep('paste')}>Retour</Button>
          )}
          <Button variant="outline" onClick={handleClose}>Annuler</Button>
          {step === 'paste' ? (
            <Button onClick={handleParse} disabled={!rawText.trim()}>Aperçu</Button>
          ) : (
            <Button onClick={handleImport} disabled={parsedRows.length === 0}>
              Importer {parsedRows.length} commande(s)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExcelPasteDialog;
