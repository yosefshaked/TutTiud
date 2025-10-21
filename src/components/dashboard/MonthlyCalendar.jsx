import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, parseISO, addMonths, subMonths, isSameMonth, getYear, getMonth, setYear, setMonth, getDay } from "date-fns";
import { he } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from '@/components/ui/skeleton';

// קומפוננטת הפופ-אפ המותאמת אישית שלך, ללא שינוי
const PopoverBubble = React.forwardRef(function PopoverBubble({ anchor, children, onClose }, ref) {
  const [style, setStyle] = useState({});
  useEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setStyle({
      position: 'fixed', left: rect.left + rect.width / 2 - 140, top: rect.bottom + 16, zIndex: 99999,
      minWidth: 260, maxWidth: 340, background: 'linear-gradient(135deg, #f8fafc 80%, #e0e7ff 100%)',
      border: '1.5px solid #a5b4fc', borderRadius: 16, boxShadow: '0 6px 32px 0 rgba(60,60,120,0.18)',
      padding: '24px 20px 16px 20px', direction: 'rtl', transition: 'opacity 0.2s', fontFamily: 'inherit',
    });
  }, [anchor]);
  if (!anchor) return null;
  return ReactDOM.createPortal(
    <div ref={ref} style={style}>
      <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderBottom: '12px solid #a5b4fc' }} />
      <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderBottom: '10px solid #f8fafc' }} />
      <div style={{ marginTop: 8 }}>{children}</div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
        <button onClick={onClose} style={{ background: 'linear-gradient(90deg, #6366f1 0%, #60a5fa 100%)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 32px', fontSize: 17, fontWeight: 500, cursor: 'pointer' }}>סגור</button>
      </div>
    </div>,
    document.body
  );
});

const YEARS = Array.from({ length: 101 }, (_, i) => getYear(new Date()) - 50 + i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i);
const HEBREW_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export default function MonthlyCalendar({ currentDate, setCurrentDate, workSessions, employees, isLoading }) {
  const [popover, setPopover] = useState({ open: false, anchor: null, day: null, sessions: [] });
  const popoverBubbleRef = useRef();

  const closePopover = () => setPopover(p => ({ ...p, open: false }));

  useEffect(() => {
    if (!popover.open) return;
    const handleClick = (e) => {
      if (popoverBubbleRef.current && !popoverBubbleRef.current.contains(e.target) && popover.anchor && !popover.anchor.contains(e.target)) {
        closePopover();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [popover.open, popover.anchor]);

  if (isLoading || !workSessions || !employees) {
    return (
      <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader className="p-4 border-b"><Skeleton className="h-8 w-full" /></CardHeader>
        <CardContent className="p-4"><Skeleton className="h-60 w-full" /></CardContent>
      </Card>
    );
  }

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStartDay = new Date(new Date(monthStart).setDate(monthStart.getDate() - getDay(monthStart)));
  const calendarEndDay = new Date(new Date(monthEnd).setDate(monthEnd.getDate() + (6 - getDay(monthEnd))));
  const days = eachDayOfInterval({ start: calendarStartDay, end: calendarEndDay });
  
  const getSessionsForDate = (date) => workSessions.filter(session => format(parseISO(session.date), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'));
  
  const getUniqueEmployeesForDate = (date) => {
    const sessions = getSessionsForDate(date);
    const seen = new Set();
    return sessions.filter(s => {
      if (seen.has(s.employee_id)) return false;
      seen.add(s.employee_id);
      return true;
    });
  };
  
  const getEmployeeName = (employeeId) => employees.find(emp => emp.id === employeeId)?.name || 'לא ידוע';
  
  const navigateMonth = (direction) => setCurrentDate(direction === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
  const handleYearChange = (year) => setCurrentDate(setYear(currentDate, parseInt(year, 10)));
  const handleMonthChange = (month) => setCurrentDate(setMonth(currentDate, parseInt(month, 10)));

  return (
    <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
      <CardHeader className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigateMonth('prev')}><ChevronRight className="w-5 h-5" /></Button>
            <CardTitle className="flex items-center gap-2 text-xl font-bold text-slate-900 w-32 text-center">{format(currentDate, 'MMMM yyyy', { locale: he })}</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => navigateMonth('next')}><ChevronLeft className="w-5 h-5" /></Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={getMonth(currentDate).toString()} onValueChange={handleMonthChange}>
              <SelectTrigger className="w-[120px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map(month => (<SelectItem key={month} value={month.toString()}>{format(new Date(2000, month), 'MMMM', { locale: he })}</SelectItem>))}</SelectContent>
            </Select>
            <Select value={getYear(currentDate).toString()} onValueChange={handleYearChange}>
              <SelectTrigger className="w-[100px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>{YEARS.map(year => (<SelectItem key={year} value={year.toString()}>{year}</SelectItem>))}</SelectContent>
            </Select>
            <Button variant="outline" className="bg-white" onClick={() => setCurrentDate(new Date())}>היום</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-7 gap-2 mb-4">
          {HEBREW_DAYS.map((day) => <div key={day} className="text-center font-semibold text-slate-600 py-2">{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, index) => {
            const isCurrentDay = isToday(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const uniqueEmployees = getUniqueEmployeesForDate(day);
            return (
              <div
                key={index}
                className={`min-h-20 p-2 rounded-lg border flex flex-col transition-all duration-200 ${isCurrentDay ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'} ${!isCurrentMonth ? 'opacity-30' : ''} ${uniqueEmployees.length > 0 ? 'cursor-pointer' : ''}`}
                onClick={e => { if (isCurrentMonth && uniqueEmployees.length > 0) setPopover({ open: true, anchor: e.currentTarget, day, sessions: uniqueEmployees }); }}
              >
                <div className={`text-sm font-semibold mb-1 ${isCurrentDay ? 'text-blue-700' : 'text-slate-700'}`}>{format(day, 'd')}</div>
                <div className="space-y-1">
                  {uniqueEmployees.slice(0, 2).map((session) => (
                    <Badge key={session.id} variant="secondary" className="text-xs w-full justify-center bg-purple-100 text-purple-700 border-purple-200 truncate">
                      {getEmployeeName(session.employee_id).split(' ')[0]}
                    </Badge>
                  ))}
                  {uniqueEmployees.length > 2 && <Badge variant="outline" className="text-xs w-full justify-center text-slate-500">+{uniqueEmployees.length - 2}</Badge>}
                </div>
              </div>
            );
          })}
        </div>
        {popover.open && popover.anchor && (
          <PopoverBubble anchor={popover.anchor} ref={popoverBubbleRef} onClose={closePopover}>
            <div className="font-bold text-sm mb-2 text-center">כל העובדים ליום {format(popover.day, 'dd/MM/yyyy', { locale: he })}</div>
            <div className="space-y-2 mb-2">
              {popover.sessions.map((session) => (
                <div key={session.id} className="flex items-center gap-2 bg-slate-100 rounded px-2 py-1 text-xs text-slate-700 border border-slate-200">
                  <span className="font-semibold">{getEmployeeName(session.employee_id)}</span>
                </div>
              ))}
            </div>
          </PopoverBubble>
        )}
      </CardContent>
    </Card>
  );
}