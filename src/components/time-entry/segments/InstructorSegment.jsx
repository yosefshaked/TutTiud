import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select';
import { Copy, Trash2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export default function InstructorSegment({
  segment,
  index,
  services,
  onChange,
  onDuplicate,
  onDelete,
  rate,
  errors = {},
  disabled = false,
}) {
  const total = (parseFloat(segment.sessions_count || 0) * parseFloat(segment.students_count || 0)) * rate;
  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-4 md:p-5">
      <div className="flex justify-end gap-2 mb-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDelete(index)}
              aria-label="מחק רישום"
              className="h-7 w-7"
              disabled={disabled}
            ><Trash2 className="h-4 w-4" /></Button>
          </TooltipTrigger>
          <TooltipContent>מחק רישום</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDuplicate(index)}
              aria-label="שכפל רישום"
              className="h-7 w-7"
              disabled={disabled}
            ><Copy className="h-4 w-4" /></Button>
          </TooltipTrigger>
          <TooltipContent>שכפל רישום</TooltipContent>
        </Tooltip>
      </div>
      <div className="grid grid-cols-12 gap-4 items-start">
        <div className="col-span-6 md:col-span-7 space-y-1">
          <Label className="text-sm font-medium text-slate-700">שירות</Label>
          <Select value={segment.service_id} onValueChange={v => onChange(index, { service_id: v })} disabled={disabled}>
            <SelectTrigger className="h-10 text-base leading-6" disabled={disabled}>
              {segment.service_id ? services.find(s => s.id === segment.service_id)?.name : 'בחר שירות'}
            </SelectTrigger>
            <SelectContent>
              {services.map(s => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
            </SelectContent>
          </Select>
          {errors.service && <p className="text-sm text-red-600">{errors.service}</p>}
        </div>
        <div className="col-span-3 md:col-span-2 space-y-1">
          <Label className="text-sm font-medium text-slate-700">מספר שיעורים</Label>
          <Input
            type="number"
            min="1"
            value={segment.sessions_count}
            onChange={e => onChange(index, { sessions_count: e.target.value })}
            className="bg-white h-10 text-base leading-6"
            disabled={disabled}
          />
          {errors.sessions_count && <p className="text-sm text-red-600">{errors.sessions_count}</p>}
        </div>
        <div className="col-span-3 md:col-span-3 space-y-1">
          <Label className="text-sm font-medium text-slate-700">מספר תלמידים</Label>
          <Input
            type="number"
            min="1"
            value={segment.students_count}
            onChange={e => onChange(index, { students_count: e.target.value })}
            className="bg-white h-10 text-base leading-6"
            disabled={disabled}
          />
          {errors.students_count && <p className="text-sm text-red-600">{errors.students_count}</p>}
        </div>
        <div className="col-span-12 space-y-1">
          <Label className="text-sm font-medium text-slate-700">הערות</Label>
          <Textarea
            value={segment.notes ?? ''}
            onChange={e => onChange(index, { notes: e.target.value })}
            className="bg-white text-base leading-6"
            rows={2}
            maxLength={300}
            placeholder="הערה חופשית (לא חובה)"
            disabled={disabled}
          />
        </div>
        <div className="col-span-12 flex justify-end text-sm text-slate-700 mt-1">₪{total.toFixed(2)} :שכר לשורה</div>
      </div>
    </div>
  );
}
