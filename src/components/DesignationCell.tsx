import React from 'react';
import { useOrderAttachments } from '@/context/OrderAttachmentsContext';

interface DesignationCellProps {
  orderId?: string;
  designation: string;
  className?: string;
}

const DesignationCell: React.FC<DesignationCellProps> = ({ orderId, designation, className }) => {
  const { openAttachments } = useOrderAttachments();

  if (!orderId) {
    return <span className={className}>{designation}</span>;
  }

  return (
    <span
      className={`cursor-pointer hover:underline hover:text-primary ${className || ''}`}
      title="عرض الصورة / المخطط المرفق"
      onClick={(e) => { e.stopPropagation(); openAttachments(orderId, designation); }}
    >
      {designation}
    </span>
  );
};

export default DesignationCell;
