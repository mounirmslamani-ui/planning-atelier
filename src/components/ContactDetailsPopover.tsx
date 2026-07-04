import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import type { Representative, AddressDetail } from '@/types/planning';
import ClientContactDetailsContent from '@/components/ClientContactDetailsContent';

interface Props {
  companyName: string;
  activity?: string;
  phones?: string[];
  addresses?: string[];
  addressDetails?: AddressDetail[];
  emails?: string[];
  representatives?: Representative[];
}

const ContactDetailsPopover: React.FC<Props> = (props) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="عرض التفاصيل">
          <Eye className="w-3.5 h-3.5 text-primary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-h-[70vh] overflow-y-auto" align="end">
        <ClientContactDetailsContent {...props} />
      </PopoverContent>
    </Popover>
  );
};

export default ContactDetailsPopover;
