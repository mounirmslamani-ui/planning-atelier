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

// Number of empty rows in the steps table (per the paper template)
const EMPTY_TABLE_ROWS = 12;
// Number of dotted lines for materials / tooling needs lists
const NEEDS_LINES = 6;

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

  // Aggregate raw-material and tooling needs from all production steps
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

  // Auto-trigger print dialog once mounted
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

  // Helper to render a list of values as dotted lines (red text on dotted line)
  const renderNeedsList = (items: string[]) => {
    const lines: (string | null)[] = [];
    for (let i = 0; i < NEEDS_LINES; i++) {
      lines.push(items[i] ?? null);
    }
    return (
      <div className="ts-needs-list">
        {lines.map((val, i) => (
          <div key={i} className="ts-needs-line">
            {val ? <span className="ts-needs-value">{val}</span> : <span className="ts-needs-dots">............................................</span>}
          </div>
        ))}
      </div>
    );
  };

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
        {/* HEADER : date à gauche, titre au centre, logo à droite */}
        <div className="ts-header">
          <div className="ts-header-date">
            <span className="ts-label-ar">التاريخ:</span>
            <span className="ts-date-value">{editionDate}</span>
          </div>
          <div className="ts-header-title">بطاقة متابعة انجاز طلبية</div>
          <div className="ts-header-logo">
            <img src={logoUrl} alt="Slamani Tasnie" />
          </div>
        </div>

        {/* N° طلبية رقم */}
        <div className="ts-order-number">
          <span className="ts-label-ar">طلبية رقم:</span>
          <span className="ts-order-number-value">{order.orderNumber}</span>
        </div>

        {/* BLOC 1 : infos commande */}
        <div className="ts-box ts-box-info">
          <div className="ts-info-grid">
            {/* Colonne droite (RTL : première visuellement) */}
            <div className="ts-info-col">
              <div className="ts-info-row">
                <span className="ts-label-ar">اسم الزبون:</span>
                <span className="ts-value-red">{clientName}</span>
              </div>
              <div className="ts-info-row">
                <span className="ts-label-ar">تعيين الطلبية:</span>
                <span className="ts-value-red">{order.designation}</span>
              </div>
              <div className="ts-info-row">
                <span className="ts-label-ar">الكمية:</span>
                <span className="ts-value-red">{order.quantity}</span>
              </div>
              <div className="ts-info-row">
                <span className="ts-label-ar">مخطط/نموذج:</span>
                <span className="ts-value-red">{order.drawingModel || ''}</span>
              </div>
              <div className="ts-info-row ts-info-row-block">
                <span className="ts-label-ar">ملاحظات/تعليمات:</span>
                <span className="ts-value-red">{order.instructions || order.observation || ''}</span>
              </div>
            </div>

            {/* Colonne gauche */}
            <div className="ts-info-col">
              <div className="ts-info-row">
                <span className="ts-label-ar">ممثل الزبون:</span>
                <span className="ts-value-red">{order.clientRepresentative || ''}</span>
              </div>
              <div className="ts-info-row">
                <span className="ts-label-ar">درجة الاستعجال:</span>
                <span className="ts-value-red">{PRIORITY_LABEL[order.priority || 'undetermined']}</span>
              </div>
            </div>
          </div>
        </div>

        {/* BLOC 2 : besoins en matières premières / outillage spécial */}
        <div className="ts-box ts-box-needs">
          <div className="ts-needs-section">
            <div className="ts-needs-title">المواد الأولية/مكونات الطلبية:</div>
            {renderNeedsList(materialNeeds)}
          </div>
          <div className="ts-needs-section">
            <div className="ts-needs-title">أداة خاصة:</div>
            {renderNeedsList(toolingNeeds)}
          </div>
        </div>

        {/* Titre tableau */}
        <div className="ts-table-title">وقت الإنجاز:</div>

        {/* TABLE des étapes */}
        <table className="ts-steps">
          <thead>
            <tr>
              <th style={{ width: '20%' }}>ملاحظات</th>
              <th style={{ width: '12%' }}>التاريخ</th>
              <th style={{ width: '12%' }}>الوقت<br/>المحتسب</th>
              <th style={{ width: '12%' }}>الوقت<br/>الفعلي</th>
              <th style={{ width: '22%' }}>العملية</th>
              <th style={{ width: '22%' }}>اسم<br/>العامل/المناول</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(EMPTY_TABLE_ROWS, stepRows.length) }).map((_, i) => {
              const r = stepRows[i];
              return (
                <tr key={i}>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td className="ts-cell-red">{r ? r.operation : ''}</td>
                  <td className="ts-cell-red">{r ? r.worker : ''}</td>
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
          color: #111;
          padding: 12mm 12mm;
          box-shadow: 0 4px 24px rgba(0,0,0,0.15);
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 11pt;
          direction: rtl;
        }

        /* ---------- HEADER ---------- */
        .ts-header {
          display: grid;
          grid-template-columns: 1fr 2fr 1fr;
          align-items: center;
          margin-bottom: 6mm;
        }
        .ts-header-date {
          direction: rtl;
          text-align: right;
          font-size: 11pt;
          display: flex;
          gap: 8px;
          align-items: baseline;
        }
        .ts-date-value {
          border-bottom: 1px dotted #333;
          min-width: 80px;
          display: inline-block;
          color: #c00;
          font-weight: 600;
        }
        .ts-header-title {
          text-align: center;
          font-size: 16pt;
          font-weight: 700;
          color: #111;
        }
        .ts-header-logo {
          display: flex;
          justify-content: flex-start;
          align-items: center;
        }
        .ts-header-logo img {
          height: 18mm;
          object-fit: contain;
        }

        .ts-order-number {
          text-align: center;
          margin-bottom: 3mm;
          font-size: 11pt;
          display: flex;
          justify-content: center;
          gap: 8px;
          align-items: baseline;
        }
        .ts-order-number-value {
          color: #c00;
          font-weight: 700;
          border-bottom: 1px dotted #333;
          min-width: 60px;
          display: inline-block;
          text-align: center;
        }

        /* ---------- BOXES ---------- */
        .ts-box {
          border: 1px solid #111;
          padding: 4mm 5mm;
          margin-bottom: 4mm;
        }

        .ts-info-grid {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 8mm;
        }
        .ts-info-col { display: flex; flex-direction: column; gap: 3mm; }
        .ts-info-row {
          display: flex;
          gap: 6px;
          align-items: baseline;
        }
        .ts-info-row-block { align-items: flex-start; }
        .ts-label-ar {
          color: #111;
          font-weight: 600;
          white-space: nowrap;
        }
        .ts-value-red {
          color: #c00;
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
          text-align: left;
          font-weight: 700;
          text-decoration: underline;
          color: #111;
        }
        .ts-needs-list { display: flex; flex-direction: column; gap: 1mm; }
        .ts-needs-line {
          min-height: 5mm;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        .ts-needs-value {
          color: #c00;
          font-weight: 600;
          border-bottom: 1px dotted #999;
          width: 100%;
          text-align: right;
          padding-bottom: 1px;
        }
        .ts-needs-dots {
          color: #888;
          letter-spacing: 1px;
          width: 100%;
          text-align: right;
        }

        /* ---------- TABLE ---------- */
        .ts-table-title {
          text-align: left;
          font-weight: 700;
          margin-bottom: 2mm;
        }
        .ts-steps {
          width: 100%;
          border-collapse: collapse;
        }
        .ts-steps th, .ts-steps td {
          border: 1px solid #111;
          padding: 2mm 2mm;
          font-size: 10.5pt;
          text-align: center;
          vertical-align: middle;
          height: 9mm;
        }
        .ts-steps th {
          background: #fff;
          color: #111;
          font-weight: 700;
        }
        .ts-cell-red {
          color: #c00;
          font-weight: 600;
          text-align: right;
        }

        /* ---------- PRINT ---------- */
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          html, body { background: white !important; }
          body * { visibility: hidden !important; }
          .tracking-sheet-overlay,
          .tracking-sheet-overlay * { visibility: visible !important; }
          .tracking-sheet-overlay {
            position: static !important;
            padding: 0 !important;
            background: white !important;
          }
          .no-print { display: none !important; }
          .tracking-sheet-page {
            box-shadow: none !important;
            width: auto !important;
            min-height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default OrderTrackingSheet;
