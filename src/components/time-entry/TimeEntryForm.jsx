import React, { useState, useMemo, useEffect, useCallback } from 'react';
import SingleDayEntryShell from './shared/SingleDayEntryShell.jsx';
import GlobalSegment from './segments/GlobalSegment.jsx';
import HourlySegment from './segments/HourlySegment.jsx';
import InstructorSegment from './segments/InstructorSegment.jsx';
import { calculateGlobalDailyRate } from '@/lib/payroll.js';
import { sumHours, removeSegment } from './dayUtils.js';
import { softDeleteWorkSession } from '@/api/work-sessions.js';
import { toast } from 'sonner';
import { format } from 'date-fns';
import he from '@/i18n/he.json';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/InfoTooltip.jsx';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { selectLeaveDayValue } from '@/selectors.js';
import {
  DEFAULT_LEAVE_PAY_POLICY,
  LEAVE_PAY_METHOD_DESCRIPTIONS,
  LEAVE_PAY_METHOD_LABELS,
  LEAVE_TYPE_OPTIONS,
  PAID_LEAVE_LABEL,
  HALF_DAY_LEAVE_LABEL,
  SYSTEM_PAID_ALERT_TEXT,
  getLeaveBaseKind,
  isPayableLeaveKind,
  normalizeLeavePayPolicy,
  normalizeMixedSubtype,
  DEFAULT_MIXED_SUBTYPE,
  formatLeaveTypeLabel,
} from '@/lib/leave.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';

const VALID_LEAVE_PAY_METHODS = new Set(Object.keys(LEAVE_PAY_METHOD_LABELS));

