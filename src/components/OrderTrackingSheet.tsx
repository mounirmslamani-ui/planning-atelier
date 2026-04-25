import React, { useEffect, useMemo } from 'react';
import { usePlanning } from '@/context/PlanningContext';
import { formatDateFR } from '@/lib/utils';
import type { Order } from '@/types/planning';

interface Props {
  order: Order;
  onClose: () => void;
}

const RESOURCE_LABEL: Record<string, string> = {
  'disponible': 'متوفرة',
  'non-disponible': 'غير متوفرة',
  'partiel': 'جزئية',
  'non-applicable': 'لا ينطبق',
};

const PRIORITY_LABEL: Record<string, string> = {
  P1: 'P1 - مستعجل',
  P2: 'P2 - مستعجل نسبيا',
  P3: 'P3 - غير مستعجل',
  P4: 'P4 - قيد التعليق',
  undetermined: 'غير محددة',
};

const OrderTrackingSheet: React.FC<Props> = ({ order, onClose }) => {
  const { clients, steps, operators, subcontractors, operations, absenceOperationId } = usePlanning();

  const clientName = useMemo(
    () => clients.find(c => c.id === order.clientId)?.name || '—',
    [clients, order.clientId],
  );

  const orderSteps = useMemo(
    () => steps
      .filter(s => s.orderId === order.id && s.operationId !== absenceOperationId)
      .sort((a, b) => a.order - b.order),
    [steps, order.id, absenceOperationId],
  );

  const rows = useMemo(() => orderSteps.map(s => {
    const op = operations.find(o => o.id === s.operationId);
    const isSub = !!s.subcontractorId;
    const worker = isSub
      ? (subcontractors.find(sc => sc.id === s.subcontractorId)?.companyName || '—')
      : (operators.find(o => o.id === s.operatorId)?.name || '—');
    return {
      id: s.id,
      worker: isSub ? `${worker} (مناولة)` : worker,
      operation: op?.name || '—',
    };
  }), [orderSteps, operators, subcontractors, operations]);

  // Auto-trigger print dialog once mounted, then close after print.
  useEffect(() => {
    const t = setTimeout(() => {
      window.print();
    }, 300);
    const after = () => onClose();
    window.addEventListener('afterprint', after);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', after);
    };
  }, [onClose]);

  const editionDate = formatDateFR(new Date().toISOString().split('T')[0]);

  return (
    <div className="tracking-sheet-overlay">
      <div className="tracking-sheet-controls no-print">
        <button onClick={() => window.print()} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
          طباعة
        </button>
        <button onClick={onClose} className="px-4 py-2 rounded-md border border-border bg-background text-sm font-medium">
          إغلاق
        </button>
      </div>

      <div className="tracking-sheet-page">
        {/* Header */}
        <div className="ts-header">
          <div className="ts-brand">
            <div className="ts-logo">ST</div>
            <div className="ts-brand-text">
              <div className="ts-brand-name">Slamani Tasnie</div>
              <div className="ts-brand-sub">Atelier de fabrication mécanique</div>
            </div>
          </div>
          <div className="ts-title">بطاقة متابعة انجاز طلبية</div>
          <div className="ts-edition">
            <div>تاريخ الإصدار</div>
            <div className="ts-edition-date">{editionDate}</div>
          </div>
        </div>

        {/* Order info grid */}
        <table className="ts-info">
          <tbody>
            <tr>
              <th>رقم الطلبية</th>
              <td>{order.orderNumber}</td>
              <th>التاريخ</th>
              <td>{formatDateFR(order.orderDate)}</td>
            </tr>
            <tr>
              <th>الزبون</th>
              <td colSpan={3}>{clientName}</td>
            </tr>
            <tr>
              <th>التعيين</th>
              <td colSpan={3}>{order.designation}</td>
            </tr>
            <tr>
              <th>الكمية</th>
              <td>{order.quantity}</td>
              <th>الأولوية</th>
              <td>{PRIORITY_LABEL[order.priority || 'undetermined']}</td>
            </tr>
            <tr>
              <th>ممثل الزبون</th>
              <td>{order.clientRepresentative || '—'}</td>
              <th>مخطط/نموذج</th>
              <td>{order.drawingModel || '—'}</td>
            </tr>
            <tr>
              <th>المواد الأولية</th>
              <td>{RESOURCE_LABEL[order.materialStatus] || '—'}</td>
              <th>العدة</th>
              <td>{RESOURCE_LABEL[order.toolingStatus] || '—'}</td>
            </tr>
            <tr>
              <th>ملاحظات / تعليمات</th>
              <td colSpan={3}>{order.instructions || order.observation || '—'}</td>
            </tr>
          </tbody>
        </table>

        {/* Steps table */}
        <table className="ts-steps">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>#</th>
              <th style={{ width: '22%' }}>العامل / المناول</th>
              <th style={{ width: '23%' }}>العملية</th>
              <th style={{ width: '15%' }}>الوقت الفعلي</th>
              <th style={{ width: '15%' }}>التاريخ</th>
              <th style={{ width: '20%' }}>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="ts-center">{i + 1}</td>
                <td>{r.worker}</td>
                <td>{r.operation}</td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            ))}
            {/* Add a few empty rows for hand-written extra entries */}
            {Array.from({ length: Math.max(0, 4 - rows.length) }).map((_, i) => (
              <tr key={`empty-${i}`}>
                <td className="ts-center">{rows.length + i + 1}</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Signature block */}
        <div className="ts-signatures">
          <div className="ts-sig">
            <div className="ts-sig-label">توقيع المسؤول</div>
            <div className="ts-sig-line" />
          </div>
          <div className="ts-sig">
            <div className="ts-sig-label">توقيع مراقبة الجودة</div>
            <div className="ts-sig-line" />
          </div>
        </div>
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
          padding: 14mm 12mm;
          box-shadow: 0 4px 24px rgba(0,0,0,0.15);
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 12pt;
        }

        .ts-header {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          align-items: center;
          border-bottom: 2px solid #111;
          padding-bottom: 8px;
          margin-bottom: 10px;
        }
        .ts-brand { display: flex; align-items: center; gap: 10px; }
        .ts-logo {
          width: 50px; height: 50px;
          border-radius: 8px;
          background: #1a365d;
          color: white;
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 18pt;
          letter-spacing: 1px;
        }
        .ts-brand-name { font-weight: 800; font-size: 14pt; }
        .ts-brand-sub  { font-size: 9pt; color: #555; }
        .ts-title {
          text-align: center;
          font-size: 18pt;
          font-weight: 800;
          color: #1a365d;
        }
        .ts-edition {
          text-align: right;
          font-size: 9pt;
          color: #333;
        }
        .ts-edition-date { font-weight: 700; font-size: 11pt; color: #111; }

        .ts-info {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 12px;
        }
        .ts-info th, .ts-info td {
          border: 1px solid #555;
          padding: 6px 8px;
          font-size: 11pt;
          text-align: right;
          vertical-align: middle;
        }
        .ts-info th {
          background: #f1f5f9;
          font-weight: 700;
          width: 18%;
          white-space: nowrap;
        }

        .ts-steps {
          width: 100%;
          border-collapse: collapse;
          margin-top: 6px;
        }
        .ts-steps th, .ts-steps td {
          border: 1px solid #333;
          padding: 8px 6px;
          font-size: 11pt;
          text-align: right;
          height: 30px;
        }
        .ts-steps th {
          background: #1a365d;
          color: white;
          font-weight: 700;
          text-align: center;
        }
        .ts-center { text-align: center; }

        .ts-signatures {
          margin-top: 24px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
        }
        .ts-sig-label { font-size: 10pt; font-weight: 600; margin-bottom: 28px; }
        .ts-sig-line { border-bottom: 1px solid #333; height: 0; }

        @media print {
          @page { size: A4 portrait; margin: 10mm; }
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
