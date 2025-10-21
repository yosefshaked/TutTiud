/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, Trash2, Copy } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { InfoTooltip } from '@/components/InfoTooltip.jsx';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { calculateGlobalDailyRate } from '@/lib/payroll.js';
import { isLeaveEntryType } from '@/lib/leave.js';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function computeRowPayment(row, employee, services, getRateForDate, options = {}) {
  const isHourlyOrGlobal = employee.employee_type === 'hourly' || employee.employee_type === 'global';
  const { rate } = getRateForDate(employee.id, row.date, isHourlyOrGlobal ? null : row.service_id);
  if (employee.employee_type === 'hourly') {
    return (parseFloat(row.hours) || 0) * rate;
  }
  if (employee.employee_type === 'global') {
    if (row.dayType === 'paid_leave') {
      const resolver = typeof options.leaveValueResolver === 'function' ? options.leaveValueResolver : null;
      if (resolver) {
        const resolved = resolver(employee.id, row.date);
        if (typeof resolved === 'number' && Number.isFinite(resolved) && resolved > 0) {
          return resolved;
        }
      }
    }
    try {
      return calculateGlobalDailyRate(employee, row.date, rate);
    } catch {
      return 0;
    }
  }
  if (employee.employee_type === 'instructor') {
    const service = services.find(s => s.id === row.service_id);
    if (service) {
      if (service.payment_model === 'per_student') {
        return (parseInt(row.sessions_count, 10) || 1) * (parseInt(row.students_count, 10) || 0) * rate;
      }
      return (parseInt(row.sessions_count, 10) || 1) * rate;
    }
  }
  return 0;
}

