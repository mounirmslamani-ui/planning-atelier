import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReferenceCombobox from '@/components/ui/reference-combobox';
import {
  useCreateMaterialReference,
  useMaterialCombinations,
  useMaterialReference,
  useMaterialSheets,
  useMaterialSupplierPrices,
  useOrderItemPurchase,
  useRecordOrderMaterialPurchase,
} from '@/hooks/useMaterialReferences';
import type { ResourceItem } from '@/types/planning';

/** Ligne matière première structurée (nuance + format + dimension choisis) : seule éligible à un achat enregistré. */
export const isStructuredRawItem = (item: ResourceItem): boolean =>
  (item.kind ?? 'raw') === 'raw' && !!item.gradeId && !!item.formatId && !!item.dimensionId;

export interface RecordedPurchase {
  purchaseId: string;
  supplierName: string;
  /** matière + frais de découpe */
  totalCost: number;
}

interface Props {
  orderId: string;
  item: ResourceItem;
  onClose: () => void;
  onRecorded: (result: RecordedPurchase) => void;
}

const parseNum = (s: string) => Number(s.trim().replace(',', '.'));
const todayLocal = () => new Date().toLocaleDateString('en-CA');
const fmtMoney = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR') : '');
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

const MaterialPurchaseDialog: React.FC<Props> = ({ orderId, item, onClose, onRecorded }) => {
  const combos = useMaterialCombinations();
  const sheets = useMaterialSheets();
  const prices = useMaterialSupplierPrices();
  const suppliers = useMaterialReference('suppliers');
  const units = useMaterialReference('units');
  const createSupplier = useCreateMaterialReference('suppliers');
  const existing = useOrderItemPurchase(item.id);
  const record = useRecordOrderMaterialPurchase();

  const materialId = useMemo(
    () => (combos.data || []).find(c =>
      c.gradeId === item.gradeId && c.formatId === item.formatId && c.dimensionId === item.dimensionId)?.id,
    [combos.data, item.gradeId, item.formatId, item.dimensionId],
  );
  const sheet = useMemo(() => (sheets.data || []).find(s => s.id === materialId), [sheets.data, materialId]);
  const habitual = useMemo(
    () => (prices.data || []).filter(r => r.materialId === materialId && r.active)
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName)),
    [prices.data, materialId],
  );

  const defaultUnitId = sheet?.purchaseUnitId || item.unitId || '';
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [documentRef, setDocumentRef] = useState('');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<string | null>(null);
  const [unitPrice, setUnitPrice] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [feeLabel, setFeeLabel] = useState('');

  const effectiveUnitId = unitId ?? defaultUnitId;
  // Quantité proposée : celle de la commande, tant que l'unité d'achat est la même que l'unité de la ligne.
  const effectiveQuantity = quantity ?? (effectiveUnitId && effectiveUnitId === item.unitId && item.quantity != null ? String(item.quantity) : '');

  const q = parseNum(effectiveQuantity);
  const p = parseNum(unitPrice);
  const fee = feeAmount.trim() === '' ? 0 : parseNum(feeAmount);
  const total = Number.isFinite(q) && Number.isFinite(p) && Number.isFinite(fee)
    ? Math.round(q * p * 100) / 100 + fee
    : null;

  const supplierName = (suppliers.data || []).find(s => s.id === supplierId)?.label ?? '';

  /** Choisir un fournisseur reprend son dernier prix et ses derniers frais de découpe pour cette matière. */
  const pickSupplier = (id: string) => {
    setSupplierId(id);
    const row = habitual.find(r => r.supplierId === id);
    if (!row) return;
    if (row.lastUnitPrice != null) {
      setUnitPrice(String(row.lastUnitPrice));
      if (row.lastPriceUnitId) {
        setUnitId(row.lastPriceUnitId);
        setQuantity(row.lastPriceUnitId === item.unitId && item.quantity != null ? String(item.quantity) : '');
      }
    }
    setFeeAmount(row.lastFeeAmount != null ? String(row.lastFeeAmount) : '');
    setFeeLabel(row.lastFeeLabel ?? '');
  };

  const submit = async () => {
    if (!materialId) { toast.error('Matière introuvable dans le catalogue.'); return; }
    if (!supplierId) { toast.error('Choisis le fournisseur.'); return; }
    if (!date) { toast.error('Choisis la date de l’achat.'); return; }
    if (!Number.isFinite(q) || q <= 0) { toast.error('Quantité : saisis un nombre supérieur à 0.'); return; }
    if (!effectiveUnitId) { toast.error('Choisis l’unité.'); return; }
    if (unitPrice.trim() === '' || !Number.isFinite(p) || p < 0) { toast.error('Prix unitaire : saisis un nombre valide.'); return; }
    if (!Number.isFinite(fee) || fee < 0) { toast.error('Frais de découpe : saisis un nombre valide.'); return; }
    try {
      const res = await record.mutateAsync({
        materialId,
        supplierId,
        date,
        quantity: q,
        unitId: effectiveUnitId,
        unitPrice: p,
        feeAmount: fee > 0 ? fee : null,
        feeLabel: feeLabel.trim() || null,
        documentRef: documentRef.trim() || null,
        orderId,
        orderItemId: item.id,
      });
      if (!res.orderLinked) toast.warning('Achat enregistré, mais non rattaché à la commande.');
      onRecorded({ purchaseId: res.purchaseId, supplierName, totalCost: total ?? 0 });
    } catch (err: any) {
      toast.error(err?.message || 'Échec de l’enregistrement de l’achat.');
    }
  };

  const loading = combos.isLoading || existing.isLoading;

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader>
          <DialogTitle>ثمن شراء المادة — {item.label}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Chargement…</p>
        ) : existing.data ? (
          <div className="space-y-3" dir="ltr">
            <p className="text-sm">
              Un achat est déjà enregistré pour cette ligne : {existing.data.supplierName || '—'}
              {existing.data.date ? ` — ${fmtDate(existing.data.date)}` : ''}
              {existing.data.documentRef ? ` — ${existing.data.documentRef}` : ''} — {fmtMoney(existing.data.total)} DZD
              (matière + frais de découpe).
            </p>
            <p className="text-xs text-muted-foreground">Il sera repris tel quel, sans en créer un second.</p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>إلغاء</Button>
              <Button
                onClick={() => onRecorded({
                  purchaseId: existing.data!.purchaseId,
                  supplierName: existing.data!.supplierName,
                  totalCost: existing.data!.total,
                })}
              >
                تأكيد
              </Button>
            </DialogFooter>
          </div>
        ) : !materialId ? (
          <div className="space-y-3" dir="ltr">
            <p className="text-sm text-destructive">Cette matière (nuance + format + dimension) n’existe pas dans le catalogue.</p>
            <DialogFooter><Button variant="outline" onClick={onClose}>إغلاق</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-3" dir="ltr">
            {habitual.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {habitual.map(r => (
                  <Button
                    key={r.id}
                    type="button"
                    size="sm"
                    variant={supplierId === r.supplierId ? 'default' : 'outline'}
                    onClick={() => pickSupplier(r.supplierId)}
                  >
                    {r.supplierName}
                    {r.lastUnitPrice != null ? ` — ${fmtMoney(r.lastUnitPrice)}${r.lastPriceUnitLabel ? ` / ${r.lastPriceUnitLabel}` : ''}` : ''}
                  </Button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium mb-1 block">Fournisseur *</label>
                <ReferenceCombobox
                  value={supplierId}
                  options={suppliers.data || []}
                  placeholder="— Fournisseur —"
                  className="h-9 text-sm px-2"
                  onSelect={o => pickSupplier(o?.id ?? '')}
                  onCreate={async label => {
                    try {
                      return await createSupplier.mutateAsync(label);
                    } catch (err) {
                      toast.error('Impossible d’ajouter le fournisseur.');
                      throw err;
                    }
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Date *</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">N° de facture / BL</label>
                <Input value={documentRef} onChange={e => setDocumentRef(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Quantité achetée *</label>
                <Input value={effectiveQuantity} inputMode="decimal" onChange={e => setQuantity(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Unité d’achat *</label>
                <select className={selectClass} value={effectiveUnitId} onChange={e => setUnitId(e.target.value)}>
                  <option value="">—</option>
                  {(units.data || []).filter(u => u.active || u.id === effectiveUnitId).map(u => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Prix unitaire (DZD) *</label>
                <Input value={unitPrice} inputMode="decimal" onChange={e => setUnitPrice(e.target.value)} />
              </div>
              <div />
              <div>
                <label className="text-xs font-medium mb-1 block">Frais de découpe (DZD)</label>
                <Input value={feeAmount} inputMode="decimal" onChange={e => setFeeAmount(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Libellé des frais</label>
                <Input value={feeLabel} placeholder="Frais de découpe" onChange={e => setFeeLabel(e.target.value)} />
              </div>
            </div>
            <p className="text-sm font-medium">Coût matière de la ligne : {fmtMoney(total)} DZD</p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>إلغاء</Button>
              <Button onClick={() => void submit()} disabled={record.isPending}>تأكيد</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MaterialPurchaseDialog;
