import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit, UserCheck, UserX, Phone, Mail, Calendar } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // We might not need tooltip, but it's good to have it just in case. Let's remove it later if unused.
import { ChevronsUpDown, ChevronDown } from "lucide-react";
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { fetchEmploymentScopePolicySettings } from '@/lib/settings-client.js';
import {
  EMPLOYMENT_SCOPE_DEFAULT_ENABLED_TYPES,
  normalizeEmploymentScopePolicy,
  getEmploymentScopeValue,
} from '@/constants/employment-scope.js';
import { getEmploymentScopeLabel } from '@/lib/translations.js';

const EMPLOYEE_TYPES = {
  hourly: 'עובד שעתי',
  instructor: 'מדריך',
  global: 'עובד גלובלי'
};

const GENERIC_RATE_SERVICE_ID = '00000000-0000-0000-0000-000000000000';

export default function EmployeeList({ employees, rateHistories, services, onEdit, onToggleActive, isLoading }) {
  const [openRows, setOpenRows] = useState({});
  const [employmentScopeEnabledTypes, setEmploymentScopeEnabledTypes] = useState(() => [...EMPLOYMENT_SCOPE_DEFAULT_ENABLED_TYPES]);
  const [isEmploymentScopePolicyLoading, setIsEmploymentScopePolicyLoading] = useState(false);
  const [employmentScopePolicyError, setEmploymentScopePolicyError] = useState('');
  const { session } = useSupabase();
  const { activeOrgId } = useOrg();

  const toggleRow = (employeeId) => {
    setOpenRows(prev => ({ ...prev, [employeeId]: !prev[employeeId] }));
  };

  const toggleAllRows = () => {
    const allInstructors = employees.filter(e => e.employee_type === 'instructor');
    if (allInstructors.length === 0) return;
    
    const isAnyOpen = allInstructors.some(e => openRows[e.id]);
    const newOpenState = {};
    allInstructors.forEach(e => {
      newOpenState[e.id] = !isAnyOpen;
    });
    setOpenRows(newOpenState);
  };

  useEffect(() => {
    if (!session || !activeOrgId) {
      setEmploymentScopeEnabledTypes([...EMPLOYMENT_SCOPE_DEFAULT_ENABLED_TYPES]);
      setEmploymentScopePolicyError('');
      return;
    }

    const abortController = new AbortController();
    let isMounted = true;

    async function loadEmploymentScopePolicy() {
      setIsEmploymentScopePolicyLoading(true);
      setEmploymentScopePolicyError('');
      try {
        const response = await fetchEmploymentScopePolicySettings({
          session,
          orgId: activeOrgId,
          signal: abortController.signal,
        });
        if (!isMounted) {
          return;
        }

        const normalized = normalizeEmploymentScopePolicy(response?.value);
        setEmploymentScopeEnabledTypes(normalized.enabledTypes);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        console.error('Failed to fetch employment scope policy', error);
        setEmploymentScopePolicyError('טעינת הגדרת היקף המשרה נכשלה. נעשה שימוש בערך ברירת המחדל.');
        setEmploymentScopeEnabledTypes([...EMPLOYMENT_SCOPE_DEFAULT_ENABLED_TYPES]);
      } finally {
        if (isMounted) {
          setIsEmploymentScopePolicyLoading(false);
        }
      }
    }

    loadEmploymentScopePolicy();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [session, activeOrgId]);

  const renderEmploymentScopeContent = (employee) => {
    if (isEmploymentScopePolicyLoading) {
      return <span className="text-xs text-slate-400">טוען...</span>;
    }

    const requiresScope = employmentScopeEnabledTypes.includes(employee.employee_type);
    const normalizedScope = getEmploymentScopeValue(employee);

    if (normalizedScope) {
      return <span className="text-slate-900">{getEmploymentScopeLabel(normalizedScope)}</span>;
    }

    if (requiresScope) {
      return <span className="text-xs font-medium text-red-600">נדרשת הגדרה</span>;
    }

    return null;
  };

  return (
    <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
      {employmentScopePolicyError ? (
        <div className="px-4 pt-4">
          <p className="text-sm text-amber-600">{employmentScopePolicyError}</p>
        </div>
      ) : null}
      <div className="p-2 border-b flex justify-end">
        <Button variant="ghost" size="sm" onClick={toggleAllRows}>
          <ChevronsUpDown className="w-4 h-4 ml-2" />
          פתח/סגור את כל הפירוטים
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]"></TableHead>
            <TableHead className="text-right">שם</TableHead>
            <TableHead className="text-right">סוג עובד</TableHead>
            <TableHead className="text-right">היקף משרה</TableHead>
            <TableHead className="text-right">תעריף / שכר</TableHead>
            <TableHead className="text-right">סטטוס</TableHead>
            <TableHead className="text-center">פעולות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array(5).fill(0).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
              </TableRow>
            ))
          ) : employees.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center h-24">לא נמצאו עובדים</TableCell>
            </TableRow>
          ) : (
            employees.map((employee) => {
              // --- לוגיקת חישוב התעריפים (נשארת זהה) ---
              let currentRate = null;
              if ((employee.employee_type === 'hourly' || employee.employee_type === 'global') && rateHistories) {
                const employeeRates = rateHistories.filter(r => r.employee_id === employee.id && r.service_id === GENERIC_RATE_SERVICE_ID).sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
                if (employeeRates.length > 0) currentRate = employeeRates[0].rate;
              }
              let instructorRatesDetails = [];
              if (employee.employee_type === 'instructor' && rateHistories && services) {
                const latestRates = {};
                rateHistories.filter(r => r.employee_id === employee.id && r.service_id).forEach(rate => {
                  if (!latestRates[rate.service_id] || new Date(rate.effective_date) > new Date(latestRates[rate.service_id].effective_date)) {
                    latestRates[rate.service_id] = rate.rate;
                  }
                });
                instructorRatesDetails = Object.keys(latestRates)
                  .filter(serviceId => serviceId !== GENERIC_RATE_SERVICE_ID)
                  .map(serviceId => {
                  const service = services.find(s => s.id === serviceId);
                  return { name: service?.name || 'שירות לא ידוע', rate: latestRates[serviceId] };
                });
              }

              const isRowOpen = openRows[employee.id] || false;
              // --- סוף לוגיקת חישוב התעריפים ---

              return (
                <React.Fragment key={employee.id}>
                  {/* --- שורת העובד הראשית --- */}
                  <TableRow className={`${!employee.is_active ? 'opacity-60' : ''}`}>
                    <TableCell className="py-2">
                      {employee.employee_type === 'instructor' && (
                        <Button variant="ghost" size="sm" onClick={() => toggleRow(employee.id)}>
                          <ChevronDown className={`w-4 h-4 transition-transform ${isRowOpen ? 'rotate-180' : ''}`} />
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="font-medium py-2">{employee.name}</TableCell>
                    <TableCell className="py-2">{EMPLOYEE_TYPES[employee.employee_type]}</TableCell>
                    <TableCell className="py-2">{renderEmploymentScopeContent(employee)}</TableCell>
                    <TableCell className="py-2">
                      {employee.employee_type !== 'instructor' && (currentRate !== null ? `₪${currentRate}` : '-')}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant={employee.is_active ? "default" : "secondary"} className={employee.is_active ? "bg-green-100 text-green-700" : "bg-slate-100"}>
                        {employee.is_active ? "פעיל" : "לא פעיל"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center py-2">
                      <div className="flex gap-2 justify-center">
                        <Button variant="outline" size="sm" onClick={() => onEdit(employee)}><Edit className="w-3 h-3" /></Button>
                        <Button variant={employee.is_active ? "destructive" : "default"} size="sm" onClick={() => onToggleActive(employee)}>
                          {employee.is_active ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* --- שורת התוכן הנפתחת (רק למדריכים) --- */}
                  {isRowOpen && employee.employee_type === 'instructor' && (
                    <TableRow className="bg-slate-50">
                      <TableCell colSpan={7} className="p-4">
                          <h4 className="font-semibold mb-3 text-slate-800">פירוט תעריפים:</h4>
                          {instructorRatesDetails.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                              {instructorRatesDetails.map(item => (
                                <div key={item.name} className="flex justify-between items-center p-2.5 rounded-md bg-white border border-slate-200 shadow-sm">
                                  <span className="text-sm text-slate-700">{item.name}</span>
                                  <Badge variant="secondary" className="text-sm font-mono">₪{item.rate}</Badge>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500 italic">אין תעריפים מוגדרים עבור מדריך זה.</p>
                          )}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </Card>
  );
}