import React, { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const weekNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

const DayHeader = React.forwardRef(function DayHeader(
  { employee, date, dayType, onChange, dayTypeError, hideDayType = false },
  ref
) {
  const dayLabel = React.useMemo(() => {
    const d = new Date(date + 'T00:00:00');
    const dayName = weekNames[d.getDay()];
    const dayStr = d.toLocaleDateString('he-IL');
    return `${dayStr} · יום ${dayName}`;
  }, [date]);

  const firstBtnRef = useRef(null);
  useEffect(() => {
    firstBtnRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-3" ref={ref}>
      <div className="flex flex-col text-right">
        <div className="text-xl font-semibold truncate">{employee.name}</div>
        <div className="text-lg">{dayLabel}</div>
      </div>
      {!hideDayType && (
        <div>
          <Label className="text-sm font-medium text-slate-700">
            סוג יום<span className="text-red-600">*</span>
          </Label>
          <div className="mt-1 flex rounded-lg overflow-hidden ring-1 ring-slate-200" role="radiogroup">
            <Button
              ref={firstBtnRef}
              type="button"
              variant={dayType === 'regular' ? 'default' : 'ghost'}
              className="flex-1 h-10 rounded-none"
              onClick={() => onChange('regular')}
              aria-label="יום רגיל"
            >
              יום רגיל
            </Button>
            <Button
              type="button"
              variant={dayType === 'paid_leave' ? 'default' : 'ghost'}
              className="flex-1 h-10 rounded-none"
              onClick={() => onChange('paid_leave')}
              aria-label="חופשה"
            >
              חופשה
            </Button>
            <Button
              type="button"
              variant={dayType === 'adjustment' ? 'default' : 'ghost'}
              className="flex-1 h-10 rounded-none"
              onClick={() => onChange('adjustment')}
              aria-label="התאמות"
            >
              התאמות
            </Button>
          </div>
          {dayTypeError && <p className="text-sm text-red-600">יש לבחור סוג יום</p>}
          {employee?.employee_type === 'global' && (
            <p className="text-sm text-slate-600 mt-1">
              שכר גלובלי נספר לפי יום; הוספת מקטע שעות לא מכפילה שכר.
            </p>
          )}
        </div>
      )}
    </div>
  );
});

export default DayHeader;
