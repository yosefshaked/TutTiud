import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Save, X, User, DollarSign } from "lucide-react";
import RateHistoryManager from './RateHistoryManager';
import { toast } from 'sonner';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { createEmployee, updateEmployee as updateEmployeeRequest } from '@/api/employees.js';
import { fetchEmploymentScopePolicySettings } from '@/lib/settings-client.js';
import {
  EMPLOYMENT_SCOPE_DEFAULT_ENABLED_TYPES,
  normalizeEmploymentScopePolicy,
  getEmploymentScopeValue,
} from '@/constants/employment-scope.js';
import { EMPLOYMENT_SCOPES, normalizeEmploymentScopeSystemValue } from '@/lib/translations.js';

const GENERIC_RATE_SERVICE_ID = '00000000-0000-0000-0000-000000000000';

export default function EmployeeForm({ employee, onSuccess, onCancel, services: servicesProp = [], rateHistories: rateHistoriesProp = [] }) {
  const [formData, setFormData] = useState({
    name: employee?.name || '',
    employee_id: employee?.employee_id || '',
    employee_type: employee?.employee_type || 'hourly',
    current_rate: '',
    phone: employee?.phone || '',
    email: employee?.email || '',
    start_date: employee?.start_date || new Date().toISOString().split('T')[0],
    is_active: employee?.is_active !== undefined ? employee.is_active : true,
    notes: employee?.notes || '',
    working_days: employee?.working_days || ['SUN','MON','TUE','WED','THU'],
    annual_leave_days: employee?.annual_leave_days ?? 0,
    employment_scope: employee ? getEmploymentScopeValue(employee) : '',
  });

  useEffect(() => {
    // This effect resets the form whenever the employee to be edited changes.
    setFormData({
      name: employee?.name || '',
      employee_id: employee?.employee_id || '',
      employee_type: employee?.employee_type || 'hourly',
      current_rate: '', // Always start with a blank rate
      phone: employee?.phone || '',
      email: employee?.email || '',
      start_date: employee?.start_date || new Date().toISOString().split('T')[0],
      is_active: employee?.is_active !== undefined ? employee.is_active : true,
      notes: employee?.notes || '',
      working_days: employee?.working_days || ['SUN','MON','TUE','WED','THU'],
      annual_leave_days: employee?.annual_leave_days ?? 0,
      employment_scope: employee ? getEmploymentScopeValue(employee) : '',
    });

    // Also reset the instructor-specific rates
    setServiceRates({});

  }, [employee]); // This dependency is crucial!

  const [services, setServices] = useState([]);
  const [rateHistory, setRateHistory] = useState([]);
  const [serviceRates, setServiceRates] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const { authClient, user, loading, session } = useSupabase();
  const { activeOrgId } = useOrg();
  const [employmentScopeEnabledTypes, setEmploymentScopeEnabledTypes] = useState(() => [...EMPLOYMENT_SCOPE_DEFAULT_ENABLED_TYPES]);
  const [isEmploymentScopeLoading, setIsEmploymentScopeLoading] = useState(false);
  const [employmentScopePolicyError, setEmploymentScopePolicyError] = useState('');
  const [employmentScopeFieldError, setEmploymentScopeFieldError] = useState('');

useEffect(() => {
  if (formData.employee_type === 'instructor') {
    const filtered = (servicesProp || [])
      .filter((service) => service && service.id !== GENERIC_RATE_SERVICE_ID)
      .sort((a, b) => (a?.name || '').localeCompare(b?.name || '', 'he'));
    setServices(filtered);
  } else {
    setServices([]);
  }
}, [formData.employee_type, servicesProp]);

useEffect(() => {
  if (employee) {
    const historyForEmployee = (rateHistoriesProp || []).filter((entry) => entry.employee_id === employee.id);
    setRateHistory(historyForEmployee);
    setFormData((prev) => ({ ...prev, current_rate: '' }));
  } else {
    setRateHistory([]);
  }
}, [employee, rateHistoriesProp]);

useEffect(() => {
  if (employee && rateHistory.length > 0) {
    const latestRatesByService = {};

    rateHistory.forEach((rate) => {
      const key = rate.service_id;
      if (!latestRatesByService[key] || new Date(rate.effective_date) > new Date(latestRatesByService[key].effective_date)) {
        latestRatesByService[key] = rate;
      }
    });

    const initialServiceRates = {};
    Object.keys(latestRatesByService).forEach((key) => {
      if (key !== GENERIC_RATE_SERVICE_ID) {
        initialServiceRates[key] = latestRatesByService[key].rate;
      }
    });
    setServiceRates(initialServiceRates);

    if (latestRatesByService[GENERIC_RATE_SERVICE_ID]) {
      setFormData((prev) => ({
        ...prev,
        current_rate: latestRatesByService[GENERIC_RATE_SERVICE_ID].rate,
      }));
    }
  }
}, [employee, rateHistory]);

useEffect(() => {
  if (!session || !activeOrgId) {
    setEmploymentScopeEnabledTypes([...EMPLOYMENT_SCOPE_DEFAULT_ENABLED_TYPES]);
    setEmploymentScopePolicyError('');
    return;
  }

  const abortController = new AbortController();
  let isMounted = true;

  async function loadEmploymentScopePolicy() {
    setIsEmploymentScopeLoading(true);
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
        setIsEmploymentScopeLoading(false);
      }
    }
  }

  loadEmploymentScopePolicy();

  return () => {
    isMounted = false;
    abortController.abort();
  };
}, [session, activeOrgId]);

  const shouldShowEmploymentScopeField = employmentScopeEnabledTypes.includes(formData.employee_type);

