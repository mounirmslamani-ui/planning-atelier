import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReferenceCombobox from '@/components/ui/reference-combobox';
import {
  useCancelMaterialPurchase,
  useCreateMaterialReference,
  useMaterialCombinations,
  useMaterialReference,
  useMaterialSheets,
  useMaterialSupplierPrices,
  useOrderItemPurchases,
  useRecordOrderMaterialPurchase,
  useStockSupplierId,
} from '@/hooks/useMaterialReferences';
import type { OrderItemPurchase } from '@/hooks/useMaterialReferences';
import type { ResourceItem } from '@/types/planning';

/** Ligne matière première structurée (nuance + format + dimension choisis) : seule éligible à un achat enregistré. */
export const isStructuredRawItem = (item: ResourceItem): boolean =>
  (item.kind ?? 'raw') === 'raw' && !!item.gradeId && !!item.formatId && !!item.dimensionId;

/** Cumul de toutes les sources enregistrées pour la ligne (une ligne peut avoir plusieurs sources). */
export interface RecordedPurchase {
  /** première source de la ligne (sert de repère « achat enregistré ») */
  purchaseId: string;
  /** noms des sources, séparés par « + » */
  supplierName: string;
  /** somme de toutes les sources : matière + frais de découpe */
  totalCost: number;
}

interface Props {
  orderId: string;
  item: ResourceItem;
  onClose: () => void;
  /** Appelé après chaque source enregistrée ou annulée (s'il en reste), avec le cumul de la ligne. Ne ferme pas la fenêtre. */
  onRecorded: (result: RecordedPurchase) => void;
  /** Appelé quand la dernière source est annulée (la ligne doit alors perdre achat, fournisseur et prix). */
  onCancelled: () => void;
}

const parseNum = (s: string) => Number(s.trim().replace(',', '.'));
const todayLocal = () => new Date().toLocaleDateString('en-CA');
const fmtMoney = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR') : '');
const round2 = (n: number) => Math.round(n * 100) / 100;
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

const aggregate = (list: { purchaseId: string; supplierName: string; total: number }[]): RecordedPurchase => ({
  purchaseId: list[0].purchaseId,
  supplierName: Array.from(new Set(list.map(p => p.supplierName).filter(Boolean))).join(' + '),
  totalCost: round2(list.reduce((sum, p) => sum + p.total, 0)),
});

