import React from 'react';
import { createLeaveDayValueResolver, resolveLeaveSessionValue } from '@/lib/payroll.js';
import { collectGlobalDayAggregates } from '@/lib/global-day-aggregator.js';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, TrendingUp } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval } from "date-fns";
import { he } from "date-fns/locale";
import { isLeaveEntryType } from '@/lib/leave.js';
import { selectLeaveDayValue } from '@/selectors.js';

export default function MonthlyReport({ sessions, employees, services, workSessions = [], leavePayPolicy, isLoading }) {
  const resolveLeaveValue = React.useMemo(() => createLeaveDayValueResolver({
    employees,
    workSessions,
    services,
    leavePayPolicy,
    leaveDayValueSelector: selectLeaveDayValue,
  }), [employees, workSessions, services, leavePayPolicy]);

  const resolvePayment = (session) => {
    const employee = employees.find(emp => emp.id === session.employee_id);
    if (!employee || employee.employee_type === 'global') return Number(session.total_payment) || 0;
    if (!isLeaveEntryType(session.entry_type) || session.payable === false) return Number(session.total_payment) || 0;
    const { amount, preStartDate } = resolveLeaveSessionValue(session, resolveLeaveValue, { employee });
    if (preStartDate) return 0;
    if (typeof amount === 'number' && Number.isFinite(amount)) return amount;
    return Number(session.total_payment) || 0;
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-40" />)}
      </div>
    );
  }

  const getEmployeeName = (employeeId) => employees.find(emp => emp.id === employeeId)?.name || 'לא ידוע';
  
  // Logic to determine date range from filtered sessions or default to last 6 months
  let startDate, endDate;
  if (sessions.length > 0) {
    const dates = sessions.map(s => parseISO(s.date));
    startDate = new Date(Math.min(...dates));
    endDate = new Date(Math.max(...dates));
  } else {
    endDate = new Date();
    startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 5, 1);
  }
  const months = eachMonthOfInterval({ start: startDate, end: endDate });

  const monthlyData = months.map(month => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const monthSessions = (workSessions.length ? workSessions : sessions).filter(session => {
      const sessionDate = parseISO(session.date);
      return sessionDate >= monthStart && sessionDate <= monthEnd;
    });

    let totalPayment = 0;
    let totalHours = 0;
    let totalSessions = 0;
    let totalStudents = 0;
    const employeePayments = {};
    const employeesById = Object.fromEntries(employees.map(e => [e.id, e]));
    const agg = collectGlobalDayAggregates(monthSessions, employeesById);
    monthSessions.forEach(session => {
      const emp = employeesById[session.employee_id];
      if (!emp || (emp.start_date && session.date < emp.start_date)) return;
      const isLeave = isLeaveEntryType(session.entry_type);
      const isGlobalDay = emp.employee_type === 'global' && (session.entry_type === 'hours' || isLeave);
      if (!isGlobalDay) totalPayment += resolvePayment(session);
      if (session.entry_type === 'session') {
        totalSessions += session.sessions_count || 0;
        totalStudents += (session.students_count || 0) * (session.sessions_count || 0);
        const service = services.find(s => s.id === session.service_id);
        if (service && service.duration_minutes) {
          totalHours += (service.duration_minutes / 60) * (session.sessions_count || 0);
        }
      } else if (session.entry_type === 'hours') {
        totalHours += session.hours || 0;
      }
      const val = isGlobalDay ? 0 : resolvePayment(session);
      employeePayments[session.employee_id] = (employeePayments[session.employee_id] || 0) + val;
    });
    agg.forEach((v, key) => {
      const [empId] = key.split('|');
      totalPayment += v.dailyAmount;
      employeePayments[empId] = (employeePayments[empId] || 0) + v.dailyAmount;
    });

    const topEmployeeId = Object.keys(employeePayments).reduce((a, b) =>
      employeePayments[a] > employeePayments[b] ? a : b, null
    );

    return {
      month: format(month, 'MMMM yyyy', { locale: he }),
      totalPayment,
      totalHours: Math.round(totalHours * 10) / 10,
      sessionsCount: totalSessions,
      studentsCount: totalStudents,
      topEmployee: topEmployeeId ? getEmployeeName(topEmployeeId) : '-',
      topEmployeePayment: topEmployeeId ? employeePayments[topEmployeeId] : 0
    };
  }).reverse();

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">דוח חודשי מסונן</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {monthlyData.map((monthData, index) => (
          <Card key={index} className="bg-gradient-to-br from-white to-slate-50 border-0 shadow-lg">
            <CardHeader className="p-4 border-b">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="w-5 h-5 text-blue-500" />
                {monthData.month}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center"><span className="text-sm text-slate-600">סה״כ תשלום:</span><span className="font-semibold text-slate-900">₪{monthData.totalPayment.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-slate-600">שעות:</span><span className="font-medium text-slate-800">{monthData.totalHours}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-slate-600">מפגשים:</span><span className="font-medium text-slate-800">{monthData.sessionsCount}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-slate-600">תלמידים:</span><span className="font-medium text-slate-800">{monthData.studentsCount}</span></div>
              {monthData.topEmployee !== '-' && (
                <div className="pt-2 border-t">
                  <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-green-500" /><span className="text-sm font-medium text-slate-700">עובד מוביל:</span></div>
                  <p className="text-sm text-slate-900 font-medium">{monthData.topEmployee}</p>
                  <p className="text-xs text-slate-600">₪{monthData.topEmployeePayment.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}