import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Eye, Phone, Mail, MapPin, User, Navigation } from 'lucide-react';
import type { Representative, AddressDetail } from '@/types/planning';

interface Props {
  companyName: string;
  phones?: string[];
  addresses?: string[];
  addressDetails?: AddressDetail[];
  emails?: string[];
  representatives?: Representative[];
}

const Section: React.FC<{ icon: React.ReactNode; title: string; items?: string[] }> = ({ icon, title, items }) => {
  if (!items || items.filter(Boolean).length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {icon}<span>{title}</span>
      </div>
      <ul className="text-xs space-y-0.5 pr-4">
        {items.filter(Boolean).map((it, i) => <li key={i}>• {it}</li>)}
      </ul>
    </div>
  );
};

const ContactDetailsPopover: React.FC<Props> = ({ companyName, phones, addresses, addressDetails, emails, representatives }) => {
  const reps = representatives || [];
  const addrList = (addresses || []).filter(Boolean);
  const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="عرض التفاصيل">
          <Eye className="w-3.5 h-3.5 text-primary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-h-[70vh] overflow-y-auto" align="end">
        <div className="space-y-3">
          <div className="font-semibold text-sm border-b pb-1.5">{companyName}</div>
          <Section icon={<Phone className="w-3 h-3" />} title="الهواتف" items={phones} />
          <Section icon={<Mail className="w-3 h-3" />} title="البريد الإلكتروني" items={emails} />
          {addrList.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <MapPin className="w-3 h-3" /><span>العناوين</span>
              </div>
              <ul className="text-xs space-y-1.5 pr-4">
                {addrList.map((it, i) => {
                  const d = (addressDetails || [])[i] || {};
                  return (
                    <li key={i} className="space-y-0.5">
                      <div>• {it}</div>
                      {(d.nature || d.gps) && (
                        <div className="pr-3 space-y-0.5 text-[11px] text-muted-foreground">
                          {d.nature && <div>طبيعة العنوان : <span className="text-foreground">{d.nature}</span></div>}
                          {d.gps && (
                            <div className="flex items-center gap-1">
                              <Navigation className="w-3 h-3" />
                              <span>موقع GPS : </span>
                              {isUrl(d.gps) ? (
                                <a href={d.gps} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all" dir="ltr">{d.gps}</a>
                              ) : (
                                <span className="text-foreground break-all" dir="ltr">{d.gps}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {reps.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <div className="text-xs font-semibold text-muted-foreground">الممثلون</div>
              {reps.map(r => (
                <div key={r.id} className="rounded-md border p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-medium text-sm">
                    <User className="w-3.5 h-3.5" /> {r.name || '—'}
                  </div>
                  <Section icon={<Phone className="w-3 h-3" />} title="هاتف" items={r.phones} />
                  <Section icon={<Mail className="w-3 h-3" />} title="بريد إلكتروني" items={r.emails} />
                  <Section icon={<MapPin className="w-3 h-3" />} title="عنوان" items={r.addresses?.length ? r.addresses : addresses} />
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ContactDetailsPopover;
