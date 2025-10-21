import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ChevronDown, Info, Loader2, ShieldCheck } from 'lucide-react';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { updateEmployee } from '@/api/employees.js';
import { selectLeaveRemaining } from '@/selectors.js';
import {
  DEFAULT_LEAVE_POLICY,
  DEFAULT_LEAVE_PAY_POLICY,
  LEAVE_PAY_METHOD_OPTIONS,
  LEAVE_PAY_METHOD_DESCRIPTIONS,
  LEAVE_PAY_METHOD_LABELS,
  formatLeaveHistoryEntryType,
  resolveLeavePayMethodContext,
} from '@/lib/leave.js';

const OVERRIDE_METHOD_PLACEHOLDER_VALUE = '__no_override__';

function normalizeDateValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  const stringValue = String(value).trim();
  if (!stringValue) return null;
  const direct = new Date(stringValue);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }
  const isoCandidate = `${stringValue.slice(0, 10)}T00:00:00`;
  const isoParsed = new Date(isoCandidate);
  if (!Number.isNaN(isoParsed.getTime())) {
    return isoParsed;
  }
  return null;
}

function formatLedgerDate(value) {
  const parsed = normalizeDateValue(value);
  if (!parsed) {
    return '—';
  }
  try {
    return format(parsed, 'dd/MM/yyyy');
  } catch {
    return parsed.toISOString().slice(0, 10);
  }
}

