import React, { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { he } from "date-fns/locale";
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ActivityBadge from '@/components/ui/ActivityBadge.jsx';
import { getActivityDisplayDetails } from '@/lib/activity-helpers.js';
import { isLeaveEntryType } from '@/lib/leave.js';
import { createLeaveDayValueResolver, resolveLeaveSessionValue } from '@/lib/payroll.js';
import { selectLeaveDayValue } from '@/selectors.js';
import { getEmploymentScopeValue } from '@/constants/employment-scope.js';
import { getEmploymentScopeLabel } from '@/lib/translations.js';

export default function DetailedEntriesReport({
  sessions,
  employees,
  services,
  leavePayPolicy,
  workSessions = [],
  isLoading,
  initialGroupBy = 'none',
  showEmploymentScopeColumn = false,
}) {
  const [groupBy, setGroupBy] = useState(initialGroupBy);
  const EMPLOYEE_TYPE_LABELS = { global: 'גלובלי', hourly: 'שעתי', instructor: 'מדריך' };

  const resolveLeaveValue = useMemo(() => createLeaveDayValueResolver({
    employees,
    workSessions,
    services,
    leavePayPolicy,
    leaveDayValueSelector: selectLeaveDayValue,
  }), [employees, workSessions, services, leavePayPolicy]);

  const servicesById = useMemo(() => {
    if (!Array.isArray(services)) {
      return new Map();
    }
    const map = new Map();
    services.forEach((service) => {
      if (service && service.id != null) {
        map.set(service.id, service);
      }
    });
    return map;
  }, [services]);

  if (isLoading) {
    return <Skeleton className="h-60 w-full" />;
  }

  const getEmployee = (employeeId) => employees.find(emp => emp.id === employeeId);

  const getService = (serviceId) => servicesById.get(serviceId);

  const getActivityDetails = (session, employeeOverride) => {
    const employee = employeeOverride || getEmployee(session.employee_id);
    const service = getService(session.service_id);
    return getActivityDisplayDetails({
      ...session,
      employee,
      service,
    });
  };
  
  const sortedSessions = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));

  const sessionHours = (session) => {
    const emp = getEmployee(session.employee_id);
    if (!emp) return 0;
    if (session.entry_type === 'hours') return parseFloat(session.hours) || 0;
    if (session.entry_type === 'session') {
      if (session.hours != null) return parseFloat(session.hours) || 0;
      const service = getService(session.service_id);
      if (service?.duration_minutes) return (service.duration_minutes / 60) * (session.sessions_count || 0);
    }
    return 0;
  };

  // --- לוגיקת הקיבוץ ---
  const groupedSessions = sortedSessions.reduce((acc, session) => {
    let key;
    if (groupBy === 'date') key = session.date;
    else if (groupBy === 'service') key = getActivityDetails(session).label;
    else if (groupBy === 'employee') key = getEmployee(session.employee_id)?.name || 'לא ידוע';
    else if (groupBy === 'employeeType') key = EMPLOYEE_TYPE_LABELS[getEmployee(session.employee_id)?.employee_type] || 'לא ידוע';
    
    if (key && groupBy !== 'none') {
      if (!acc[key]) acc[key] = [];
      acc[key].push(session);
    }
    return acc;
  }, {});
  const sortedGroupEntries = Object.entries(groupedSessions);

  const resolvePayment = (session) => {
    const employee = getEmployee(session.employee_id);
    if (!employee || employee.employee_type === 'global') return Number(session.total_payment) || 0;
    if (!isLeaveEntryType(session.entry_type) || session.payable === false) return Number(session.total_payment) || 0;
    const { amount, preStartDate } = resolveLeaveSessionValue(session, resolveLeaveValue, { employee });
    if (preStartDate) return 0;
    if (typeof amount === 'number' && Number.isFinite(amount)) return amount;
    return Number(session.total_payment) || 0;
  };

  const renderSessionRow = (session) => {
    const employee = getEmployee(session.employee_id);
    const activityDetails = getActivityDetails(session, employee);
    const payment = resolvePayment(session);
    const employmentScopeValue = getEmploymentScopeValue(employee);
    const employmentScopeLabel = employmentScopeValue
      ? getEmploymentScopeLabel(employmentScopeValue)
      : '';
    const isHourlyOrGlobal = employee?.employee_type === 'hourly' || employee?.employee_type === 'global';
    return (
      <TableRow key={session.id} className="hover:bg-slate-50">
        <TableCell className="font-medium text-center">{employee?.name || 'לא ידוע'}</TableCell>
        {showEmploymentScopeColumn ? (
          <TableCell className="text-center">{employmentScopeLabel || '—'}</TableCell>
        ) : null}
        <TableCell className="text-center">{format(parseISO(session.date), 'dd/MM/yyyy', { locale: he })}</TableCell>
        <TableCell className="w-64 items-start text-center">
          <ActivityBadge
            label={activityDetails.label}
            color={activityDetails.color}
            variant={activityDetails.variant}
            title={activityDetails.label}
          />
        </TableCell>
        <TableCell className="text-center">
          {isHourlyOrGlobal ? `${session.hours || 0} שעות` : `${session.sessions_count || 0} מפגשים`}
        </TableCell>
        <TableCell className="text-center">{session.students_count || '-'}</TableCell>
        <TableCell className="text-center">₪{session.rate_used?.toFixed(2) || '0.00'}</TableCell>
        <TableCell className="font-semibold text-center">₪{payment.toFixed(2)}</TableCell>
        <TableCell className="text-sm text-slate-600">{session.notes || '-'}</TableCell>
      </TableRow>
    );
  };



  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">רישומי עבודה מפורטים</h3>
        <div className="flex gap-2 items-center">
          <Label className="text-sm font-medium text-slate-600">קבץ לפי:</Label>
          <Select onValueChange={setGroupBy} defaultValue={initialGroupBy}>
            <SelectTrigger className="w-[180px] bg-white border-slate-300"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">ללא קיבוץ</SelectItem>
              <SelectItem value="date">תאריך</SelectItem>
              <SelectItem value="service">סוג רישום</SelectItem>
              <SelectItem value="employee">שם עובד</SelectItem>
              <SelectItem value="employeeType">סוג עובד</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {sessions.length === 0 ? (
        <div className="text-center py-8 text-slate-500"><p>אין נתונים להצגה עבור המסננים שנבחרו</p></div>
      ) : (
        <div className="overflow-x-auto border rounded-lg bg-white">
          {groupBy === 'none' ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="text-center">עובד</TableHead>
                  {showEmploymentScopeColumn ? <TableHead className="text-center">היקף משרה</TableHead> : null}
                  <TableHead className="text-center">תאריך</TableHead>
                  <TableHead className="w-64 text-center">סוג רישום</TableHead>
                  <TableHead className="text-center">כמות</TableHead>
                  <TableHead className="text-center">תלמידים</TableHead>
                  <TableHead className="text-center">תעריף</TableHead>
                  <TableHead className="text-center">סה״כ</TableHead>
                  <TableHead className="text-center">הערות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{sortedSessions.map(session => renderSessionRow(session))}</TableBody>
            </Table>
          ) : (
            sortedGroupEntries.map(([group, groupSessions]) => (
              <div key={group} className="mb-2">
                <h4 className="sticky top-0 z-10 font-bold text-base p-2 bg-slate-100 border-b border-t">
                  {group} – ₪{groupSessions.reduce((s, r) => s + resolvePayment(r), 0).toFixed(2)} • {groupSessions.reduce((s, r) => s + sessionHours(r), 0).toFixed(1)} שעות
                </h4>
                <Table>
                  <TableBody>{groupSessions.map(session => renderSessionRow(session))}</TableBody>
                </Table>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}