export default function EntryRow({
  value,
  onChange,
  onCopyField,
  employee,
  services,
  getRateForDate,
  leaveValueResolver = null,
  allowRemove = false,
  onRemove,
  showSummary = true,
  readOnlyDate = false,
  flashField = null,
  errors = {},
  rowId,
  isDuplicate = false,
  hideDayType = false
}) {
  const row = value;
  const handleChange = (field, val) => onChange({ [field]: val });
  const selectedService = services.find(s => s.id === row.service_id);
  const rowPayment = computeRowPayment(row, employee, services, getRateForDate, { leaveValueResolver });
  const [flash, setFlash] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const archiveSummary = useMemo(() => {
    if (!row?.date) return '';
    const dateLabel = format(new Date(row.date + 'T00:00:00'), 'dd/MM/yyyy');
    const base = `רישום עבור ${employee.name} בתאריך ${dateLabel}`;
    if (employee.employee_type === 'instructor') {
      const meetings = row.sessions_count ? Number(row.sessions_count) : null;
      return meetings ? `${base} • ${meetings} מפגשים` : base;
    }
    if (row.hours) {
      return `${base} • שעות ${row.hours}`;
    }
    return base;
  }, [employee.name, employee.employee_type, row.date, row.hours, row.sessions_count]);

  const closeConfirmDialog = () => {
    setConfirmOpen(false);
    setIsRemoving(false);
  };

  const handleConfirmRemoval = async () => {
    if (isRemoving) {
      return;
    }
    try {
      setIsRemoving(true);
      await onRemove();
      closeConfirmDialog();
    } catch (error) {
      setIsRemoving(false);
      throw error;
    }
  };

  useEffect(() => {
    if (flashField) {
      setFlash(flashField);
      const t = setTimeout(() => setFlash(null), 400);
      return () => clearTimeout(t);
    }
  }, [flashField]);

  const CopyBtn = (field) => (
    onCopyField ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            data-role={field === 'dayType' ? 'copy-prev-daytype' : 'copy-prev'}
            onClick={() => onCopyField(field)}
            className="h-6 w-6"
            aria-label={field === 'dayType' ? 'העתק סוג יום מהרישום הקודם' : 'העתק מהרישום הקודם'}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {field === 'dayType' ? 'העתק סוג יום מהרישום הקודם' : 'העתק מהרישום הקודם'}
        </TooltipContent>
      </Tooltip>
    ) : null
  );

  return (
    <div
      className="w-full rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-4 md:p-5 relative focus-within:ring-2 focus-within:ring-sky-300"
      id={rowId}
    >
      {readOnlyDate ? (
        <div className="flex justify-between mb-3">
          <div className="text-xs font-medium text-slate-600 bg-slate-50 ring-1 ring-slate-200 rounded-full px-2 py-0.5">
            {format(new Date(row.date + 'T00:00:00'), 'dd/MM')}
          </div>
          {allowRemove && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setConfirmOpen(true)}
              className="h-7 w-7 text-red-500 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1 mb-3">
          <Label className="flex items-center gap-1 text-sm font-medium text-slate-700">
            {CopyBtn('date')}
            <span>תאריך</span>
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-right font-normal bg-white h-10 text-base leading-6"
              >
                <CalendarIcon className="ml-2 h-4 w-4" />
                {format(new Date(row.date + 'T00:00:00'), 'dd/MM/yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={new Date(row.date + 'T00:00:00')}
                onSelect={(d) => d && handleChange('date', format(d, 'yyyy-MM-dd'))}
                initialFocus
                locale={he}
              />
            </PopoverContent>
          </Popover>
          {allowRemove && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              className="h-7 w-7 text-red-500 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {employee.employee_type !== 'global' && isLeaveEntryType(row.entry_type) && (
        <div className="mb-3 p-2 rounded-md bg-blue-50 text-blue-700 text-sm">
          רישום חופשה היסטורי עבור סוג עובד שאינו נתמך; לא ניתן ליצור רישום חופשה חדש עבור סוג זה.
        </div>
      )}

      <div className="grid grid-cols-12 gap-x-4 gap-y-4 mt-3 auto-rows-auto items-start">
        {employee.employee_type === 'hourly' && (
          <div className={`space-y-1 min-w-0 col-span-12 sm:col-span-6 md:col-span-4 ${flash === 'hours' ? 'ring-2 ring-sky-300 rounded-md p-1' : ''}`}>
            <Label className="flex items-center gap-1 text-sm font-medium text-slate-700">
              {CopyBtn('hours')}
              <span>שעות עבודה</span>
            </Label>
            <Input
              type="number"
              step="0.25"
              value={row.hours}
              onChange={(e) => handleChange('hours', e.target.value)}
              required
              className="w-full bg-white h-10 text-base leading-6"
            />
            {errors.hours && <p className="text-sm text-red-600 mt-1">{errors.hours}</p>}
          </div>
        )}

        {employee.employee_type === 'global' && (
          <>
            {!hideDayType && (
              <div className={`space-y-1 min-w-0 col-span-12 sm:col-span-6 md:col-span-4 ${flash === 'entry_type' ? 'ring-2 ring-sky-300 rounded-md p-1' : ''}`}>
                <Label className="flex items-center gap-1 text-sm font-medium text-slate-700">
                  {CopyBtn('dayType')}
                  <span>סוג יום</span>
                </Label>
                <Select value={row.dayType || ''} onValueChange={(v) => handleChange('dayType', v)}>
                  <SelectTrigger className="bg-white h-10 text-base leading-6">
                    <SelectValue placeholder="בחר סוג יום" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">יום רגיל</SelectItem>
                    <SelectItem value="paid_leave">חופשה בתשלום</SelectItem>
                  </SelectContent>
                </Select>
                {errors.dayType && <p className="text-sm text-red-600 mt-1">{errors.dayType}</p>}
              </div>
            )}
            <div className={`space-y-1 min-w-0 col-span-12 sm:col-span-6 md:col-span-4 ${flash === 'hours' ? 'ring-2 ring-sky-300 rounded-md p-1' : ''}`}>
              <Label className="flex items-center gap-1 text-sm font-medium text-slate-700">
                {CopyBtn('hours')}
                <span className="flex items-center gap-1">שעות<InfoTooltip text="בגלובלי השכר מחושב לפי יום; שדה השעות להצגה בלבד." /></span>
              </Label>
              <Input
                type="number"
                step="0.25"
                value={row.hours}
                onChange={(e) => handleChange('hours', e.target.value)}
                required={row.isNew}
                min={row.isNew ? 0.1 : 0}
                className="w-full bg-white h-10 text-base leading-6"
              />
              {errors.hours && <p className="text-sm text-red-600 mt-1">{errors.hours}</p>}
            </div>
          </>
        )}

        {employee.employee_type === 'instructor' && (
          <div className={`space-y-1 min-w-0 col-span-12 md:col-span-7 lg:col-span-8 ${flash === 'service_id' ? 'ring-2 ring-sky-300 rounded-md p-1' : ''}`}>
            <Label className="flex items-center gap-1 text-sm font-medium text-slate-700">
              {CopyBtn('service_id')}
              <span>שירות</span>
            </Label>
            <Select value={row.service_id} onValueChange={(v) => handleChange('service_id', v)}>
              <SelectTrigger className="bg-white whitespace-normal break-words min-h-10 py-2 leading-5">
                <SelectValue placeholder="בחר שירות..." />
              </SelectTrigger>
              <SelectContent>
                {services.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.service_id && <p className="text-sm text-red-600 mt-1">{errors.service_id}</p>}
          </div>
        )}

        {employee.employee_type === 'instructor' && selectedService && (
          <>
            <div className={`space-y-1 min-w-0 col-span-6 md:col-span-3 lg:col-span-2 ${flash === 'sessions_count' ? 'ring-2 ring-sky-300 rounded-md p-1' : ''}`}>
              <Label className="flex items-center gap-1 text-sm font-medium text-slate-700">
                {CopyBtn('sessions_count')}
                <span>כמות מפגשים</span>
              </Label>
              <Input
                type="number"
                value={row.sessions_count}
                onChange={(e) => handleChange('sessions_count', e.target.value)}
                className="w-full bg-white h-10 text-base leading-6"
              />
              {errors.sessions_count && <p className="text-sm text-red-600 mt-1">{errors.sessions_count}</p>}
            </div>
            {selectedService.payment_model === 'per_student' && (
              <div className={`space-y-1 min-w-0 col-span-6 md:col-span-2 lg:col-span-2 ${flash === 'students_count' ? 'ring-2 ring-sky-300 rounded-md p-1' : ''}`}>
                <Label className="flex items-center gap-1 text-sm font-medium text-slate-700">
                  {CopyBtn('students_count')}
                  <span>כמות תלמידים</span>
                </Label>
                <Input
                  type="number"
                  value={row.students_count}
                  onChange={(e) => handleChange('students_count', e.target.value)}
                  className="w-full bg-white h-10 text-base leading-6"
                />
                {errors.students_count && <p className="text-sm text-red-600 mt-1">{errors.students_count}</p>}
              </div>
            )}
          </>
        )}

        {employee.employee_type !== 'instructor' && employee.employee_type !== 'hourly' && employee.employee_type !== 'global' && null}

        <div className="space-y-1 col-span-12 min-w-0">
          <Label className="text-sm font-medium text-slate-700">הערות</Label>
          <Textarea
            value={row.notes ?? ''}
            onChange={(e) => handleChange('notes', e.target.value)}
            className="bg-white text-base leading-6 min-h-[88px] resize-y"
            placeholder="הערה חופשית (לא חובה)"
            maxLength={300}
          />
        </div>

      </div>

      {showSummary && (
        <div className="mt-4 text-sm text-right text-slate-700">
          סה"כ לשורה: <span className="font-bold">₪{rowPayment.toFixed(2)}</span>
          {isDuplicate && (
            <span className="block text-xs text-slate-500">נספר לפי יום — רישום זה לא מכפיל שכר</span>
          )}
        </div>
      )}
      {allowRemove && (
        <AlertDialog
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeConfirmDialog();
            } else {
              setConfirmOpen(true);
            }
          }}
        >
          <AlertDialogContent dir="rtl" className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>מחיקת רישום</AlertDialogTitle>
              <AlertDialogDescription>
                האם למחוק את הרישום? הרישום יועבר לסל האשפה. מומלץ למחוק פריטים מסל האשפה לצמיתות לאחר 90 יום.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {archiveSummary ? (
              <p className="text-sm text-slate-600">{archiveSummary}</p>
            ) : null}
            <AlertDialogFooter className="flex flex-row-reverse gap-2 sm:flex-row">
              <AlertDialogCancel onClick={closeConfirmDialog} disabled={isRemoving}>
                בטל
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmRemoval}
                className="bg-sky-600 hover:bg-sky-700"
                disabled={isRemoving}
              >
                כן, העבר לארכיון
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

