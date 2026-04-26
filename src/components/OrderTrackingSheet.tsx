import React, { useEffect, useMemo } from 'react';
import { usePlanning } from '@/context/PlanningContext';
import { formatDateFR } from '@/lib/utils';
import logoUrl from '@/assets/slamani-tasnie-logo.png';
import type { Order } from '@/types/planning';

interface Props {
  order: Order;
  onClose: () => void;
}

const PRIORITY_LABEL: Record<string, string> = {
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
  undetermined: '—',
};

const EMPTY_TABLE_ROWS = 12;

const OrderTrackingSheet: React.FC<Props> = ({ order, onClose }) => {
  const { clients, steps, operators, subcontractors, operations, absenceOperationId } = usePlanning();

  const clientName = useMemo(
    () => clients.find(c => c.id === order.clientId)?.name || '',
    [clients, order.clientId],
  );

  const orderSteps = useMemo(
    () => steps
      .filter(s => s.orderId === order.id && s.operationId !== absenceOperationId)
      .sort((a, b) => a.order - b.order),
    [steps, order.id, absenceOperationId],
  );

  const materialNeeds = useMemo(() => {
    const set = new Set<string>();
    orderSteps.forEach(s => (s.rawMaterialNeeds || []).forEach(v => {
      const t = (v || '').trim();
      if (t) set.add(t);
    }));
    return Array.from(set);
  }, [orderSteps]);

  const toolingNeeds = useMemo(() => {
    const set = new Set<string>();
    orderSteps.forEach(s => (s.specialToolingNeeds || []).forEach(v => {
      const t = (v || '').trim();
      if (t) set.add(t);
    }));
    return Array.from(set);
  }, [orderSteps]);

  const stepRows = useMemo(() => orderSteps.map(s => {
    const op = operations.find(o => o.id === s.operationId);
    const isSub = !!s.subcontractorId;
    const worker = isSub
      ? (subcontractors.find(sc => sc.id === s.subcontractorId)?.companyName || '')
      : (operators.find(o => o.id === s.operatorId)?.name || '');
    return {
      id: s.id,
      worker,
      operation: op?.name || '',
    };
  }), [orderSteps, operators, subcontractors, operations]);

  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    const after = () => onClose();
    window.addEventListener('afterprint', after);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', after);
    };
  }, [onClose]);

  const editionDate = formatDateFR(new Date().toISOString().split('T')[0]);

  return (
    <div className="tracking-sheet-overlay" dir="rtl">
      <div className="tracking-sheet-controls no-print" dir="ltr">
        <button onClick={() => window.print()} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
          طباعة
        </button>
        <button onClick={onClose} className="px-4 py-2 rounded-md border border-border bg-background text-sm font-medium">
          إغلاق
        </button>
      </div>

      <div className="tracking-sheet-page">
        {/* HEADER : logo collé en haut à droite, date collée à l'extrême gauche en dessous */}
        <div className="ts-header-row">
          <div className="ts-header-date" dir="rtl">
            <span className="ts-label-ar">التاريخ:</span>
            <span className="ts-date-value">{editionDate}</span>
          </div>
          <div className="ts-header-logo">
            <img src={logoUrl} alt="Slamani Tasnie" />
          </div>
        </div>

        {/* Titre principal centré, collé au numéro de commande */}
        <div className="ts-header-title">بطاقة متابعة انجاز طلبية</div>
        <div className="ts-order-number">
          <span className="ts-label-ar">طلبية رقم:</span>
          <span className="ts-order-number-value">{order.orderNumber}</span>
        </div>

        {/* BLOC 1 : infos commande */}
        <div className="ts-box ts-box-info">
          <div className="ts-info-row ts-info-row-split">
            <div className="ts-info-row ts-info-client">
              <span className="ts-label-ar">اسم الزبون:</span>
              <span className="ts-value-black">{clientName}</span>
            </div>
            <div className="ts-info-row ts-info-priority">
              <span className="ts-label-ar">درجة الاستعجال:</span>
              <span className="ts-value-black">{PRIORITY_LABEL[order.priority || 'undetermined']}</span>
            </div>
          </div>
          <div className="ts-info-row ts-info-row-double">
            <div className="ts-info-row ts-info-half">
              <span className="ts-label-ar">تعيين الطلبية:</span>
              <span className="ts-value-black">{order.designation}</span>
            </div>
            <div className="ts-info-row ts-info-half-small">
              <span className="ts-label-ar">الكمية:</span>
              <span className="ts-value-black">{order.quantity}</span>
            </div>
          </div>
          <div className="ts-info-row">
            <span className="ts-label-ar">مخطط/نموذج:</span>
            <span className="ts-value-black">{order.drawingModel || ''}</span>
          </div>
          <div className="ts-info-row ts-info-row-block">
            <span className="ts-label-ar">ملاحظات/تعليمات:</span>
            <span className="ts-value-black">{order.instructions || order.observation || ''}</span>
          </div>
        </div>

        {/* BLOC 2 : besoins en matières premières / outillage spécial */}
        <div className="ts-box ts-box-needs">
          <div className="ts-needs-section">
            <div className="ts-needs-title">المواد الأولية/مكونات الطلبية:</div>
            {materialNeeds.length > 0 && (
              <div className="ts-needs-list">
                {materialNeeds.map((v, i) => (
                  <div key={i} className="ts-needs-value">{v}</div>
                ))}
              </div>
            )}
          </div>
          <div className="ts-needs-section">
            <div className="ts-needs-title">أداة خاصة:</div>
            {toolingNeeds.length > 0 && (
              <div className="ts-needs-list">
                {toolingNeeds.map((v, i) => (
                  <div key={i} className="ts-needs-value">{v}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Titre tableau aligné à droite */}
        <div className="ts-table-title">وقت الإنجاز:</div>

        {/* TABLE des étapes — ordre RTL : عامل | عملية | فعلي | محتسب | تاريخ | ملاحظات */}
        <table className="ts-steps" dir="rtl">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>اسم العامل/<br/>المناول</th>
              <th style={{ width: '22%' }}>العملية</th>
              <th style={{ width: '12%' }}>الوقت<br/>الفعلي</th>
              <th style={{ width: '12%' }}>الوقت<br/>المحتسب</th>
              <th style={{ width: '12%' }}>التاريخ</th>
              <th style={{ width: '20%' }}>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(EMPTY_TABLE_ROWS, stepRows.length) }).map((_, i) => {
              const r = stepRows[i];
              return (
                <tr key={i}>
                  <td className="ts-cell-data">{r ? r.worker : ''}</td>
                  <td className="ts-cell-data">{r ? r.operation : ''}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        .tracking-sheet-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: hsl(var(--background));
          overflow: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .tracking-sheet-controls {
          display: flex;
          gap: 8px;
          width: 210mm;
          max-width: 100%;
          justify-content: flex-end;
        }
        .tracking-sheet-page {
          width: 210mm;
          min-height: 297mm;
          background: white;
          color: #000;
          padding: 5mm 10mm 12mm 10mm;
          box-sizing: border-box;
          box-shadow: 0 4px 24px rgba(0,0,0,0.15);
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 11pt;
          direction: rtl;
        }

        /* ---------- HEADER ---------- */
        .ts-header-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin: 0 0 2mm 0;
        }
        .ts-header-logo img {
          height: 20.7mm;
          object-fit: contain;
          display: block;
          margin: 0;
        }
        .ts-header-date {
          direction: rtl;
          font-size: 11pt;
          display: flex;
          gap: 8px;
          align-items: baseline;
          margin-top: 2mm;
        }
        .ts-date-value {
          border-bottom: 1px dotted #333;
          min-width: 80px;
          display: inline-block;
          color: #000;
          font-weight: 600;
        }
        .ts-header-title {
          text-align: center;
          font-size: 16pt;
          font-weight: 700;
          color: #000;
          margin: 0;
          line-height: 1.2;
        }

        .ts-order-number {
          text-align: center;
          margin: 0 0 3mm 0;
          font-size: 11pt;
          display: flex;
          justify-content: center;
          gap: 8px;
          align-items: baseline;
        }
        .ts-order-number-value {
          color: #000;
          font-weight: 700;
          border-bottom: 1px dotted #333;
          min-width: 60px;
          display: inline-block;
          text-align: center;
        }

        /* ---------- BOXES ---------- */
        .ts-box {
          border: 1px solid #000;
          padding: 4mm 5mm;
          margin-bottom: 4mm;
        }
        .ts-box-info {
          display: flex;
          flex-direction: column;
          gap: 3mm;
        }
        .ts-info-row {
          display: flex;
          gap: 6px;
          align-items: baseline;
        }
        .ts-info-row-block { align-items: flex-start; }
        .ts-info-row-split {
          display: flex;
          gap: 8mm;
          align-items: baseline;
        }
        .ts-info-client { flex: 1; }
        .ts-info-priority { flex: 0 0 38%; }
        .ts-info-row-double {
          display: flex;
          gap: 8mm;
          align-items: baseline;
        }
        .ts-info-half { flex: 1; }
        .ts-info-half-small { flex: 0 0 25%; }
        .ts-label-ar {
          color: #000;
          font-weight: 600;
          white-space: nowrap;
        }
        .ts-value-black {
          color: #000;
          font-weight: 600;
          flex: 1;
          border-bottom: 1px dotted #999;
          min-height: 1.2em;
          padding-bottom: 1px;
        }

        /* ---------- NEEDS BOX ---------- */
        .ts-box-needs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6mm;
        }
        .ts-needs-section { display: flex; flex-direction: column; gap: 2mm; }
        .ts-needs-title {
          text-align: right;
          font-weight: 700;
          text-decoration: underline;
          color: #000;
        }
        .ts-needs-list { display: flex; flex-direction: column; gap: 1mm; }
        .ts-needs-value {
          color: #000;
          font-weight: 600;
          text-align: right;
          padding: 1px 0;
        }

        /* ---------- TABLE ---------- */
        .ts-table-title {
          text-align: right;
          font-weight: 700;
          margin-bottom: 2mm;
        }
        .ts-steps {
          width: 100%;
          border-collapse: collapse;
        }
        .ts-steps th, .ts-steps td {
          border: 1px solid #000;
          padding: 2mm 2mm;
          font-size: 10.5pt;
          text-align: center;
          vertical-align: middle;
          height: 9mm;
          color: #000;
        }
        .ts-steps th {
          background: #fff;
          color: #000;
          font-weight: 700;
        }
        .ts-cell-data {
          color: #000;
          font-weight: 600;
        }

        /* ---------- PRINT ---------- */
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          .tracking-sheet-overlay,
          .tracking-sheet-overlay * { visibility: visible !important; }
          .tracking-sheet-overlay {
            position: static !important;
            padding: 0 !important;
            background: white !important;
            display: block !important;
          }
          .no-print { display: none !important; }
          .tracking-sheet-page {
            box-shadow: none !important;
            width: 210mm !important;
            min-height: 297mm !important;
            padding: 5mm 10mm 12mm 10mm !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default OrderTrackingSheet;
