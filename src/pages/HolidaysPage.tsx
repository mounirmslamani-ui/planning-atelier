import React, { useState } from 'react';
import { formatDateFR } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { usePlanning } from '@/context/PlanningContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';

const HolidaysPage: React.FC = () => {
  const { holidays, addHoliday, deleteHoliday } = usePlanning();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');

  const handleAdd = () => {
    if (date && name) {
      addHoliday({ id: `hol-${Date.now()}`, date, name });
      setDate('');
      setName('');
    }
  };

  return (
    <div className="p-6">
      <PageHeader title="Jours fériés" description="Les jours fériés sont écartés du planning" />
      
      <div className="flex gap-2 mb-4">
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-48" />
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du jour férié" className="flex-1" />
        <Button onClick={handleAdd} disabled={!date || !name} size="sm"><Plus className="w-4 h-4 mr-1" /> Ajouter</Button>
      </div>

      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Nom</TableHead><TableHead className="w-16">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {holidays.sort((a, b) => a.date.localeCompare(b.date)).map(h => (
              <TableRow key={h.id}>
                <TableCell className="font-heading text-sm">{h.date}</TableCell>
                <TableCell className="text-sm">{h.name}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => deleteHoliday(h.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {holidays.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Aucun jour férié.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default HolidaysPage;