useEffect(() => {
  if (!shouldShowEmploymentScopeField) {
    setEmploymentScopeFieldError('');
  }
}, [shouldShowEmploymentScopeField]);

  const handleServiceRateChange = (serviceId, value) => {
    setServiceRates(prev => ({ ...prev, [serviceId]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (shouldShowEmploymentScopeField && isEmploymentScopeLoading) {
      toast.error('המתינו לטעינת היקף המשרה לפני השמירה.');
      return;
    }
    const normalizedEmploymentScope = normalizeEmploymentScopeSystemValue(formData.employment_scope);
    if (shouldShowEmploymentScopeField && !normalizedEmploymentScope) {
      const message = 'יש לבחור היקף משרה עבור סוג עובד זה.';
      setEmploymentScopeFieldError(message);
      toast.error(message);
      return;
    }

    setEmploymentScopeFieldError('');
    setIsLoading(true);
    try {
      if (!session) {
        throw new Error('יש להתחבר מחדש לפני שמירת השינויים.');
      }
      if (!activeOrgId) {
        throw new Error('בחרו ארגון פעיל לפני שמירת העובד.');
      }

      const { current_rate: currentRate, ...employeeDetails } = formData;
      if (shouldShowEmploymentScopeField) {
        employeeDetails.employment_scope = normalizedEmploymentScope;
      } else {
        delete employeeDetails.employment_scope;
      }
      const annualLeave = Number(employeeDetails.annual_leave_days);
      employeeDetails.annual_leave_days = Number.isNaN(annualLeave) ? 0 : annualLeave;

      const isNewEmployee = !employee;
      const today = new Date().toISOString().split('T')[0];
      const effectiveDate = isNewEmployee ? (employeeDetails.start_date || today) : today;
      const notes = isNewEmployee ? 'תעריף התחלתי' : 'שינוי תעריף';

      const existingHistory = isNewEmployee ? [] : rateHistory;
      const latestRates = {};
      existingHistory.forEach((entry) => {
        if (!entry) {
          return;
        }
        const key = entry.service_id;
        if (!key) {
          return;
        }
        if (!latestRates[key] || new Date(entry.effective_date) > new Date(latestRates[key].effective_date)) {
          latestRates[key] = entry;
        }
      });

      const nextRateUpdates = [];

      if (formData.employee_type === 'hourly' || formData.employee_type === 'global') {
        const rateValue = parseFloat(currentRate);
        const existingRate = latestRates[GENERIC_RATE_SERVICE_ID]
          ? parseFloat(latestRates[GENERIC_RATE_SERVICE_ID].rate)
          : null;
        if (!Number.isNaN(rateValue) && (isNewEmployee || existingRate === null || rateValue !== existingRate)) {
          if (existingHistory.some((entry) => entry.service_id === GENERIC_RATE_SERVICE_ID && entry.effective_date === today)) {
            toast.error('כבר קיים שינוי תעריף להיום. ערוך אותו באזור היסטוריית התעריפים.');
            setIsLoading(false);
            return;
          }
          nextRateUpdates.push({
            service_id: GENERIC_RATE_SERVICE_ID,
            effective_date: effectiveDate,
            rate: rateValue,
            notes,
          });
        }
      }

      if (formData.employee_type === 'instructor') {
        for (const [serviceId, rateValueRaw] of Object.entries(serviceRates)) {
          const rateValue = parseFloat(rateValueRaw);
          const existingRate = latestRates[serviceId]
            ? parseFloat(latestRates[serviceId].rate)
            : null;
          if (!Number.isNaN(rateValue) && (isNewEmployee || existingRate === null || rateValue !== existingRate)) {
            if (existingHistory.some((entry) => entry.service_id === serviceId && entry.effective_date === today)) {
              toast.error('כבר קיים שינוי תעריף להיום. ערוך אותו באזור היסטוריית התעריפים.');
              setIsLoading(false);
              return;
            }
            nextRateUpdates.push({
              service_id: serviceId,
              effective_date: effectiveDate,
              rate: rateValue,
              notes,
            });
          }
        }
      }

      let manualHistoryEntries = [];
      if (!isNewEmployee && rateHistory.length > 0) {
        const rateUpdateKeys = new Set(nextRateUpdates.map((entry) => `${entry.service_id}-${entry.effective_date}`));
        manualHistoryEntries = rateHistory
          .filter((entry) => !rateUpdateKeys.has(`${entry.service_id}-${entry.effective_date}`))
          .map(({ id, ...rest }) => ({
            ...rest,
            ...(id ? { id } : {}),
          }));
      }

      const payload = {
        employee: employeeDetails,
        rate_updates: nextRateUpdates,
        manual_rate_history: manualHistoryEntries,
      };

      if (isNewEmployee) {
        await createEmployee({
          session,
          orgId: activeOrgId,
          body: payload,
        });
        toast.success('העובד נוצר בהצלחה!');
      } else {
        await updateEmployeeRequest({
          session,
          orgId: activeOrgId,
          employeeId: employee.id,
          body: payload,
        });
        toast.success('פרטי העובד עודכנו בהצלחה!');
      }

      if (typeof onSuccess === 'function') {
        onSuccess();
      }
    } catch (error) {
      console.error('Form submission error', error);
      const message = error?.message || 'שמירת העובד נכשלה.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => {
      if (field === 'employee_type') {
        const shouldKeepScope = employmentScopeEnabledTypes.includes(value);
        return {
          ...prev,
          employee_type: value,
          employment_scope: shouldKeepScope ? prev.employment_scope : '',
        };
      }
      if (field === 'employment_scope') {
        return { ...prev, employment_scope: normalizeEmploymentScopeSystemValue(value) };
      }
      return { ...prev, [field]: value };
    });
    if (field === 'employee_type' || field === 'employment_scope') {
      setEmploymentScopeFieldError('');
    }
  };

  const toggleWorkingDay = (day) => {
    setFormData(prev => {
      const exists = prev.working_days.includes(day);
      const working_days = exists ? prev.working_days.filter(d => d !== day) : [...prev.working_days, day];
      return { ...prev, working_days };
    });
  };

  const daysMap = [
    { code: 'SUN', label: 'א׳' },
    { code: 'MON', label: 'ב׳' },
    { code: 'TUE', label: 'ג׳' },
    { code: 'WED', label: 'ד׳' },
    { code: 'THU', label: 'ה׳' },
    { code: 'FRI', label: 'ו׳' },
    { code: 'SAT', label: 'ש׳' },
  ];

  // Helper object for dynamic labels
  const rateLabels = {
    hourly: 'תעריף שעתי (₪) *',
    global: 'שכר חודשי (₪) *',
  };

  if (loading || !authClient) {
    return (
      <Card className="max-w-2xl mx-auto bg-white/80 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="p-6 border-b">
          <CardTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <User className="w-5 h-5 text-blue-500" />
            טוען חיבור Supabase...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="max-w-2xl mx-auto bg-white/80 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="p-6 border-b">
          <CardTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <User className="w-5 h-5 text-blue-500" />
            יש להתחבר לפני עריכת עובדים.
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (!activeOrgId) {
    return (
      <Card className="max-w-2xl mx-auto bg-white/80 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="p-6 border-b">
          <CardTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <User className="w-5 h-5 text-blue-500" />
            בחרו ארגון עם חיבור פעיל כדי לעדכן עובדים.
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto bg-white/80 backdrop-blur-sm border-0 shadow-xl">
      <CardHeader className="p-6 border-b">
        <CardTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <User className="w-5 h-5 text-blue-500" />
          {employee ? 'עריכת עובד' : 'הוספת עובד חדש'}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-semibold text-slate-700">שם מלא *</Label>
              <Input id="name" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="הכנס שם מלא" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee_id" className="text-sm font-semibold text-slate-700">מספר עובד</Label>
              <Input id="employee_id" value={formData.employee_id} onChange={(e) => handleChange('employee_id', e.target.value)} placeholder="מספר זהות עובד" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee_type" className="text-sm font-semibold text-slate-700">סוג עובד *</Label>
              <Select value={formData.employee_type} onValueChange={(value) => handleChange('employee_type', value)}>
                <SelectTrigger><SelectValue placeholder="בחר סוג עובד" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">עובד שעתי</SelectItem>
                  <SelectItem value="instructor">מדריך</SelectItem>
                  <SelectItem value="global">עובד גלובלי</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {shouldShowEmploymentScopeField && (
              <div className="space-y-2">
                <Label htmlFor="employment_scope" className="text-sm font-semibold text-slate-700">היקף משרה *</Label>
                <Select
                  value={formData.employment_scope || 'placeholder'}
                  onValueChange={(value) => {
                    if (value === 'placeholder') {
                      return;
                    }
                    handleChange('employment_scope', value);
                  }}
                  disabled={isEmploymentScopeLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isEmploymentScopeLoading ? 'טוען היקפי משרה...' : 'בחר היקף משרה...'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placeholder" disabled>
                      בחר היקף משרה...
                    </SelectItem>
                    {Object.entries(EMPLOYMENT_SCOPES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {employmentScopeFieldError && (
                  <p className="text-xs text-red-600">{employmentScopeFieldError}</p>
                )}
                {employmentScopePolicyError && (
                  <p className="text-xs text-amber-600">{employmentScopePolicyError}</p>
                )}
              </div>
            )}
            {(formData.employee_type === 'hourly' || formData.employee_type === 'global') && (
              <div className="space-y-2">
                <Label htmlFor="current_rate" className="text-sm font-semibold text-slate-700">
                  {rateLabels[formData.employee_type]}
                </Label>
                <Input 
                  id="current_rate" 
                  type="number" 
                  step="0.01" 
                  value={formData.current_rate} 
                  onChange={(e) => handleChange('current_rate', e.target.value)} 
                  placeholder="0.00" 
                  required 
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-semibold text-slate-700">טלפון</Label>
              <Input id="phone" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} placeholder="050-1234567" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-slate-700">אימייל</Label>
              <Input id="email" type="email" value={formData.email} onChange={(e) => handleChange('email', e.target.value)} placeholder="example@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start_date" className="text-sm font-semibold text-slate-700">תאריך התחלה</Label>
              <Input id="start_date" type="date" value={formData.start_date} onChange={(e) => handleChange('start_date', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="annual_leave_days" className="text-sm font-semibold text-slate-700">מכסת חופשה שנתית (ימים)</Label>
              <Input
                id="annual_leave_days"
                type="number"
                min={0}
                step="0.5"
                value={formData.annual_leave_days}
                onChange={(e) => handleChange('annual_leave_days', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="is_active" className="text-sm font-semibold text-slate-700">סטטוס עובד</Label>
              <div className="flex items-center gap-3 pt-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => handleChange('is_active', checked)}
                />
                <span className="text-sm text-slate-600">{formData.is_active ? 'פעיל' : 'לא פעיל'}</span>
              </div>
            </div>
            {formData.employee_type === 'global' && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">ימי עבודה</Label>
                <div className="grid grid-cols-7 gap-2">
                  {daysMap.map(d => (
                    <div key={d.code} className="flex flex-col items-center">
                      <Switch checked={formData.working_days.includes(d.code)} onCheckedChange={() => toggleWorkingDay(d.code)} />
                      <span className="text-xs mt-1">{d.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {formData.employee_type === 'instructor' && (
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                תעריפים לפי שירות
              </h3>
              {services.length === 0 ? <p className="text-sm text-slate-500">טוען שירותים...</p> : (
                <div className="space-y-3">
                  {services.map(service => (
                    <div key={service.id} className="grid grid-cols-3 gap-4 items-center">
                      <Label htmlFor={`rate-${service.id}`} className="col-span-1">{service.name}</Label>
                      <div className="col-span-2">
                        <Input
                          id={`rate-${service.id}`}
                          type="number"
                          step="0.01"
                          placeholder="הזן תעריף"
                          value={serviceRates[service.id] || ''}
                          onChange={(e) => handleServiceRateChange(service.id, e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {employee && (
            <div className="space-y-4 pt-4 border-t">
              <RateHistoryManager
                rateHistory={rateHistory}
                services={services}
                employeeType={formData.employee_type}
                onChange={setRateHistory}
              />
            </div>
          )}
          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={isLoading} className="flex-1 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white">
              <Save className="w-4 h-4 ml-2" />
              {isLoading ? "שומר..." : (employee ? 'עדכן עובד' : 'הוסף עובד')}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading} className="flex-1">
              <X className="w-4 h-4 ml-2" />
              בטל
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}