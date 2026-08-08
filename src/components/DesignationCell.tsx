import React from 'react';

interface DesignationCellProps {
  orderId?: string;
  designation: string;
  className?: string;
}

const DesignationCell: React.FC<DesignationCellProps> = ({ designation, className }) => {
  return <span className={className}>{designation}</span>;
};

export default DesignationCell;
