import React from 'react';
import DayHeader from '../DayHeader.jsx';
import { Button } from '@/components/ui/button';

export default function SingleDayEntryShell({
  employee,
  date,
  showDayType = false,
  dayType,
  onDayTypeChange,
  segments,
  renderSegment,
  onAddSegment,
  addLabel,
  summary,
  onCancel
}) {
  return (
    <div className="flex flex-col w-full h-full">
      <div className="sticky top-0 z-20 bg-background border-b px-4 py-3">
        <DayHeader
          employee={employee}
          date={date}
          dayType={dayType}
          onChange={onDayTypeChange}
          hideDayType={!showDayType}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-28">
        {segments.map((segment, index) => {
          const content = renderSegment(segment, index);
          if (!content) {
            return null;
          }
          const key = segment && segment.id ? segment.id : index;
          return (
            <React.Fragment key={key}>
              {content}
            </React.Fragment>
          );
        })}
        {onAddSegment && (
          <Button type="button" variant="outline" onClick={onAddSegment} className="self-start">
            {addLabel}
          </Button>
        )}
        <div className="text-sm text-right text-slate-700 mt-3">{summary}</div>
      </div>
      <div className="sticky bottom-0 z-20 bg-background border-t px-4 py-3">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={onCancel} className="sm:order-1">בטל</Button>
          <Button type="submit" className="sm:order-2">שמור רישומים</Button>
        </div>
      </div>
    </div>
  );
}
