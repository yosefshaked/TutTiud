import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";

const GENERIC_RATE_SERVICE_ID = '00000000-0000-0000-0000-000000000000';

export default function RateHistoryManager({ rateHistory, services, employeeType, onChange }) {
  const handleChange = (index, field, value) => {
    const updated = [...rateHistory];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const addEntry = () => {
    const newEntry = {
      service_id: employeeType === 'instructor' ? '' : GENERIC_RATE_SERVICE_ID,
      effective_date: '',
      rate: '',
      notes: ''
    };
    onChange([...rateHistory, newEntry]);
  };

  const availableServices = employeeType === 'instructor'
    ? services.filter(service => service.id !== GENERIC_RATE_SERVICE_ID)
    : services;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">היסטוריית תעריפים</h3>
      {rateHistory.map((entry, index) => (
        <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {employeeType === 'instructor' && (
            <div className="space-y-2">
              <Label>שירות</Label>
              <Select value={entry.service_id} onValueChange={(val) => handleChange(index, 'service_id', val)}>
                <SelectTrigger><SelectValue placeholder="בחר שירות" /></SelectTrigger>
                <SelectContent>
                  {availableServices.map(service => (
                    <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>תאריך תחילה</Label>
            <Input type="date" value={entry.effective_date} onChange={(e) => handleChange(index, 'effective_date', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>תעריף</Label>
            <Input type="number" step="0.01" value={entry.rate} onChange={(e) => handleChange(index, 'rate', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>הערות</Label>
            <Input value={entry.notes || ''} onChange={(e) => handleChange(index, 'notes', e.target.value)} />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={addEntry} className="flex items-center gap-2">
        <Plus className="w-4 h-4" />
        הוסף רשומה
      </Button>
    </div>
  );
}
