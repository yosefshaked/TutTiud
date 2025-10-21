import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

export default function EmployeePicker({ employees, value, onChange }) {
  const [open, setOpen] = useState(false);
  const allIds = employees.map(e => e.id);
  const allSelected = value.length === allIds.length;
  const noneSelected = value.length === 0;
  const someSelected = !allSelected && !noneSelected;
  const masterRef = useRef(null);

  useEffect(() => {
    if (masterRef.current) masterRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggle = (id) => {
    if (value.includes(id)) {
      onChange(value.filter(v => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(allIds);
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">בחר עובדים</Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 max-h-60 overflow-auto p-2 space-y-2">
        <label className="flex items-center gap-2 py-1 cursor-pointer border-b pb-2">
          <input
            ref={masterRef}
            type="checkbox"
            checked={allSelected && !someSelected}
            onChange={toggleAll}
          />
          <span className="text-sm">בחר/הסר בחירה מכולם</span>
        </label>
        {employees.map(emp => (
          <label key={emp.id} className="flex items-center gap-2 py-1 cursor-pointer">
            <input type="checkbox" checked={value.includes(emp.id)} onChange={() => toggle(emp.id)} />
            <span className="text-sm">{emp.name}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
