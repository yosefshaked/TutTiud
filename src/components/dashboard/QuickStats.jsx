import React from 'react';
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { he } from "date-fns/locale";
import {
  computePeriodTotals,
  sumInstructorSessions
} from '@/lib/payroll.js';
import CombinedHoursCard from './CombinedHoursCard.jsx';
import {
  selectHourlyHours,
  selectMeetingHours,
  selectGlobalHours,
  selectLeaveDayValue,
} from '@/selectors.js';
import { sanitizeEmploymentScopeFilter } from '@/constants/employment-scope.js';

export default function QuickStats({ employees = [], workSessions = [], services = [], currentDate, filters = {}, leavePayPolicy, isLoading }) {
  const start = startOfMonth(currentDate);
  const end = endOfMonth(currentDate);
  const normalizedEmploymentScopes = React.useMemo(
    () => sanitizeEmploymentScopeFilter(filters.employmentScopes),
    [filters.employmentScopes],
  );
  const baseFilters = {
    dateFrom: format(start, 'yyyy-MM-dd'),
    dateTo: format(end, 'yyyy-MM-dd'),
    employeeType: filters.employeeType || 'all',
    selectedEmployee: filters.selectedEmployee || null,
    serviceId: filters.serviceId || 'all',
    employmentScopes: normalizedEmploymentScopes,
  };

  const totals = computePeriodTotals({
    workSessions,
    employees,
    services,
    startDate: baseFilters.dateFrom,
    endDate: baseFilters.dateTo,
    serviceFilter: baseFilters.serviceId,
    employeeFilter: baseFilters.selectedEmployee || '',
    employeeTypeFilter: baseFilters.employeeType,
    employmentScopeFilter: normalizedEmploymentScopes,
    leavePayPolicy,
    leaveDayValueSelector: selectLeaveDayValue,
  });

  const hourlyHours = selectHourlyHours(workSessions, employees, baseFilters);
  const meetingHours = selectMeetingHours(workSessions, services, employees, baseFilters);
  const globalHours = selectGlobalHours(workSessions, employees, baseFilters);
  const instructorSessions = sumInstructorSessions(workSessions, services, employees, baseFilters);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <CombinedHoursCard hourly={hourlyHours} meeting={meetingHours} global={globalHours} isLoading={isLoading} />
      <Card className="relative overflow-hidden bg-white/70 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader className="p-6">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600">סה״כ מפגשים (מדריכים)</p>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <CardTitle className="text-2xl md:text-3xl font-bold text-slate-900">{instructorSessions}</CardTitle>
              )}
            </div>
            <div className="p-3 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg">
              <Users className="w-5 h-5 text-white" />
            </div>
          </div>
        </CardHeader>
      </Card>
      <Card className="relative overflow-hidden bg-white/70 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader className="p-6">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600">{`סה״כ תשלום ל${format(currentDate, 'MMMM', { locale: he })}`}</p>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <CardTitle className="text-2xl md:text-3xl font-bold text-slate-900">₪{totals.totalPay.toLocaleString()}</CardTitle>
              )}
            </div>
            <div className="p-3 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