export default function TimeEntryForm({
  employee,
  allEmployees = [],
  workSessions = [],
  services = [],
  onSubmit,
  getRateForDate,
  initialRows = null,
  initialAdjustments = [],
  selectedDate,
  onDeleted,
  initialDayType = 'regular',
  paidLeaveId = null,
  paidLeaveNotes: initialPaidLeaveNotes = '',
  allowDayTypeSelection = false,
  initialLeaveType = null,
  allowHalfDay = false,
  initialMixedPaid = true,
  initialMixedSubtype = DEFAULT_MIXED_SUBTYPE,
  initialMixedHalfDay = false,
  initialHalfDaySecondHalfMode = null,
  initialHalfDaySecondLeaveType = 'employee_paid',
  initialHalfDayPrimaryLeaveType = 'employee_paid',
  leavePayPolicy = DEFAULT_LEAVE_PAY_POLICY,
}) {
  const isGlobal = employee.employee_type === 'global';
  const isHourly = employee.employee_type === 'hourly';
  const { session } = useSupabase();
  const { activeOrgId } = useOrg();

  const ensureSessionAndOrg = useCallback(() => {
    if (!session) {
      throw new Error('נדרשת התחברות כדי לבצע פעולה זו.');
    }
    if (!activeOrgId) {
      throw new Error('יש לבחור ארגון פעיל לפני ביצוע הפעולה.');
    }
  }, [session, activeOrgId]);

  const createSeg = useCallback(() => ({
    hours: '',
    service_id: '',
    sessions_count: '',
    students_count: '',
    notes: '',
    _status: 'new',
  }), []);
  const [segments, setSegments] = useState(() => {
    if (initialDayType === 'paid_leave') return initialRows || [];
    if (initialRows && initialRows.length > 0) {
      return initialRows.map(row => ({
        ...row,
        _status: row._status || 'existing',
      }));
    }
    return [createSeg()];
  });
  const createAdjustment = useCallback(() => ({
    id: crypto.randomUUID(),
    workSessionId: null,
    type: 'credit',
    amount: '',
    notes: '',
    _status: 'new',
  }), []);
  const sanitizeSegmentsForSubmit = useCallback((list = []) => (
    Array.isArray(list)
      ? list
        .filter(segment => segment && segment._status !== 'deleted')
        .map(segment => {
          const next = { ...segment };
          if (!next.id) {
            delete next.id;
          }
          delete next._status;
          return next;
        })
      : []
  ), []);
  const mapInitialAdjustments = useCallback((items = []) => {
    if (!Array.isArray(items) || items.length === 0) {
      return [createAdjustment()];
    }
    const mapped = items.map(item => {
      const rawAmount = Math.abs(Number(item?.total_payment ?? 0));
      return {
        id: String(item?.id ?? crypto.randomUUID()),
        workSessionId: item?.id || null,
        type: Number(item?.total_payment ?? 0) < 0 ? 'debit' : 'credit',
        amount: Number.isFinite(rawAmount) && rawAmount !== 0 ? String(rawAmount) : '',
        notes: item?.notes || '',
        _status: item?.id ? 'existing' : 'new',
      };
    });
    return mapped.length > 0 ? mapped : [createAdjustment()];
  }, [createAdjustment]);
  const [adjustments, setAdjustments] = useState(() => mapInitialAdjustments(initialAdjustments));
  const [adjustmentErrors, setAdjustmentErrors] = useState({});

  const validateAdjustmentRow = useCallback((row) => {
    if (!row) return {};
    const errors = {};
    const amountValue = parseFloat(row.amount);
    if (!row.amount || Number.isNaN(amountValue) || amountValue <= 0) {
      errors.amount = 'סכום גדול מ-0 נדרש';
    }
    const notesValue = typeof row.notes === 'string' ? row.notes.trim() : '';
    if (!notesValue) {
      errors.notes = 'יש להוסיף הערה להתאמה';
    }
    return errors;
  }, []);

  useEffect(() => {
    setAdjustments(mapInitialAdjustments(initialAdjustments));
    setAdjustmentErrors({});
  }, [initialAdjustments, mapInitialAdjustments]);
  const [dayType, setDayType] = useState(initialDayType);
  const [paidLeaveNotes, setPaidLeaveNotes] = useState(initialPaidLeaveNotes);
  const [leaveType, setLeaveType] = useState(initialLeaveType || '');
  const [lastNonSystemLeaveType, setLastNonSystemLeaveType] = useState('employee_paid');
  const [errors, setErrors] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [currentPaidLeaveId, setCurrentPaidLeaveId] = useState(paidLeaveId);
  const [fallbackPrompt, setFallbackPrompt] = useState(null);
  const [fallbackAmount, setFallbackAmount] = useState('');
  const [fallbackError, setFallbackError] = useState('');
  const [isConfirmingFallback, setIsConfirmingFallback] = useState(false);
  const [includeSecondHalf, setIncludeSecondHalf] = useState(false);
  const [secondHalfMode, setSecondHalfMode] = useState('work');
  const [secondHalfLeaveType, setSecondHalfLeaveType] = useState('employee_paid');
  const [secondHalfLastNonSystemLeaveType, setSecondHalfLastNonSystemLeaveType] = useState('employee_paid');
  const [halfDayPrimaryLeaveType, setHalfDayPrimaryLeaveType] = useState(
    initialHalfDayPrimaryLeaveType === 'system_paid' ? 'system_paid' : 'employee_paid',
  );

  useEffect(() => {
    setCurrentPaidLeaveId(paidLeaveId);
  }, [paidLeaveId]);

  useEffect(() => {
    if (leaveType && leaveType !== 'system_paid') {
      setLastNonSystemLeaveType(leaveType);
    }
  }, [leaveType]);

  useEffect(() => {
    if (secondHalfLeaveType && secondHalfLeaveType !== 'system_paid') {
      setSecondHalfLastNonSystemLeaveType(secondHalfLeaveType);
    }
  }, [secondHalfLeaveType]);

  useEffect(() => {
    setHalfDayPrimaryLeaveType(
      initialHalfDayPrimaryLeaveType === 'system_paid' ? 'system_paid' : 'employee_paid',
    );
  }, [initialHalfDayPrimaryLeaveType]);

  const leaveTypeOptions = useMemo(() => {
    return LEAVE_TYPE_OPTIONS
      .filter(option => option.value !== 'mixed' && option.value !== 'system_paid' && option.value !== 'holiday_unpaid')
      .filter(option => allowHalfDay || option.value !== 'half_day')
      .map(option => [option.value, formatLeaveTypeLabel(option.value, option.label)]);
  }, [allowHalfDay]);
  const defaultNonSystemLeaveType = useMemo(() => {
    return leaveTypeOptions[0]?.[0] || 'employee_paid';
  }, [leaveTypeOptions]);
  const resolvedNonSystemLeaveType = useMemo(() => {
    if (lastNonSystemLeaveType && leaveTypeOptions.some(([value]) => value === lastNonSystemLeaveType)) {
      return lastNonSystemLeaveType;
    }
    return defaultNonSystemLeaveType;
  }, [defaultNonSystemLeaveType, lastNonSystemLeaveType, leaveTypeOptions]);
  const secondaryLeaveTypeOptions = useMemo(() => (
    LEAVE_TYPE_OPTIONS
      .filter(option => option.value !== 'mixed' && option.value !== 'half_day' && option.value !== 'system_paid' && option.value !== 'holiday_unpaid')
      .map(option => [option.value, formatLeaveTypeLabel(option.value, option.label)])
  ), []);
  const resolvedSecondHalfNonSystemType = useMemo(() => {
    if (secondHalfLastNonSystemLeaveType && secondaryLeaveTypeOptions.some(([value]) => value === secondHalfLastNonSystemLeaveType)) {
      return secondHalfLastNonSystemLeaveType;
    }
    return 'employee_paid';
  }, [secondHalfLastNonSystemLeaveType, secondaryLeaveTypeOptions]);

  const isLeaveDay = dayType === 'paid_leave';

  const isHalfDaySelection = leaveType === 'half_day'
    || (leaveType === 'system_paid' && lastNonSystemLeaveType === 'half_day');
  const isSystemPaidSelection = isHalfDaySelection
    ? halfDayPrimaryLeaveType === 'system_paid'
    : leaveType === 'system_paid';
  const secondHalfKind = getLeaveBaseKind(secondHalfLeaveType) || secondHalfLeaveType;
  const secondHalfEnabled = isLeaveDay && isHalfDaySelection && includeSecondHalf;
  const shouldIncludeWorkSegments = secondHalfEnabled && secondHalfMode === 'work';
  const shouldIncludeLeaveSecondHalf = secondHalfEnabled && secondHalfMode === 'leave';
  const firstHalfSystemPaid = isHalfDaySelection ? halfDayPrimaryLeaveType === 'system_paid' : isSystemPaidSelection;

  const visibleLeaveTypeValue = isHalfDaySelection
    ? 'half_day'
    : (isSystemPaidSelection ? resolvedNonSystemLeaveType : (leaveType || ''));

  const disableSystemPaidSwitch = !isHalfDaySelection
    && getLeaveBaseKind(visibleLeaveTypeValue) === 'unpaid';

  useEffect(() => {
    if (disableSystemPaidSwitch && leaveType === 'system_paid') {
      setLeaveType(resolvedNonSystemLeaveType);
    }
  }, [disableSystemPaidSwitch, leaveType, resolvedNonSystemLeaveType]);

  useEffect(() => {
    if (initialLeaveType !== 'mixed') return;
    const normalizedSubtype = normalizeMixedSubtype(initialMixedSubtype) || DEFAULT_MIXED_SUBTYPE;
    const wasPaid = initialMixedPaid !== false;
    const halfDayAllowed = allowHalfDay && wasPaid;
    const wasHalfDay = halfDayAllowed ? Boolean(initialMixedHalfDay) : false;
    let nextType;
    if (!wasPaid) {
      nextType = normalizedSubtype === 'holiday' ? 'holiday_unpaid' : 'vacation_unpaid';
    } else if (wasHalfDay) {
      nextType = 'half_day';
    } else {
      nextType = normalizedSubtype === 'holiday' ? 'system_paid' : 'employee_paid';
    }
    setLeaveType(nextType);
  }, [initialLeaveType, initialMixedSubtype, initialMixedPaid, initialMixedHalfDay, allowHalfDay]);

  useEffect(() => {
    if (initialDayType !== 'paid_leave') return;
    if (initialLeaveType !== 'half_day') return;
    if (initialHalfDaySecondHalfMode === 'leave') {
      setIncludeSecondHalf(true);
      setSecondHalfMode('leave');
      setSecondHalfLeaveType(initialHalfDaySecondLeaveType || 'employee_paid');
      return;
    }
    const hasExistingWork = Array.isArray(initialRows) && initialRows.length > 0;
    if (hasExistingWork || initialHalfDaySecondHalfMode === 'work') {
      setIncludeSecondHalf(true);
      setSecondHalfMode('work');
    }
  }, [
    initialDayType,
    initialLeaveType,
    initialRows,
    initialHalfDaySecondHalfMode,
    initialHalfDaySecondLeaveType,
  ]);

  useEffect(() => {
    if (!allowHalfDay && leaveType === 'half_day') {
      const [firstOption] = leaveTypeOptions;
      setLeaveType(firstOption ? firstOption[0] : '');
    }
  }, [allowHalfDay, leaveType, leaveTypeOptions]);

  useEffect(() => {
    if (!isHalfDaySelection) {
      if (includeSecondHalf) setIncludeSecondHalf(false);
      if (secondHalfMode !== 'work') setSecondHalfMode('work');
      return;
    }
    if (includeSecondHalf && secondHalfMode === 'work') {
      setSegments(prev => (prev && prev.length > 0 ? prev : [createSeg()]));
    }
  }, [isHalfDaySelection, includeSecondHalf, secondHalfMode, createSeg]);

  const dailyRate = useMemo(() => {
    if (!isGlobal) return 0;
    const { rate } = getRateForDate(employee.id, selectedDate, null);
    try { return calculateGlobalDailyRate(employee, selectedDate, rate); } catch { return 0; }
  }, [employee, selectedDate, getRateForDate, isGlobal]);

  const configuredLeavePortion = useMemo(() => {
    if (!isLeaveDay) return 0;

    let portion = 0;
    const addPortionIfPaid = (kind, fraction) => {
      if (!kind || !Number.isFinite(fraction)) return;
      const baseKind = getLeaveBaseKind(kind) || kind;
      if (isPayableLeaveKind(baseKind)) {
        portion += fraction;
      }
    };

    if (isHalfDaySelection) {
      const primaryKind = firstHalfSystemPaid ? 'system_paid' : 'employee_paid';
      addPortionIfPaid(primaryKind, 0.5);

      if (shouldIncludeLeaveSecondHalf) {
        addPortionIfPaid(secondHalfLeaveType, 0.5);
      }
      return Math.min(Math.max(portion, 0), 1);
    }

    addPortionIfPaid(leaveType, 1);
    return Math.min(Math.max(portion, 0), 1);
  }, [
    isLeaveDay,
    isHalfDaySelection,
    leaveType,
    firstHalfSystemPaid,
    shouldIncludeLeaveSecondHalf,
    secondHalfLeaveType,
  ]);

  const globalRemainingPortion = useMemo(() => {
    if (!isGlobal) return 1;
    const normalized = Math.min(Math.max(configuredLeavePortion, 0), 1);
    return Math.max(0, 1 - normalized);
  }, [configuredLeavePortion, isGlobal]);

  const firstActiveGlobalSegmentIndex = useMemo(() => {
    if (!isGlobal || !Array.isArray(segments)) return -1;
    for (let index = 0; index < segments.length; index += 1) {
      const candidate = segments[index];
      if (candidate && candidate._status !== 'deleted') {
        return index;
      }
    }
    return -1;
  }, [isGlobal, segments]);

  const globalPreviewAmount = useMemo(() => {
    if (!isGlobal) return dailyRate;
    return dailyRate * globalRemainingPortion;
  }, [dailyRate, globalRemainingPortion, isGlobal]);

  const normalizedLeavePay = useMemo(
    () => normalizeLeavePayPolicy(leavePayPolicy),
    [leavePayPolicy],
  );

  const employeesForSelector = useMemo(() => {
    if (Array.isArray(allEmployees) && allEmployees.length > 0) return allEmployees;
    return employee ? [employee] : [];
  }, [allEmployees, employee]);

  const leaveKindForPay = useMemo(() => {
    if (!isLeaveDay) return null;
    if (!leaveType) return null;
    return getLeaveBaseKind(leaveType);
  }, [isLeaveDay, leaveType]);

  const isPaidLeavePreview = useMemo(() => {
    if (!isLeaveDay) return false;
    if (!leaveKindForPay) return false;
    return isPayableLeaveKind(leaveKindForPay);
  }, [isLeaveDay, leaveKindForPay]);

  const leavePayMethod = useMemo(() => {
    const override = employee?.leave_pay_method;
    if (override && VALID_LEAVE_PAY_METHODS.has(override)) {
      return override;
    }
    const fallback = normalizedLeavePay.default_method || DEFAULT_LEAVE_PAY_POLICY.default_method;
    if (VALID_LEAVE_PAY_METHODS.has(fallback)) {
      return fallback;
    }
    return DEFAULT_LEAVE_PAY_POLICY.default_method;
  }, [employee?.leave_pay_method, normalizedLeavePay]);

  const leaveMethodLabel = LEAVE_PAY_METHOD_LABELS[leavePayMethod] || LEAVE_PAY_METHOD_LABELS[DEFAULT_LEAVE_PAY_POLICY.default_method];
  const leaveMethodDescription =
    LEAVE_PAY_METHOD_DESCRIPTIONS[leavePayMethod] ||
    LEAVE_PAY_METHOD_DESCRIPTIONS[DEFAULT_LEAVE_PAY_POLICY.default_method] ||
    '';

  const leaveDayValueInfo = useMemo(() => {
    if (!isPaidLeavePreview || !employee?.id) {
      return { value: 0, insufficientData: false, preStartDate: false };
    }
    const result = selectLeaveDayValue(employee.id, selectedDate, {
      employees: employeesForSelector,
      workSessions,
      services,
      leavePayPolicy: normalizedLeavePay,
      collectDiagnostics: true,
    });
    if (result && typeof result === 'object' && !Number.isNaN(result.value)) {
      return {
        value: result.value,
        insufficientData: Boolean(result.insufficientData),
        preStartDate: Boolean(result.preStartDate),
      };
    }
    const numericValue = Number.isFinite(result) ? result : 0;
    return { value: numericValue, insufficientData: numericValue <= 0, preStartDate: false };
  }, [isPaidLeavePreview, employee?.id, selectedDate, employeesForSelector, workSessions, services, normalizedLeavePay]);

  const leaveDayValue = leaveDayValueInfo.value;
  const showInsufficientHistoryHint = leaveDayValueInfo.insufficientData;
  const showPreStartWarning = leaveDayValueInfo.preStartDate;

  useEffect(() => {
    if (!shouldIncludeLeaveSecondHalf) return;
    const desiredKind = firstHalfSystemPaid ? resolvedSecondHalfNonSystemType : 'system_paid';
    const currentKind = getLeaveBaseKind(secondHalfLeaveType) || secondHalfLeaveType;
    if (currentKind === 'employee_paid' || currentKind === 'system_paid' || !secondHalfLeaveType) {
      if (secondHalfLeaveType !== desiredKind) {
        setSecondHalfLeaveType(desiredKind);
      }
    }
  }, [shouldIncludeLeaveSecondHalf, firstHalfSystemPaid, resolvedSecondHalfNonSystemType, secondHalfLeaveType]);

  const addSeg = () => setSegments(prev => [...prev, createSeg()]);
  useEffect(() => {
    if (!isHalfDaySelection && halfDayPrimaryLeaveType !== 'employee_paid') {
      setHalfDayPrimaryLeaveType('employee_paid');
    }
  }, [isHalfDaySelection, halfDayPrimaryLeaveType]);

  const handleSystemPaidToggle = useCallback((checked) => {
    if (isHalfDaySelection) {
      setHalfDayPrimaryLeaveType(checked ? 'system_paid' : 'employee_paid');
      if (leaveType !== 'half_day') {
        setLeaveType('half_day');
      }
      return;
    }
    if (checked) {
      setLeaveType('system_paid');
      return;
    }
    setLeaveType(resolvedNonSystemLeaveType);
  }, [isHalfDaySelection, leaveType, resolvedNonSystemLeaveType]);
  const duplicateSeg = (index) => {
    setSegments(prev => {
      if (index < 0 || index >= prev.length) return prev;
      const { id: _omitId, _status: _omitStatus, ...rest } = prev[index];
      const copy = {
        ...rest,
        _status: 'new',
      };
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });
  };

  useEffect(() => {
    if (!shouldIncludeWorkSegments && Object.keys(errors).length > 0) {
      setErrors({});
    }
  }, [shouldIncludeWorkSegments, errors]);
  const deleteSeg = (index) => {
    if (index < 0 || index >= segments.length) return;
    const target = segments[index];
    if (!target) return;
    if (target._status === 'new') {
      const res = removeSegment(segments, index);
      if (res.removed) setSegments(res.rows);
      return;
    }
    const summary = {
      employeeName: employee.name,
      date: format(new Date(selectedDate + 'T00:00:00'), 'dd/MM/yyyy'),
      entryTypeLabel: isHourly || isGlobal ? 'שעות' : 'מפגש',
      hours: isHourly || isGlobal ? target.hours : null,
      meetings: isHourly || isGlobal ? null : target.sessions_count
    };
    openArchiveDialog({ id: target.id, summary, kind: 'segment' });
  };
  const addAdjustment = () => setAdjustments(prev => [...prev, createAdjustment()]);
  const updateAdjustment = (id, patch) => {
    setAdjustments(prev => prev.map(item => (item.id === id ? { ...item, ...patch } : item)));
    setAdjustmentErrors(prev => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };
  const removeAdjustment = (id) => {
    const target = adjustments.find(item => item.id === id);
    if (!target) return;
    if (target._status === 'existing' && target.workSessionId) {
      const amountValue = parseFloat(target.amount);
      const formattedDate = format(new Date(selectedDate + 'T00:00:00'), 'dd/MM/yyyy');
      const summary = {
        employeeName: employee.name,
        date: formattedDate,
        entryTypeLabel: 'התאמה',
      };
      const summaryText = Number.isFinite(amountValue) && amountValue > 0
        ? `התאמה ${target.type === 'debit' ? 'ניכוי' : 'זיכוי'} על סך ₪${Math.abs(amountValue).toLocaleString()}`
        : 'התאמה';
      openArchiveDialog({
        id: target.workSessionId,
        summary,
        summaryText,
        kind: 'adjustment',
        localId: target.id,
      });
      return;
    }
    setAdjustments(prev => {
      const next = prev.filter(item => item.id !== id);
      return next.length > 0 ? next : [createAdjustment()];
    });
    setAdjustmentErrors(prev => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };
  const requestDeleteLeave = () => {
    if (!currentPaidLeaveId) return;
    const summary = {
      employeeName: employee.name,
      date: format(new Date(selectedDate + 'T00:00:00'), 'dd/MM/yyyy'),
      entryTypeLabel: 'חופשה',
    };
    openArchiveDialog({ id: currentPaidLeaveId, summary, kind: 'leave' });
  };
  const handleArchiveDialogClose = useCallback(() => {
    setIsArchiveDialogOpen(false);
    setPendingDelete(null);
    setIsArchiving(false);
  }, []);

  const openArchiveDialog = useCallback((details) => {
    setPendingDelete(details);
    setIsArchiveDialogOpen(true);
    setIsArchiving(false);
  }, []);

  const handleConfirmArchive = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    try {
      if (isArchiving) {
        return;
      }
      setIsArchiving(true);
      ensureSessionAndOrg();
      const existingRow = workSessions.find(
        (sessionRow) => String(sessionRow?.id) === String(target.id),
      );
      const timestamp = new Date().toISOString();
      await softDeleteWorkSession({
        session,
        orgId: activeOrgId,
        sessionId: target.id,
      });
      const deletedRow = existingRow
        ? { ...existingRow, deleted: true, deleted_at: timestamp }
        : null;
      const payload = deletedRow ? [deletedRow] : [];
      if (target.kind === 'segment') {
        setSegments(prev => prev.filter(s => s.id !== target.id));
      }
      if (target.kind === 'leave') {
        setCurrentPaidLeaveId(null);
        setDayType('regular');
        setLeaveType('');
        setPaidLeaveNotes('');
        setSegments(prev => (prev.length > 0 ? prev : [createSeg()]));
      }
      if (target.kind === 'adjustment') {
        setAdjustments(prev => {
          const next = prev.filter(item => item.id !== target.localId);
          return next.length > 0 ? next : [createAdjustment()];
        });
        setAdjustmentErrors(prev => {
          if (!target.localId || !prev[target.localId]) return prev;
          const next = { ...prev };
          delete next[target.localId];
          return next;
        });
      }
      onDeleted?.([target.id], payload);
      toast.success(he['toast.delete.success']);
      handleArchiveDialogClose();
    } catch (err) {
      toast.error(err?.message || he['toast.delete.error']);
      handleArchiveDialogClose();
    }
  };

  const archiveSummaryText = useMemo(() => {
    if (!pendingDelete) return '';
    if (pendingDelete.summaryText) {
      return pendingDelete.summaryText;
    }
    const summary = pendingDelete.summary;
    if (!summary) {
      return '';
    }
    if (summary.segmentsCount != null) {
      return he['delete.summary.day'].replace('{{count}}', String(summary.segmentsCount));
    }
    let base = he['delete.summary.global']
      .replace('{{employee}}', summary.employeeName || '')
      .replace('{{date}}', summary.date || '')
      .replace('{{entryType}}', summary.entryTypeLabel || '');
    if (summary.hours != null) {
      base += ` • שעות ${summary.hours}`;
    }
    if (summary.meetings != null) {
      base += ` • מפגשים ${summary.meetings}`;
    }
    return base;
  }, [pendingDelete]);
  const changeSeg = (index, patch) => {
    setSegments(prev => prev.map((segment, idx) => (
      idx === index ? { ...segment, ...patch } : segment
    )));
  };

  const validate = () => {
    const err = {};
    segments.forEach((segment, index) => {
      if (!segment || segment._status === 'deleted') {
        return;
      }
      if (isGlobal || isHourly) {
        const h = parseFloat(segment.hours);
        if (!h || h <= 0) {
          err[index] = 'שעות נדרשות וגדולות מ־0';
        }
      } else {
        if (!segment.service_id) {
          err[index] = 'חסר שירות';
        } else {
          const sessionsCount = parseInt(segment.sessions_count, 10);
          const studentsCount = parseInt(segment.students_count, 10);
          if (!(sessionsCount >= 1)) {
            err[index] = 'מספר שיעורים נדרש';
          } else if (!(studentsCount >= 1)) {
            err[index] = 'מספר תלמידים נדרש';
          }
        }
      }
    });
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleDayTypeChange = (value) => {
    setDayType(value);
    if (value === 'adjustment' && adjustments.length === 0) {
      setAdjustments([createAdjustment()]);
    }
    if (value !== 'adjustment') {
      setAdjustmentErrors({});
    }
    if (value !== 'paid_leave') {
      setLeaveType('');
    } else if (!leaveType) {
      const [firstOption] = leaveTypeOptions;
      if (firstOption) setLeaveType(firstOption[0]);
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (dayType === 'adjustment') {
      const normalized = [];
      const errs = {};
      adjustments.forEach(row => {
        const rowErrors = validateAdjustmentRow(row);
        if (rowErrors.amount || rowErrors.notes) {
          errs[row.id] = rowErrors;
          return;
        }
        const amountValue = Math.abs(parseFloat(row.amount));
        const notesValue = typeof row.notes === 'string' ? row.notes.trim() : '';
        normalized.push({
          id: row.workSessionId || null,
          type: row.type === 'debit' ? 'debit' : 'credit',
          amount: amountValue,
          notes: notesValue,
        });
      });
      if (Object.keys(errs).length > 0) {
        setAdjustmentErrors(errs);
        toast.error('נא למלא סכום והערה עבור כל התאמה.', { duration: 15000 });
        return;
      }
      if (!normalized.length) {
        toast.error('יש להזין לפחות התאמה אחת.', { duration: 15000 });
        return;
      }
      setAdjustmentErrors({});
      await onSubmit({
        rows: [],
        dayType,
        adjustments: normalized,
      });
      return;
    }
    if (dayType === 'paid_leave') {
      if (!leaveType) {
        toast.error('יש לבחור סוג חופשה.', { duration: 15000 });
        return;
      }
      if (shouldIncludeWorkSegments && !validate()) {
        return;
      }
      const conflicts = shouldIncludeWorkSegments
        ? []
        : segments.reduce((list, segment, index) => {
          if (!segment || segment._status === 'deleted') {
            return list;
          }
          if (segment._status === 'existing') {
            return [...list, { segment, index }];
          }
          const hasData =
            (segment.hours && parseFloat(segment.hours) > 0) ||
            segment.service_id ||
            segment.sessions_count ||
            segment.students_count;
          if (hasData) {
            return [...list, { segment, index }];
          }
          return list;
        }, []);
      if (conflicts.length > 0) {
        const dateStr = format(new Date(selectedDate + 'T00:00:00'), 'dd/MM/yyyy');
        const details = conflicts.map(({ segment, index }) => {
          const hrs = segment.hours ? `, ${segment.hours} שעות` : '';
          const identifier = segment.id ? `ID ${segment.id}` : `שורה ${index + 1}`;
          return `${employee.name} ${dateStr}${hrs} (${identifier})`;
        }).join('\n');
        toast.error(`קיימים רישומי עבודה מתנגשים:\n${details}`, { duration: 10000 });
        return;
      }
      const sanitizedWorkRows = shouldIncludeWorkSegments
        ? sanitizeSegmentsForSubmit(segments)
        : [];
      if (shouldIncludeWorkSegments && sanitizedWorkRows.length === 0) {
        toast.error('נדרש להזין לפחות רישום עבודה לחצי היום השני.', { duration: 15000 });
        return;
      }
      if (shouldIncludeLeaveSecondHalf && !secondHalfLeaveType) {
        toast.error('יש לבחור סוג חופשה לחצי היום השני.', { duration: 15000 });
        return;
      }
      if (shouldIncludeLeaveSecondHalf) {
        const primarySource = firstHalfSystemPaid ? 'system_paid' : 'employee_paid';
        const secondarySource = getLeaveBaseKind(secondHalfLeaveType) || secondHalfLeaveType;
        if (
          (secondarySource === 'system_paid' && primarySource === 'system_paid')
          || (secondarySource === 'employee_paid' && primarySource === 'employee_paid')
        ) {
          toast.error('לא ניתן לשמור שני חצאי יום חופשה זהים. אנא הזן יום חופשה מלא.', { duration: 15000 });
          return;
        }
      }
      const sanitizedWorkIds = new Set(
        sanitizedWorkRows
          .filter(row => row && row.id)
          .map(row => String(row.id)),
      );
      const removedWorkIds = Array.from(new Set(
        segments
          .filter(segment => segment && segment._status === 'existing' && segment.id)
          .filter(segment => (
            !shouldIncludeWorkSegments
            || !sanitizedWorkIds.has(String(segment.id))
          ))
          .map(segment => segment.id),
      ));
      const submissionLeaveType = isHalfDaySelection ? 'half_day' : leaveType;
      const primaryHalfLeaveTypeValue = isHalfDaySelection
        ? (firstHalfSystemPaid ? 'system_paid' : 'employee_paid')
        : null;

      const submissionPayload = {
        rows: sanitizedWorkRows,
        dayType,
        paidLeaveId: currentPaidLeaveId,
        paidLeaveNotes,
        leaveType: submissionLeaveType,
        halfDaySecondHalfMode: secondHalfEnabled ? secondHalfMode : null,
        halfDayWorkSegments: sanitizedWorkRows,
        halfDaySecondLeaveType: shouldIncludeLeaveSecondHalf ? secondHalfLeaveType : null,
        includeHalfDaySecondHalf: secondHalfEnabled,
        halfDayRemovedWorkIds: removedWorkIds,
        halfDayPrimaryLeaveType: primaryHalfLeaveTypeValue,
      };

      const response = await onSubmit(submissionPayload);
      if (response?.needsConfirmation) {
        const fallbackValueNumber = Number(response.fallbackValue);
        const hasValidFallbackValue = Number.isFinite(fallbackValueNumber) && fallbackValueNumber > 0;
        const fractionValue = Number.isFinite(response.fraction) && response.fraction > 0
          ? response.fraction
          : 1;
        setFallbackPrompt({
          payload: submissionPayload,
          fraction: fractionValue,
          payable: response.payable !== false,
        });
        setFallbackAmount(hasValidFallbackValue
          ? String(response.fallbackValue ?? fallbackValueNumber)
          : '');
        setFallbackError('');
      }
      return;
    }
    if (!validate()) return;
    const sanitizedRows = sanitizeSegmentsForSubmit(segments);
    await onSubmit({ rows: sanitizedRows, dayType, paidLeaveId: currentPaidLeaveId, leaveType: null });
  };

  const handleFallbackDialogClose = (isOpen) => {
    if (isOpen) return;
    if (isConfirmingFallback) return;
    setFallbackPrompt(null);
    setFallbackAmount('');
    setFallbackError('');
  };

  const handleFallbackConfirm = async () => {
    if (!fallbackPrompt) return;
    const numericValue = Number(fallbackAmount);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      setFallbackError('נא להזין שווי יומי גדול מ-0.');
      return;
    }
    setFallbackError('');
    setIsConfirmingFallback(true);
    try {
      const payload = {
        ...fallbackPrompt.payload,
        overrideDailyValue: numericValue,
      };
      const response = await onSubmit(payload);
      if (response?.needsConfirmation) {
        const fallbackValueNumber = Number(response.fallbackValue);
        const hasValidFallbackValue = Number.isFinite(fallbackValueNumber) && fallbackValueNumber > 0;
        const fractionValue = Number.isFinite(response.fraction) && response.fraction > 0
          ? response.fraction
          : fallbackPrompt.fraction;
        setFallbackPrompt({
          payload,
          fraction: fractionValue,
          payable: response.payable !== false,
        });
        setFallbackAmount(hasValidFallbackValue
          ? String(response.fallbackValue ?? fallbackValueNumber)
          : '');
        setFallbackError('');
        setIsConfirmingFallback(false);
        return;
      }
      setFallbackPrompt(null);
      setFallbackAmount('');
      setFallbackError('');
    } catch {
      // Toasts are handled by the caller; keep dialog open for user correction
    } finally {
      setIsConfirmingFallback(false);
    }
  };

  const baseSummary = useMemo(() => {
    const active = segments.filter(s => s._status !== 'deleted');
    if (isGlobal) return `שכר יומי: ₪${globalPreviewAmount.toFixed(2)}`;
    if (isHourly) {
      const { rate } = getRateForDate(employee.id, selectedDate, null);
      const h = sumHours(active);
      return `שכר יומי: ₪${(h * rate).toFixed(2)} | סה"כ שעות: ${h}`;
    }
    const total = active.reduce((acc, s) => {
      const { rate } = getRateForDate(employee.id, selectedDate, s.service_id || null);
      return acc + (parseFloat(s.sessions_count || 0) * parseFloat(s.students_count || 0) * rate);
    }, 0);
    return `שכר יומי: ₪${total.toFixed(2)}`;
  }, [
    segments,
    isGlobal,
    globalPreviewAmount,
    isHourly,
    employee,
    selectedDate,
    getRateForDate,
  ]);

  const adjustmentSummary = useMemo(() => {
    if (!Array.isArray(adjustments) || adjustments.length === 0) {
      return 'לא הוזנו התאמות ליום זה.';
    }
    const total = adjustments.reduce((sum, item) => {
      const amountValue = parseFloat(item.amount);
      if (!item.amount || Number.isNaN(amountValue) || amountValue <= 0) {
        return sum;
      }
      const normalized = item.type === 'debit' ? -Math.abs(amountValue) : Math.abs(amountValue);
      return sum + normalized;
    }, 0);
    if (total === 0) {
      return 'לא הוזנו התאמות ליום זה.';
    }
    const prefix = total > 0 ? '+' : '-';
    return `סה"כ התאמות ליום: ${prefix}₪${Math.abs(total).toLocaleString()}`;
  }, [adjustments]);

  const leaveSummary = useMemo(() => {
    if (!isLeaveDay) return null;
    if (!leaveType) {
      return 'בחרו סוג חופשה כדי לחשב שווי.';
    }

    const option = LEAVE_TYPE_OPTIONS.find(opt => opt.value === leaveType);
    const optionLabel = option?.label || '';

    if (!isPaidLeavePreview) {
      return (
        <>
          <div className="text-base font-medium text-slate-900">היום סומן כחופשה ללא תשלום.</div>
          {optionLabel ? (
            <div className="text-xs text-slate-600 text-right">{optionLabel}</div>
          ) : null}
        </>
      );
    }

    const value = Number.isFinite(leaveDayValue) ? leaveDayValue : 0;
    const fraction = isHalfDaySelection ? 0.5 : 1;
    const amount = showPreStartWarning ? 0 : value * fraction;
    const baseLabel = optionLabel || (leaveType === 'half_day' ? HALF_DAY_LEAVE_LABEL : PAID_LEAVE_LABEL);
    const timePrefix = isHalfDaySelection ? 'שווי חצי יום' : 'שווי יום';
    const secondHalfSummary = secondHalfEnabled
      ? (shouldIncludeWorkSegments
        ? 'החצי השני יסומן כיום עבודה.'
        : 'החצי השני יסומן כחופשה נוספת.')
      : null;

    return (
      <>
        <div className="text-base font-medium text-slate-900">{`${timePrefix} ${baseLabel}: ₪${amount.toFixed(2)}`}</div>
        <div className="flex items-center justify-end gap-2 text-xs text-slate-600">
          <span>{`שיטה: ${leaveMethodLabel}`}</span>
          {leaveMethodDescription ? <InfoTooltip text={leaveMethodDescription} /> : null}
        </div>
        {secondHalfSummary ? (
          <div className="mt-1 text-xs text-slate-600 text-right">{secondHalfSummary}</div>
        ) : null}
        {showInsufficientHistoryHint ? (
          <div className="mt-1 text-xs text-amber-700 text-right">
            הערה: שווי יום החופשה חושב לפי תעריף נוכחי עקב חוסר בנתוני עבר.
          </div>
        ) : null}
        {showPreStartWarning ? (
          <div className="mt-1 text-xs text-amber-700 text-right">
            תאריך לפני תחילת עבודה—הושמט מהסכום
          </div>
        ) : null}
      </>
    );
  }, [
    isLeaveDay,
    leaveType,
    isPaidLeavePreview,
    leaveDayValue,
    isHalfDaySelection,
    leaveMethodLabel,
    leaveMethodDescription,
    showInsufficientHistoryHint,
    showPreStartWarning,
    secondHalfEnabled,
    shouldIncludeWorkSegments,
  ]);

  const summary = dayType === 'adjustment'
    ? adjustmentSummary
    : (isLeaveDay ? leaveSummary : baseSummary);

  const visibleSecondHalfLeaveType = secondHalfKind === 'system_paid'
    ? resolvedSecondHalfNonSystemType
    : secondHalfLeaveType;

  const renderSegment = (seg, idx, options = {}) => {
    if (!seg || seg._status === 'deleted') {
      return null;
    }
    const isHalfDayWork = options.isHalfDayWork === true;
    const disableSegment = isLeaveDay && !(isHalfDayWork && shouldIncludeWorkSegments);
    if (isGlobal) {
      const isPrimaryGlobalSegment = idx === firstActiveGlobalSegmentIndex;
      const segmentPreviewAmount = isPrimaryGlobalSegment ? globalPreviewAmount : 0;
      return (
        <GlobalSegment
          segment={seg}
          index={idx}
          onChange={changeSeg}
          onDuplicate={duplicateSeg}
          onDelete={deleteSeg}
          isFirst={idx === 0}
          dailyRate={segmentPreviewAmount}
          error={errors[idx]}
          disabled={disableSegment}
        />
      );
    }
    if (isHourly) {
      const { rate } = getRateForDate(employee.id, selectedDate, null);
      return (
        <HourlySegment
          segment={seg}
          index={idx}
          onChange={changeSeg}
          onDuplicate={duplicateSeg}
          onDelete={deleteSeg}
          rate={rate}
          error={errors[idx]}
          disabled={disableSegment}
        />
      );
    }
    const { rate } = getRateForDate(employee.id, selectedDate, seg.service_id || null);
    const errorValue = errors[idx];
    return (
      <InstructorSegment
        segment={seg}
        index={idx}
        services={services}
        onChange={changeSeg}
        onDuplicate={duplicateSeg}
        onDelete={deleteSeg}
        rate={rate}
        errors={{
          service: !seg.service_id && errorValue,
          sessions_count: errorValue && seg.service_id ? errorValue : null,
          students_count: errorValue && seg.service_id ? errorValue : null,
        }}
        disabled={disableSegment}
      />
    );
  };

  const renderAdjustmentSegment = (row, idx) => {
    const rowErrors = adjustmentErrors[row.id] || {};
    return (
      <div key={row.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-700">התאמה #{idx + 1}</div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-500 hover:bg-red-50"
                onClick={() => removeAdjustment(row.id)}
                aria-label="מחק התאמה"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>מחק התאמה</TooltipContent>
          </Tooltip>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1">
            <Label className="text-sm font-medium text-slate-700">סוג התאמה</Label>
            <div className="flex gap-2" role="radiogroup" aria-label="סוג התאמה">
              <Button
                type="button"
                variant={row.type === 'credit' ? 'default' : 'ghost'}
                className="flex-1 h-10"
                onClick={() => updateAdjustment(row.id, { type: 'credit' })}
              >
                זיכוי
              </Button>
              <Button
                type="button"
                variant={row.type === 'debit' ? 'default' : 'ghost'}
                className="flex-1 h-10"
                onClick={() => updateAdjustment(row.id, { type: 'debit' })}
              >
                ניכוי
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-sm font-medium text-slate-700">סכום (₪)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={row.amount}
              onChange={event => updateAdjustment(row.id, { amount: event.target.value })}
              className="bg-white h-10 text-base"
            />
            {rowErrors.amount ? (
              <p className="text-xs text-red-600 text-right">{rowErrors.amount}</p>
            ) : null}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-sm font-medium text-slate-700">הערות</Label>
            <Textarea
              value={row.notes}
              onChange={event => updateAdjustment(row.id, { notes: event.target.value })}
              rows={2}
              className="bg-white text-base leading-6"
              placeholder="הוסיפו הסבר קצר (חובה)"
            />
            {rowErrors.notes ? (
              <p className="text-xs text-red-600 text-right">{rowErrors.notes}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const addLabel = isHourly || isGlobal ? 'הוסף מקטע שעות' : 'הוסף רישום';

  const renderPaidLeaveSegment = () => (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-4 md:p-5 space-y-4">
      {currentPaidLeaveId ? (
        <div className="flex justify-end mb-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={requestDeleteLeave}
                aria-label="מחק רישום חופשה"
                className="h-7 w-7 text-red-500 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>מחק רישום חופשה</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
      <div className="space-y-1">
        <Label className="text-sm font-medium text-slate-700">סוג חופשה</Label>
        <Select value={visibleLeaveTypeValue} onValueChange={setLeaveType} disabled={isSystemPaidSelection}>
          <SelectTrigger className="bg-white h-10 text-base leading-6" disabled={isSystemPaidSelection}>
            <SelectValue placeholder="בחר סוג חופשה" />
          </SelectTrigger>
          <SelectContent>
            {leaveTypeOptions.map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label
            htmlFor="time-entry-system-paid-toggle"
            className="text-sm font-medium text-slate-700"
          >
            על חשבון המערכת
          </Label>
          <Switch
            id="time-entry-system-paid-toggle"
            checked={isSystemPaidSelection}
            onCheckedChange={handleSystemPaidToggle}
            disabled={disableSystemPaidSwitch}
            aria-label="על חשבון המערכת"
          />
        </div>
        {isSystemPaidSelection ? (
          <div
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            {SYSTEM_PAID_ALERT_TEXT}
          </div>
        ) : null}
      </div>
      <div className="space-y-1">
        <Label className="text-sm font-medium text-slate-700">הערות</Label>
        <Textarea
          value={paidLeaveNotes}
          onChange={e => setPaidLeaveNotes(e.target.value)}
          className="bg-white text-base leading-6"
          rows={2}
          maxLength={300}
          placeholder="הערה חופשית (לא חובה)"
        />
      </div>
      {isHalfDaySelection ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-medium text-slate-700" htmlFor="second-half-toggle">
              הוסף רישום לחצי היום השני
            </Label>
            <Switch
              id="second-half-toggle"
              checked={secondHalfEnabled}
              onCheckedChange={(checked) => {
                setIncludeSecondHalf(checked);
                if (!checked) {
                  setSecondHalfMode('work');
                }
              }}
              aria-label="הוסף רישום לחצי היום השני"
            />
          </div>
          {secondHalfEnabled ? (
            <div className="space-y-3 rounded-xl bg-slate-50 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">סוג הרישום הנוסף:</span>
                <Tabs value={secondHalfMode} onValueChange={setSecondHalfMode} className="min-w-[160px]">
                  <TabsList className="grid grid-cols-2 rounded-full bg-slate-200 p-1 h-9">
                    <TabsTrigger
                      value="work"
                      className="rounded-full text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900"
                    >
                      עבודה
                    </TabsTrigger>
                    <TabsTrigger
                      value="leave"
                      className="rounded-full text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900"
                    >
                      חופשה
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              {shouldIncludeLeaveSecondHalf ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-medium text-slate-700">סוג חופשה נוסף</Label>
                  </div>
                  {(secondHalfKind === 'system_paid' || secondHalfKind === 'employee_paid') ? (
                    <div
                      role="status"
                      className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-900"
                    >
                      {`החצי השני הוגדר אוטומטית כ${firstHalfSystemPaid ? 'מהמכסה' : 'על חשבון המערכת'} להשלמת יום מפוצל.`}
                    </div>
                  ) : null}
                  <Select
                    value={visibleSecondHalfLeaveType}
                    onValueChange={value => setSecondHalfLeaveType(value)}
                  >
                    <SelectTrigger className="bg-white h-10 text-base leading-6">
                      <SelectValue placeholder="בחר סוג לחצי השני" />
                    </SelectTrigger>
                    <SelectContent>
                      {secondaryLeaveTypeOptions.map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {!shouldIncludeWorkSegments ? null : (
                <p className="text-xs text-slate-600 text-right">
                  מלאו את מקטעי העבודה למטה כדי לשמור את חצי היום השני כרישום עבודה.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const visibleSegments = useMemo(() => {
    if (dayType === 'paid_leave') {
      const base = [{ id: 'paid_leave_notes', kind: 'leave' }];
      if (shouldIncludeWorkSegments) {
        segments.forEach((segment, index) => {
          if (!segment || segment._status === 'deleted') {
            return;
          }
          base.push({
            id: segment.id || `work-${index}`,
            kind: 'work',
            segment,
            originalIndex: index,
          });
        });
      }
      return base;
    }
    if (dayType === 'adjustment') {
      return adjustments;
    }
    return segments;
  }, [dayType, segments, adjustments, shouldIncludeWorkSegments]);

  const segmentRenderer = (item, idx) => {
    if (dayType === 'paid_leave') {
      if (!item) return null;
      if (item.kind === 'leave') {
        return renderPaidLeaveSegment();
      }
      if (item.kind === 'work') {
        return renderSegment(item.segment, item.originalIndex, { isHalfDayWork: true });
      }
      return null;
    }
    if (dayType === 'adjustment') {
      return renderAdjustmentSegment(item, idx);
    }
    return renderSegment(item, idx);
  };

  const addHandler = dayType === 'paid_leave'
    ? (shouldIncludeWorkSegments ? addSeg : null)
    : dayType === 'adjustment'
      ? addAdjustment
      : addSeg;

  const addButtonLabel = dayType === 'adjustment'
    ? 'הוסף התאמה'
    : addLabel;

  const parsedFallbackAmount = Number(fallbackAmount);
  const fallbackFraction = fallbackPrompt?.fraction ?? 1;
  const fallbackTotal = fallbackPrompt && fallbackPrompt.payable !== false && Number.isFinite(parsedFallbackAmount)
    ? parsedFallbackAmount * fallbackFraction
    : null;
  const fallbackDisplayAmount = typeof fallbackAmount === 'string' && fallbackAmount.trim().length > 0
    ? fallbackAmount.trim()
    : (Number.isFinite(parsedFallbackAmount) && parsedFallbackAmount !== 0
      ? String(parsedFallbackAmount)
      : '0');
  const fallbackTotalDisplay = fallbackTotal !== null
    ? String(fallbackTotal)
    : null;

  return (
    <form onSubmit={handleSave} className="flex flex-col w-[min(98vw,1100px)] max-w-[98vw] h-[min(92vh,calc(100dvh-2rem))]">
      <SingleDayEntryShell
        employee={employee}
        date={selectedDate}
        showDayType={allowDayTypeSelection ? true : isGlobal}
        dayType={dayType}
        onDayTypeChange={handleDayTypeChange}
        segments={visibleSegments}
        renderSegment={segmentRenderer}
        onAddSegment={addHandler}
        addLabel={addButtonLabel}
        summary={summary}
        onCancel={() => onSubmit(null)}
      />
      <AlertDialog
        open={isArchiveDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleArchiveDialogClose();
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
          {archiveSummaryText ? (
            <p className="text-sm text-slate-600">{archiveSummaryText}</p>
          ) : null}
          <AlertDialogFooter className="flex flex-row-reverse gap-2 sm:flex-row">
            <AlertDialogCancel onClick={handleArchiveDialogClose} disabled={isArchiving}>
              בטל
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmArchive}
              className="bg-sky-600 hover:bg-sky-700"
              disabled={isArchiving}
            >
              כן, העבר לארכיון
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={Boolean(fallbackPrompt)} onOpenChange={handleFallbackDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>אישור שווי יום החופשה</DialogTitle>
            <DialogDescription>
              {`שווי יום החופשה חושב לפי תעריף נוכחי עקב חוסר בנתוני עבר: ₪${fallbackDisplayAmount}. ניתן לעדכן או לאשר את הסכום לפני שמירה סופית.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {`שווי מוצע ליום מלא: ₪${fallbackDisplayAmount}`}
            </p>
            {fallbackTotalDisplay !== null ? (
              <p className="text-xs text-slate-500">
                {`תשלום מתוכנן לפי בחירה (${fallbackFraction === 0.5 ? 'חצי יום' : `מכפיל ${fallbackFraction}`}): ₪${fallbackTotalDisplay}`}
              </p>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="fallback-amount" className="text-sm font-medium text-slate-700">
                שווי יום חופשה לאישור (₪)
              </Label>
              <Input
                id="fallback-amount"
                type="number"
                min="0"
                step="0.01"
                value={fallbackAmount}
                onChange={(event) => {
                  setFallbackAmount(event.target.value);
                  if (fallbackError) setFallbackError('');
                }}
                autoFocus
                disabled={isConfirmingFallback}
              />
              {fallbackError ? (
                <p className="text-xs text-red-600 text-right">{fallbackError}</p>
              ) : null}
            </div>
          </div>
          <div className="flex justify-between gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleFallbackDialogClose(false)}
              disabled={isConfirmingFallback}
            >
              בטל
            </Button>
            <Button
              type="button"
              onClick={handleFallbackConfirm}
              disabled={isConfirmingFallback}
            >
              {isConfirmingFallback ? 'שומר...' : 'אשר סכום'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}