function parseEntryMetadata(raw) {
  if (!raw) {
    return null;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function extractCalculationMethod(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const candidates = [
    metadata?.calc?.method,
    metadata?.calc_method,
    metadata?.calculation_method,
    metadata?.work_session?.calculation_method,
    metadata?.work_session?.calc_method,
    metadata?.workSession?.calculationMethod,
    metadata?.workSession?.calcMethod,
    metadata?.method,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function resolveEntryNotes(entry, metadata) {
  const candidates = [
    entry?.notes,
    metadata?.note,
    metadata?.note_internal,
    metadata?.notes,
    metadata?.leave?.note,
    metadata?.leave?.notes,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

export default function LeaveOverview({
  employees = [],
  leaveBalances = [],
  leavePolicy = DEFAULT_LEAVE_POLICY,
  leavePayPolicy = DEFAULT_LEAVE_PAY_POLICY,
  onRefresh,
  isLoading = false,
}) {
  const [evaluationDate, setEvaluationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showInactive, setShowInactive] = useState(false);
  const [openRows, setOpenRows] = useState({});
  const toggleRow = useCallback((employeeId) => {
    setOpenRows(prev => ({ ...prev, [employeeId]: !prev[employeeId] }));
  }, []);
  const [overrideEmployeeId, setOverrideEmployeeId] = useState(null);
  const [overrideMethod, setOverrideMethod] = useState(OVERRIDE_METHOD_PLACEHOLDER_VALUE);
  const [overrideRate, setOverrideRate] = useState('');
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [isOverrideDialogOpen, setIsOverrideDialogOpen] = useState(false);
  const { authClient, user, loading, session } = useSupabase();
  const { activeOrgId } = useOrg();

  const leaveHistoryByEmployee = useMemo(() => {
    const map = new Map();
    (leaveBalances || []).forEach((entry) => {
      if (!entry || !entry.employee_id) return;
      const list = map.get(entry.employee_id) || [];
      list.push(entry);
      map.set(entry.employee_id, list);
    });

    map.forEach((list, key) => {
      const sorted = [...list].sort((a, b) => {
        const first = normalizeDateValue(a?.effective_date || a?.date || a?.entry_date || a?.created_at || a?.change_date);
        const second = normalizeDateValue(b?.effective_date || b?.date || b?.entry_date || b?.created_at || b?.change_date);
        const firstTime = first ? first.getTime() : 0;
        const secondTime = second ? second.getTime() : 0;
        return secondTime - firstTime;
      });
      map.set(key, sorted);
    });

    return map;
  }, [leaveBalances]);

  const summaryRows = useMemo(() => {
    const evaluation = evaluationDate;
    return employees
      .filter(emp => showInactive || emp.is_active !== false)
      .map(emp => ({
        employee: emp,
        summary: selectLeaveRemaining(emp.id, evaluation, {
          employees,
          leaveBalances,
          policy: leavePolicy,
        }),
        payContext: resolveLeavePayMethodContext(emp, leavePayPolicy),
      }))
      .sort((a, b) => (b.summary.remaining || 0) - (a.summary.remaining || 0));
  }, [employees, evaluationDate, leaveBalances, leavePayPolicy, leavePolicy, showInactive]);

  useEffect(() => {
    if (!isOverrideDialogOpen) return;
    const exists = employees.some(emp => emp.id === overrideEmployeeId);
    if (!exists) {
      setOverrideEmployeeId(null);
      setOverrideMethod(OVERRIDE_METHOD_PLACEHOLDER_VALUE);
      setOverrideRate('');
      setIsOverrideDialogOpen(false);
    }
  }, [employees, isOverrideDialogOpen, overrideEmployeeId]);

  const parseRateValue = (value) => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const selectedEmployee = useMemo(() => {
    if (!overrideEmployeeId) return null;
    return employees.find(emp => emp.id === overrideEmployeeId) || null;
  }, [employees, overrideEmployeeId]);

  if (loading || !authClient) {
    return (
      <Card className="border-0 shadow-lg bg-white/80">
        <CardHeader className="border-b">
          <CardTitle className="text-xl font-semibold text-slate-900">טוען חיבור Supabase...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="border-0 shadow-lg bg-white/80">
        <CardHeader className="border-b">
          <CardTitle className="text-xl font-semibold text-slate-900">יש להתחבר כדי לנהל חופשות.</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (!activeOrgId) {
    return (
      <Card className="border-0 shadow-lg bg-white/80">
        <CardHeader className="border-b">
          <CardTitle className="text-xl font-semibold text-slate-900">בחרו ארגון פעיל כדי לנהל חופשות.</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const handleOverrideDialogClose = () => {
    setIsOverrideDialogOpen(false);
    setOverrideEmployeeId(null);
    setOverrideMethod(OVERRIDE_METHOD_PLACEHOLDER_VALUE);
    setOverrideRate('');
    setIsSavingOverride(false);
  };

  const handleOpenOverrideDialog = (employee, event) => {
    if (event) {
      event.stopPropagation();
    }
    if (!employee) return;
    const nextMethod = employee.leave_pay_method && employee.leave_pay_method.length > 0
      ? employee.leave_pay_method
      : OVERRIDE_METHOD_PLACEHOLDER_VALUE;
    const nextRate = employee.leave_fixed_day_rate;
    setOverrideEmployeeId(employee.id);
    setOverrideMethod(nextMethod);
    setOverrideRate(nextMethod === 'fixed_rate' && nextRate !== null && nextRate !== undefined ? String(nextRate) : '');
    setIsOverrideDialogOpen(true);
  };

  const handleTooltipButtonClick = (event) => {
    event.stopPropagation();
  };

  const handleOverrideMethodChange = (value) => {
    setOverrideMethod(value);
    if (value !== 'fixed_rate') {
      setOverrideRate('');
    }
  };

  const handleOverrideSubmit = async (event) => {
    event.preventDefault();
    const hasOverrideEmployeeSelection = Boolean(selectedEmployee);
    if (!hasOverrideEmployeeSelection) {
      toast.error('בחר עובד לעדכון השיטה');
      return;
    }
    const normalizedOverrideMethod = overrideMethod === OVERRIDE_METHOD_PLACEHOLDER_VALUE ? '' : overrideMethod;
    const initialMethod = selectedEmployee?.leave_pay_method || '';
    const initialRateNumber = parseRateValue(selectedEmployee?.leave_fixed_day_rate);
    const currentRateNumber = parseRateValue(overrideRate);
    const hasOverrideChanges = Boolean(hasOverrideEmployeeSelection)
      && (normalizedOverrideMethod !== (initialMethod || '')
        || (normalizedOverrideMethod === 'fixed_rate' && currentRateNumber !== initialRateNumber));
    if (!hasOverrideChanges) {
      toast.info('אין שינויים לשמירה');
      return;
    }

    let rateToSave = null;
    if (normalizedOverrideMethod === 'fixed_rate') {
      const parsed = parseRateValue(overrideRate);
      if (parsed === null || parsed <= 0) {
        toast.error('הזן תעריף יומי גדול מאפס');
        return;
      }
      rateToSave = parsed;
    }

    setIsSavingOverride(true);
    try {
      if (!session) {
        throw new Error('יש להתחבר מחדש לפני שמירת העקיפה.');
      }
      if (!activeOrgId) {
        throw new Error('בחרו ארגון פעיל לפני שמירת העקיפה.');
      }
      const methodToSave = normalizedOverrideMethod || null;
      const payload = {
        leave_pay_method: methodToSave,
        leave_fixed_day_rate: methodToSave === 'fixed_rate' ? rateToSave : null,
      };
      await updateEmployee({
        session,
        orgId: activeOrgId,
        employeeId: overrideEmployeeId,
        body: { updates: payload },
      });
      toast.success('עקיפת השיטה נשמרה בהצלחה');
      if (onRefresh) {
        await onRefresh();
      }
      handleOverrideDialogClose();
    } catch (error) {
      console.error('Error saving leave pay override', error);
      toast.error('שמירת העקיפה נכשלה');
    }
    setIsSavingOverride(false);
  };

  const normalizedOverrideMethod = overrideMethod === OVERRIDE_METHOD_PLACEHOLDER_VALUE ? '' : overrideMethod;
  const hasOverrideEmployeeSelection = Boolean(selectedEmployee);
  const initialMethod = selectedEmployee?.leave_pay_method || '';
  const initialRateNumber = parseRateValue(selectedEmployee?.leave_fixed_day_rate);
  const currentRateNumber = parseRateValue(overrideRate);
  const hasOverrideChanges = Boolean(hasOverrideEmployeeSelection)
    && (normalizedOverrideMethod !== (initialMethod || '')
      || (normalizedOverrideMethod === 'fixed_rate' && currentRateNumber !== initialRateNumber));
  const isFixedSelected = normalizedOverrideMethod === 'fixed_rate';
  const defaultMethodLabel = LEAVE_PAY_METHOD_LABELS[leavePayPolicy?.default_method] || 'חישוב חוקי (מומלץ)';
  const selectedMethodDescription = normalizedOverrideMethod
    ? LEAVE_PAY_METHOD_DESCRIPTIONS[normalizedOverrideMethod] || ''
    : '';

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg bg-white/80">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b">
          <div>
            <CardTitle className="text-xl font-semibold text-slate-900">מצב יתרות</CardTitle>
            <p className="text-sm text-slate-500 mt-1">מעקב אחר ניצול ומכסה לכל העובדים לפי מדיניות הארגון</p>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">תאריך חישוב</Label>
              <Input
                type="date"
                value={evaluationDate}
                onChange={(event) => setEvaluationDate(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-slate-50">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              <span className="text-sm text-slate-600">הצג גם עובדים לא פעילים</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">עובד</TableHead>
                <TableHead className="text-center">שיטת חישוב</TableHead>
                <TableHead className="text-center">מכסה שנתית</TableHead>
                <TableHead className="text-center">
                  <div className="flex flex-row-reverse items-center justify-center gap-1">
                    <span>יתרת צבירה משנה קודמת</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                          aria-label="יתרת חופשה שהועברה משנה קודמת לפי מדיניות הארגון."
                          onClick={handleTooltipButtonClick}
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="end">
                        יתרת חופשה שהועברה משנה קודמת לפי מדיניות הארגון.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TableHead>
                <TableHead className="text-center">נוצל</TableHead>
                <TableHead className="text-center">יתרה נוכחית</TableHead>
                <TableHead className="text-center">סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin inline-block text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : summaryRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500 py-10">
                    לא נמצאו נתונים להצגה
                  </TableCell>
                </TableRow>
              ) : (
                summaryRows.map(({ employee, summary, payContext }) => {
                  const remaining = Number(summary.remaining || 0);
                  const statusVariant = remaining < 0 ? 'destructive' : 'secondary';
                  const methodValue = payContext?.method || DEFAULT_LEAVE_PAY_POLICY.default_method;
                  const methodLabel = LEAVE_PAY_METHOD_LABELS[methodValue] || LEAVE_PAY_METHOD_LABELS.legal;
                  const hasOverride = Boolean(payContext?.override_applied);
                  const history = leaveHistoryByEmployee.get(employee.id) || [];
                  const isOpen = Boolean(openRows[employee.id]);
                  const drawerRowId = `leave-history-${employee.id}`;

                  return (
                    <React.Fragment key={employee.id}>
                      <TableRow
                        className={`transition-colors hover:bg-slate-50 ${isOpen ? 'bg-slate-50' : ''}`}
                      >
                        <TableCell className="font-medium text-center">
                          <button
                            type="button"
                            onClick={() => toggleRow(employee.id)}
                            aria-expanded={isOpen}
                            aria-controls={drawerRowId}
                            className="flex w-full flex-row-reverse items-center justify-center gap-2 rounded-md px-2 py-1 text-center text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                          >
                            <span className="flex-1">{employee.name}</span>
                            <ChevronDown
                              className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180 text-slate-600' : ''}`}
                              aria-hidden="true"
                            />
                          </button>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-2" onClick={(event) => event.stopPropagation()}>
                            <div className="flex flex-row-reverse items-center justify-center gap-2">
                              <span className="text-sm font-medium text-slate-700">{methodLabel}</span>
                              <div className="flex flex-row-reverse items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={(event) => handleOpenOverrideDialog(employee, event)}
                                  disabled={isLoading}
                                >
                                  עקיפת שיטת חישוב
                                </Button>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                                      aria-label="מידע על עקיפת שיטת החישוב"
                                      onClick={handleTooltipButtonClick}
                                    >
                                      <Info className="h-4 w-4" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="end" className="max-w-xs text-right leading-relaxed">
                                    שינוי השיטה משפיע על חישוב חופשות חדשות או עריכות שתשמרו מהיום והלאה. רישומים קיימים שומרים את הסכום שנקבע בזמן הקליטה, ולכן אם צריך לעדכן אותם יש לערוך אותם ידנית.
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                            {hasOverride ? (
                              <Badge variant="outline" className="text-xs text-amber-700 border-amber-200 bg-amber-50">
                                עקיפת שיטת חישוב
                              </Badge>
                            ) : (
                              <span className="text-xs text-slate-400">ברירת מחדל ארגונית</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{Number(employee.annual_leave_days || 0).toFixed(1)}</TableCell>
                        <TableCell className="text-center">{summary.carryIn.toFixed(1)}</TableCell>
                        <TableCell className="text-center">{summary.used.toFixed(1)}</TableCell>
                        <TableCell className={`text-center ${remaining < 0 ? 'text-red-600 font-semibold' : 'font-semibold text-green-700'}`}>
                          {remaining.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={statusVariant}>
                            {remaining < 0 ? 'במינוס' : 'תקין'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow id={drawerRowId} className="bg-slate-50">
                          <TableCell colSpan={7} className="p-6 align-top text-center">
                            <div className="space-y-4">
                              <div className="flex flex-row-reverse items-center justify-between gap-2 text-right">
                                <span className="text-xs text-slate-500">סך רשומות: {history.length}</span>
                                <h4 className="text-sm font-semibold text-slate-800">פירוט היסטוריית חופשות</h4>
                              </div>
                              {history.length === 0 ? (
                                <p className="text-sm text-slate-500 text-right">לא נמצאו רשומות חופשה עבור העובד.</p>
                              ) : (
                                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                                  <div className="max-h-96 overflow-auto">
                                    <table className="min-w-full divide-y divide-slate-200">
                                      <thead className="bg-slate-100">
                                        <tr>
                                          <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">תאריך</th>
                                          <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">סוג חופשה</th>
                                          <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">שינוי במאזן</th>
                                          <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">שיטת חישוב</th>
                                          <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">הערות</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 bg-white">
                                        {history.map(entry => {
                                          const metadata = parseEntryMetadata(entry?.metadata);
                                          const calculationMethod = extractCalculationMethod(metadata);
                                          const calculationMethodLabel = calculationMethod || '—';
                                          const notes = resolveEntryNotes(entry, metadata) || '—';
                                          const typeLabel = formatLeaveHistoryEntryType(entry);
                                          const rawChange = Number(entry?.balance ?? entry?.balance_change ?? entry?.change ?? entry?.amount ?? 0);
                                          const changeDisplay = Number.isFinite(rawChange) ? rawChange.toFixed(1) : '0.0';
                                          const changeToneClass = rawChange < 0 ? 'text-red-600' : rawChange > 0 ? 'text-green-700' : 'text-slate-500';
                                          const dateValue = entry?.effective_date || entry?.date || entry?.entry_date || entry?.created_at;

                                          return (
                                            <tr key={`${entry.id || entry.effective_date || entry.created_at}-${entry.leave_type || entry.entry_type || 'history'}`}>
                                              <td className="px-4 py-3 align-middle text-center whitespace-nowrap">{formatLedgerDate(dateValue)}</td>
                                              <td className="px-4 py-3 align-middle text-center whitespace-nowrap">{typeLabel}</td>
                                              <td className={`px-4 py-3 align-middle text-center font-mono ${changeToneClass}`}>{changeDisplay}</td>
                                              <td className="px-4 py-3 align-middle text-center whitespace-nowrap">{calculationMethodLabel}</td>
                                              <td className="px-4 py-3 align-middle whitespace-pre-line text-center">{notes}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={isOverrideDialogOpen} onOpenChange={(open) => (!open ? handleOverrideDialogClose() : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="text-right">
            <DialogTitle>עקיפת שיטת חישוב</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 space-y-1">
              <p>בחר שיטה חלופית לתשלום חופשה עבור העובד הנוכחי.</p>
              <p>השיטה הארגונית ({defaultMethodLabel}) תחול כאשר אין עקיפה אישית.</p>
            </DialogDescription>
          </DialogHeader>
          <Alert className="bg-sky-50 border-sky-200 text-sky-900 text-right">
            <AlertTitle className="flex flex-row-reverse items-center gap-2 text-base">
              <Info className="h-4 w-4" />חשוב לדעת
            </AlertTitle>
            <AlertDescription className="text-sm leading-relaxed">
              שינוי שיטת החישוב משפיע על כל חופשה שתקליטו או תעדכנו מרגע השמירה ואילך. רישומים שנשמרו בעבר אינם משתנים אוטומטית, ולכן אם ביצעתם שינוי באמצע השנה חשוב לבדוק האם יש צורך לעדכן ידנית ימים שנרשמו כבר.
            </AlertDescription>
          </Alert>
          <form className="space-y-4" onSubmit={handleOverrideSubmit}>
            <div className="space-y-1 text-right">
              <Label className="text-sm font-semibold text-slate-700">עובד</Label>
              <p className="text-base font-medium text-slate-900">{selectedEmployee?.name || '—'}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-semibold text-slate-700">עקיפת שיטת חישוב</Label>
                {normalizedOverrideMethod && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOverrideMethodChange(OVERRIDE_METHOD_PLACEHOLDER_VALUE)}
                    disabled={isSavingOverride}
                  >
                    אפס
                  </Button>
                )}
              </div>
              <Select
                value={overrideMethod}
                onValueChange={handleOverrideMethodChange}
                disabled={!hasOverrideEmployeeSelection || isSavingOverride}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="ללא עקיפה (ברירת מחדל)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OVERRIDE_METHOD_PLACEHOLDER_VALUE}>ללא עקיפה (ברירת מחדל)</SelectItem>
                  {LEAVE_PAY_METHOD_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMethodDescription && (
                <p className="text-xs text-slate-500 text-right mt-1">{selectedMethodDescription}</p>
              )}
            </div>
            {isFixedSelected && (
              <div className="space-y-1">
                <Label className="text-sm font-semibold text-slate-700">תעריף יומי לעובד (₪)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={overrideRate}
                  onChange={(event) => setOverrideRate(event.target.value)}
                  disabled={isSavingOverride}
                />
              </div>
            )}
            <DialogFooter className="flex flex-row-reverse gap-2">
              <Button
                type="submit"
                className="gap-2"
                disabled={isSavingOverride || !hasOverrideEmployeeSelection || !hasOverrideChanges}
              >
                {isSavingOverride ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {isSavingOverride ? 'שומר...' : 'שמור עקיפה'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleOverrideDialogClose}
                disabled={isSavingOverride}
              >
                ביטול
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
