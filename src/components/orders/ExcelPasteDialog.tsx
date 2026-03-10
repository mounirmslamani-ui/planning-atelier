import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClipboardPaste, AlertCircle } from 'lucide-react';
import type { Order, UrgencyLevel } from '@/types/planning';

interface ExcelPasteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (orders: Omit<Order, 'id'>[]) => void;
  clients: { id: string; name: string }[];
  nextDisplayOrder: number;
}

const EXPECTED_COLUMNS = ['N° Commande', 'Date', 'Client', 'Désignation', 'Quantité', 'Urgence', 'Délai'];

const parseUrgency = (val: string): UrgencyLevel => {
  const lower = val.toLowerCase().trim();
  if (lower === 'urgent') return 'urgent';
  if (lower === 'modéré' || lower === 'modere' || lower === 'moderate') return 'moderate';
  if (lower === 'pas urgent' || lower === 'not-urgent' || lower === 'not urgent') return 'not-urgent';
  return 'normal';
};

const ExcelPasteDialog: React.FC<ExcelPasteDialogProps> = ({ open, onOpenChange, onImport, clients, nextDisplayOrder }) => {
  const [rawText, setRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [step, setStep] = useState<'paste' | 'preview'>('paste');

  const handleParse = () => {
    const lines = rawText.trim().split('\n').filter(l => l.trim());
    const rows = lines.map(line => line.split('\t').map(cell => cell.trim()));
    // Skip header row if it looks like headers
    const first = rows[0];
    const isHeader = first && first.some(c => 
      EXPECTED_COLUMNS.some(col => c.toLowerCase().includes(col.toLowerCase().substring(0, 4)))
    );
    setParsedRows(isHeader ? rows.slice(1) : rows);
    setStep('preview');
  };

  const handleImport = () => {
    const orders: Omit<Order, 'id'>[] = parsedRows.map((row, i) => {
      const clientName = row[2] || '';
      const matchedClient = clients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
      return {
        orderNumber: row[0] || '',
        orderDate: row[1] || new Date().toISOString().split('T')[0],
        clientId: matchedClient?.id || clients[0]?.id || '',
        designation: row[3] || '',
        quantity: parseInt(row[4]) || 1,
        urgency: parseUrgency(row[5] || ''),
        plannedDeadline: row[6] || '',
        materialAvailable: true,
        toolingAvailable: true,
        displayOrder: nextDisplayOrder + i,
      };
    });
    onImport(orders);
    setRawText('');
    setParsedRows([]);
    setStep('paste');
    onOpenChange(false);
  };

  const handleClose = () => {
    setRawText('');
    setParsedRows([]);
    setStep('paste');
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
                        <TableCell key={j} className="text-xs py-1.5">{row[j] || '—'}</TableCell>
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