const MaterialPurchaseDialog: React.FC<Props> = ({ orderId, item, onClose, onRecorded, onCancelled }) => {
  const combos = useMaterialCombinations();
  const sheets = useMaterialSheets();
  const prices = useMaterialSupplierPrices();
  const suppliers = useMaterialReference('suppliers');
  const units = useMaterialReference('units');
  const createSupplier = useCreateMaterialReference('suppliers');
  const existing = useOrderItemPurchases(item.id);
  const stockQ = useStockSupplierId();
  const record = useRecordOrderMaterialPurchase();
  const cancel = useCancelMaterialPurchase();
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [isStock, setIsStock] = useState(false);

  const stockId = stockQ.data ?? null;
  const stockName = (suppliers.data || []).find(s => s.id === stockId)?.label ?? 'Stock magasin';
  const recorded: OrderItemPurchase[] = existing.data ?? [];
  const showForm = recorded.length === 0 || adding;

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

  // Ce qui est déjà couvert par les sources enregistrées (uniquement celles exprimées dans l'unité de la ligne).
  const recordedTotal = round2(recorded.reduce((sum, p) => sum + p.total, 0));
  const recordedSameUnitQty = recorded.reduce(
    (sum, p) => (p.unitId && p.unitId === item.unitId && p.quantity != null ? sum + p.quantity : sum), 0);
  const remainingQty = item.quantity != null ? Math.max(0, Math.round((item.quantity - recordedSameUnitQty) * 1000) / 1000) : null;
  const proposeQty = (uid: string) =>
    (uid && uid === item.unitId && remainingQty != null && remainingQty > 0 ? String(remainingQty) : '');
  const allSameUnit = !!item.unitId && recorded.length > 0 && recorded.every(p => p.unitId === item.unitId);
  const itemUnitLabel = (units.data || []).find(u => u.id === item.unitId)?.label ?? '';

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
  // Quantité proposée : ce qu'il reste à couvrir, tant que l'unité d'achat est la même que l'unité de la ligne.
  const effectiveQuantity = quantity ?? proposeQty(effectiveUnitId);

  const q = parseNum(effectiveQuantity);
  const p = parseNum(unitPrice);
  const fee = isStock || feeAmount.trim() === '' ? 0 : parseNum(feeAmount);
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
        setQuantity(proposeQty(row.lastPriceUnitId));
      }
    }
    setFeeAmount(row.lastFeeAmount != null ? String(row.lastFeeAmount) : '');
    setFeeLabel(row.lastFeeLabel ?? '');
  };

  const resetForm = () => {
    setSupplierId('');
    setIsStock(false);
    setDocumentRef('');
    setUnitId(null);
    setQuantity(null);
    setUnitPrice('');
    setFeeAmount('');
    setFeeLabel('');
    setAdding(true);
  };

  /** Enregistre la source saisie. closeAfter = false : la fenêtre reste ouverte pour ajouter une autre source. */
  const submit = async (closeAfter: boolean) => {
    const sid = isStock ? stockId : supplierId;
    if (!materialId) { toast.error('Matière introuvable dans le catalogue.'); return; }
    if (!sid) { toast.error(isStock ? 'Source « Stock magasin » indisponible.' : 'Choisis le fournisseur.'); return; }
    if (!date) { toast.error('Choisis la date de l’achat.'); return; }
    if (!Number.isFinite(q) || q <= 0) { toast.error('Quantité : saisis un nombre supérieur à 0.'); return; }
    if (!effectiveUnitId) { toast.error('Choisis l’unité.'); return; }
    if (unitPrice.trim() === '' || !Number.isFinite(p) || p < 0) { toast.error('Prix unitaire : saisis un nombre valide.'); return; }
    if (!Number.isFinite(fee) || fee < 0) { toast.error('Frais de découpe : saisis un nombre valide.'); return; }
    try {
      const res = await record.mutateAsync({
        materialId,
        supplierId: sid,
        date,
        quantity: q,
        unitId: effectiveUnitId,
        unitPrice: p,
        feeAmount: fee > 0 ? fee : null,
        feeLabel: isStock ? null : feeLabel.trim() || null,
        documentRef: documentRef.trim() || null,
        orderId,
        orderItemId: item.id,
        linkSupplier: !isStock,
      });
      if (!res.orderLinked) toast.warning('Achat enregistré, mais non rattaché à la commande.');
      const entry = { purchaseId: res.purchaseId, supplierName: isStock ? stockName : supplierName, total: total ?? 0 };
      onRecorded(aggregate([...recorded, entry]));
      if (closeAfter) onClose();
      else resetForm();
    } catch (err: any) {
      toast.error(err?.message || 'Échec de l’enregistrement de l’achat.');
    }
  };

  const cancelPurchase = async (purchaseId: string) => {
    try {
      await cancel.mutateAsync(purchaseId);
      setCancelTarget(null);
      const rest = recorded.filter(r => r.purchaseId !== purchaseId);
      if (rest.length === 0) {
        setAdding(false);
        onCancelled();
      } else {
        onRecorded(aggregate(rest));
      }
      toast.success('Achat annulé : tu peux le ressaisir.');
    } catch (err: any) {
      toast.error(err?.message || 'Échec de l’annulation de l’achat.');
    }
  };

  const loading = combos.isLoading || existing.isLoading;

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ثمن شراء المادة — {item.label}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Chargement…</p>
        ) : !materialId ? (
          <div className="space-y-3" dir="ltr">
            <p className="text-sm text-destructive">Cette matière (nuance + format + dimension) n’existe pas dans le catalogue.</p>
            <DialogFooter><Button variant="outline" onClick={onClose}>إغلاق</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-3" dir="ltr">
            {recorded.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Sources enregistrées pour cette ligne</p>
                {recorded.map(r => (
                  <div key={r.purchaseId} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {r.supplierId === stockId ? '📦 ' : ''}{r.supplierName || '—'}
                        {r.date ? ` — ${fmtDate(r.date)}` : ''}
                        {r.documentRef ? ` — ${r.documentRef}` : ''}
                      </div>
                      <div className="text-muted-foreground">
                        {r.quantity != null ? `${fmtQty(r.quantity)} ${r.unitLabel}` : ''}
                        {r.unitPrice != null ? ` × ${fmtMoney(r.unitPrice)}` : ''} = {fmtMoney(r.total)} DZD
                      </div>
                    </div>
                    {cancelTarget === r.purchaseId ? (
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => setCancelTarget(null)} disabled={cancel.isPending}>Retour</Button>
                        <Button size="sm" variant="destructive" onClick={() => void cancelPurchase(r.purchaseId)} disabled={cancel.isPending}>
                          Confirmer l’annulation
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="shrink-0" onClick={() => setCancelTarget(r.purchaseId)}>
                        إلغاء الشراء
                      </Button>
                    )}
                  </div>
                ))}
                {allSameUnit && item.quantity != null && (
                  <p className={`text-xs ${recordedSameUnitQty >= item.quantity ? 'text-green-600' : 'text-amber-600'}`}>
                    Quantité couverte : {fmtQty(recordedSameUnitQty)} / {fmtQty(item.quantity)} {itemUnitLabel}
                  </p>
                )}
                <p className="text-sm font-medium">Coût matière de la ligne : {fmtMoney(recordedTotal)} DZD</p>
              </div>
            )}

            {showForm ? (
              <>
                {recorded.length > 0 && <p className="text-xs font-medium">Nouvelle source</p>}
                {stockId && (
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" variant={!isStock ? 'default' : 'outline'} onClick={() => setIsStock(false)}>
                      Fournisseur
                    </Button>
                    <Button type="button" size="sm" variant={isStock ? 'default' : 'outline'} onClick={() => setIsStock(true)}>
                      📦 Stock magasin
                    </Button>
                  </div>
                )}
                {!isStock && habitual.length > 0 && (
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
                  {!isStock && (
                    <div className="col-span-2">
                      <label className="text-xs font-medium mb-1 block">Fournisseur *</label>
                      <ReferenceCombobox
                        value={supplierId}
                        options={(suppliers.data || []).filter(s => s.id !== stockId)}
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
                  )}
                  <div>
                    <label className="text-xs font-medium mb-1 block">{isStock ? 'Date de sortie du stock *' : 'Date *'}</label>
                    <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">{isStock ? 'Réf. bon de sortie / observation' : 'N° de facture / BL'}</label>
                    <Input value={documentRef} onChange={e => setDocumentRef(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">{isStock ? 'Quantité prélevée *' : 'Quantité achetée *'}</label>
                    <Input value={effectiveQuantity} inputMode="decimal" onChange={e => setQuantity(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Unité {isStock ? '' : 'd’achat '}*</label>
                    <select className={selectClass} value={effectiveUnitId} onChange={e => setUnitId(e.target.value)}>
                      <option value="">—</option>
                      {(units.data || []).filter(u => u.active || u.id === effectiveUnitId).map(u => (
                        <option key={u.id} value={u.id}>{u.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">{isStock ? 'Prix unitaire du stock (DZD) *' : 'Prix unitaire (DZD) *'}</label>
                    <Input value={unitPrice} inputMode="decimal" onChange={e => setUnitPrice(e.target.value)} />
                  </div>
                  <div />
                  {!isStock && (
                    <>
                      <div>
                        <label className="text-xs font-medium mb-1 block">Frais de découpe (DZD)</label>
                        <Input value={feeAmount} inputMode="decimal" onChange={e => setFeeAmount(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs font-medium mb-1 block">Libellé des frais</label>
                        <Input value={feeLabel} placeholder="Frais de découpe" onChange={e => setFeeLabel(e.target.value)} />
                      </div>
                    </>
                  )}
                </div>
                <p className="text-sm font-medium">
                  {recorded.length > 0
                    ? `Cette source : ${fmtMoney(total)} DZD — coût matière de la ligne : ${fmtMoney(total == null ? null : round2(recordedTotal + total))} DZD`
                    : `Coût matière de la ligne : ${fmtMoney(total)} DZD`}
                </p>
                <DialogFooter>
                  <Button variant="outline" onClick={onClose}>{recorded.length > 0 ? 'إغلاق' : 'إلغاء'}</Button>
                  <Button variant="outline" onClick={() => void submit(false)} disabled={record.isPending}>
                    تسجيل وإضافة مصدر آخر
                  </Button>
                  <Button onClick={() => void submit(true)} disabled={record.isPending}>تأكيد</Button>
                </DialogFooter>
              </>
            ) : (
              <DialogFooter>
                <Button variant="outline" onClick={() => setAdding(true)}>+ إضافة مصدر آخر</Button>
                <Button
                  onClick={() => {
                    onRecorded(aggregate(recorded));
                    onClose();
                  }}
                >
                  تأكيد
                </Button>
              </DialogFooter>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MaterialPurchaseDialog;
  );
};

export default MaterialPurchaseDialog;
