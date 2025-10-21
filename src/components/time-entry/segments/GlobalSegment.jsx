import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Copy, Trash2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { InfoTooltip } from '@/components/InfoTooltip.jsx';

export default function GlobalSegment({
  segment,
  index,
  onChange,
  onDuplicate,
  onDelete,
  isFirst,
  dailyRate,
  error,
  disabled = false,
}) {
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
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <Label className="text-sm font-medium text-slate-700">שעות</Label>
            <InfoTooltip text="בגלובלי השכר מחושב לפי יום; שדה השעות להצגה בלבד." />
          </div>
          <Input
            type="number"
            step="0.25"
            min="0"
            value={segment.hours}
            onChange={e => onChange(index, { hours: e.target.value })}
            className="bg-white h-10 text-base leading-6"
            disabled={disabled}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="space-y-1">
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
      </div>
      <div className="mt-4 text-sm text-right text-slate-700">
        ₪{dailyRate.toFixed(2)} :שכר לשורה
        {!isFirst && <span className="block text-xs text-slate-500">נספר לפי יום — רישום זה לא מכפיל שכר</span>}
      </div>
    </div>
  );
}
