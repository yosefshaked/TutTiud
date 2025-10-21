import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EntryRow, { computeRowPayment } from './EntryRow.jsx';
import { copyFromPrevious, formatDatesCount, isRowCompleteForProgress } from './multiDateUtils.js';
import { format } from 'date-fns';
import { useTimeEntry } from './useTimeEntry.js';
import { ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import he from '@/i18n/he.json';
import { createLeaveDayValueResolver } from '@/lib/payroll.js';
import {
  LEAVE_TYPE_OPTIONS,
  SYSTEM_PAID_ALERT_TEXT,
  formatLeaveTypeLabel,
  getLeaveBaseKind,
} from '@/lib/leave.js';
import { Switch } from '@/components/ui/switch';
import { selectLeaveDayValue } from '@/selectors.js';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';

export default function MultiDateEntryModal({
  open,
  onClose,
  employees,
  services,
  selectedEmployees,
  selectedDates,
  getRateForDate,
  onSaved,
  workSessions = [],
  leavePayPolicy = null,
  leavePolicy = null,
  allowHalfDay = false,
  defaultMode = 'regular',
}) {
  const employeesById = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees]);
  const sortedDates = useMemo(() => [...selectedDates].sort((a, b) => a - b), [selectedDates]);
  const employeeStartDateMap = useMemo(() => {
    const map = new Map();
    employees.forEach(emp => {
      if (!emp?.start_date) return;
      const parsed = new Date(`${emp.start_date}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        map.set(emp.id, parsed);
      }
    });
    return map;
  }, [employees]);
  const invalidEmployeesForRange = useMemo(() => {
    if (!sortedDates.length) {
      return { ids: new Set(), names: [] };
    }
    const lastDate = sortedDates[sortedDates.length - 1];
    const lastTime = lastDate && !Number.isNaN(lastDate.getTime()) ? lastDate.getTime() : null;
    if (lastTime === null) {
      return { ids: new Set(), names: [] };
    }
    const ids = new Set();
    const names = [];
    selectedEmployees.forEach(empId => {
      const employee = employeesById[empId];
      if (!employee) return;
      const startDate = employeeStartDateMap.get(empId);
      if (!startDate) return;
      if (startDate.getTime() > lastTime) {
        ids.add(empId);
        names.push(employee.name || 'עובד');
      }
    });
    return { ids, names };
  }, [sortedDates, selectedEmployees, employeeStartDateMap, employeesById]);
  const invalidEmployeeIds = invalidEmployeesForRange.ids;
  const invalidEmployeeNames = invalidEmployeesForRange.names;
  const hasInvalidEmployees = invalidEmployeeIds.size > 0;
  const invalidEmployeesListText = useMemo(
    () => invalidEmployeeNames.join(', '),
    [invalidEmployeeNames],
  );
  const validSelectedEmployees = useMemo(
    () => selectedEmployees.filter(empId => !invalidEmployeeIds.has(empId)),
    [selectedEmployees, invalidEmployeeIds],
  );
  const initialRows = useMemo(() => {
    const items = [];
    for (const empId of validSelectedEmployees) {
      const emp = employeesById[empId];
      if (!emp) continue;
      for (const d of sortedDates) {
        items.push({
          employee_id: empId,
          date: format(d, 'yyyy-MM-dd'),
          entry_type: emp.employee_type === 'hourly'
            ? 'hours'
            : (emp.employee_type === 'instructor'
              ? 'session'
              : (emp.employee_type === 'global' ? 'hours' : undefined)),
          service_id: null,
          hours: '',
          sessions_count: '',
          students_count: '',
          notes: ''
        });
      }
    }
    return items;
  }, [validSelectedEmployees, sortedDates, employeesById]);

  const [rows, setRows] = useState(initialRows);
  useEffect(() => { setRows(initialRows); }, [initialRows]);
  const [showInvalidEmployeeNotice, setShowInvalidEmployeeNotice] = useState(false);
  useEffect(() => {
    if (open && hasInvalidEmployees) {
      setShowInvalidEmployeeNotice(true);
    }
  }, [open, hasInvalidEmployees]);
  useEffect(() => {
    if (!hasInvalidEmployees) {
      setShowInvalidEmployeeNotice(false);
    }
  }, [hasInvalidEmployees]);
  const { session, dataClient } = useSupabase();
  const { activeOrgId } = useOrg();

  const { saveWorkDay, saveLeaveDay, saveAdjustments } = useTimeEntry({
    employees,
    services,
    getRateForDate,
    metadataClient: dataClient,
    workSessions,
    leavePayPolicy,
    leavePolicy,
    session,
    orgId: activeOrgId,
  });

  const leaveValueResolver = useMemo(() => {
    return createLeaveDayValueResolver({
      employees,
      workSessions,
      services,
      leavePayPolicy,
      leaveDayValueSelector: selectLeaveDayValue,
    });
  }, [employees, workSessions, services, leavePayPolicy]);

  const normalizedDefaultMode = useMemo(() => {
    return defaultMode === 'leave' || defaultMode === 'adjustment' ? defaultMode : 'regular';
  }, [defaultMode]);
  const [mode, setMode] = useState(normalizedDefaultMode);
  useEffect(() => {
    if (open) {
      setMode(normalizedDefaultMode);
    }
  }, [open, normalizedDefaultMode]);
  const handleModeChange = useCallback((nextMode) => {
    setMode(nextMode);
    if (nextMode !== 'adjustment') {
      setAdjustmentErrors({});
    }
  }, []);
  const createDefaultWorkRow = useCallback((employee, dateStr) => {
    if (!employee) {
      return {
        id: null,
        employee_id: null,
        date: dateStr,
        entry_type: 'hours',
        service_id: null,
        hours: '',
        sessions_count: '',
        students_count: '',
        notes: '',
      };
    }
    let entryType = 'hours';
    if (employee.employee_type === 'instructor') {
      entryType = 'session';
    }
    return {
      id: null,
      employee_id: employee.id,
      date: dateStr,
      entry_type: entryType,
      service_id: null,
      hours: '',
      sessions_count: '',
      students_count: '',
      notes: '',
    };
  }, []);

  const leaveTypeOptions = useMemo(() => (
    LEAVE_TYPE_OPTIONS
      .filter(option => option.value !== 'mixed' && option.value !== 'system_paid' && option.value !== 'holiday_unpaid')
      .filter(option => allowHalfDay || option.value !== 'half_day')
      .map(option => [option.value, formatLeaveTypeLabel(option.value, option.label)])
  ), [allowHalfDay]);

  const defaultLeaveType = useMemo(() => leaveTypeOptions[0]?.[0] || 'employee_paid', [leaveTypeOptions]);

  const defaultUnpaidLeaveType = useMemo(() => {
    const found = leaveTypeOptions.find(([value]) => getLeaveBaseKind(value) === 'unpaid');
    return found?.[0] || null;
  }, [leaveTypeOptions]);

  const secondaryLeaveTypeOptions = useMemo(() => (
    LEAVE_TYPE_OPTIONS
      .filter(option => option.value !== 'mixed' && option.value !== 'half_day' && option.value !== 'system_paid' && option.value !== 'holiday_unpaid')
      .map(option => [option.value, formatLeaveTypeLabel(option.value, option.label)])
  ), []);

  const defaultSecondHalfLeaveType = useMemo(
    () => secondaryLeaveTypeOptions[0]?.[0] || 'employee_paid',
    [secondaryLeaveTypeOptions],
  );

  const createDefaultLeaveSelection = useCallback((employee, dateStr) => ({
    leaveType: defaultLeaveType,
    lastNonSystemLeaveType: defaultLeaveType,
    systemPaid: false,
    notes: '',
    includeSecondHalf: false,
    secondHalfMode: 'work',
    secondHalfLeaveType: defaultSecondHalfLeaveType,
    secondHalfLastNonSystemLeaveType: defaultSecondHalfLeaveType,
    workRow: createDefaultWorkRow(employee, dateStr),
    primaryHalfLeaveType: 'employee_paid',
  }), [defaultLeaveType, defaultSecondHalfLeaveType, createDefaultWorkRow]);

  const defaultLeaveSelections = useMemo(() => {
    const base = {};
    validSelectedEmployees.forEach(empId => {
      const employee = employeesById[empId];
      if (!employee) return;
      const inner = {};
      sortedDates.forEach(d => {
        const dateStr = format(d, 'yyyy-MM-dd');
        inner[dateStr] = createDefaultLeaveSelection(employee, dateStr);
      });
      base[empId] = inner;
    });
    return base;
  }, [validSelectedEmployees, sortedDates, employeesById, createDefaultLeaveSelection]);

  const [leaveSelections, setLeaveSelections] = useState(defaultLeaveSelections);
  useEffect(() => {
    setLeaveSelections(defaultLeaveSelections);
  }, [defaultLeaveSelections]);

  const allRowsSystemPaid = useMemo(() => {
    if (!validSelectedEmployees.length || !sortedDates.length) return false;
    let hasRows = false;
    for (const empId of validSelectedEmployees) {
      const employee = employeesById[empId];
      if (!employee) continue;
      const startDate = employeeStartDateMap.get(empId);
      const perDate = leaveSelections[empId] || {};
      for (const dateValue of sortedDates) {
        if (startDate && dateValue < startDate) {
          continue;
        }
        const dateStr = format(dateValue, 'yyyy-MM-dd');
        const selection = perDate[dateStr] || createDefaultLeaveSelection(employee, dateStr);
        const baseType = getLeaveBaseKind(selection.leaveType) || selection.leaveType;
        hasRows = true;
        if (baseType === 'half_day') {
          if (selection.primaryHalfLeaveType !== 'system_paid') {
            return false;
          }
        } else if (baseType !== 'system_paid') {
          return false;
        }
      }
    }
    return hasRows;
  }, [
    validSelectedEmployees,
    sortedDates,
    leaveSelections,
    employeesById,
    createDefaultLeaveSelection,
    employeeStartDateMap,
  ]);

  const hasPaidLeaveRows = useMemo(() => {
    for (const empId of validSelectedEmployees) {
      const employee = employeesById[empId];
      if (!employee) continue;
      const startDate = employeeStartDateMap.get(empId);
      const perDate = leaveSelections[empId] || {};
      for (const dateValue of sortedDates) {
        if (startDate && dateValue < startDate) {
          continue;
        }
        const dateStr = format(dateValue, 'yyyy-MM-dd');
        const selection = perDate[dateStr] || createDefaultLeaveSelection(employee, dateStr);
        const baseType = getLeaveBaseKind(selection.leaveType) || selection.leaveType;
        if (baseType === 'half_day') {
          if (selection.primaryHalfLeaveType === 'employee_paid' || selection.primaryHalfLeaveType === 'system_paid') {
            return true;
          }
        } else if (baseType !== 'unpaid') {
          return true;
        }
      }
    }
    return false;
  }, [
    validSelectedEmployees,
    sortedDates,
    leaveSelections,
    employeesById,
    createDefaultLeaveSelection,
    employeeStartDateMap,
  ]);

  const defaultAdjustmentValues = useMemo(() => {
    const base = {};
    validSelectedEmployees.forEach(empId => {
      const inner = {};
      sortedDates.forEach(d => {
        const dateStr = format(d, 'yyyy-MM-dd');
        inner[dateStr] = { type: 'credit', amount: '', notes: '' };
      });
      base[empId] = inner;
    });
    return base;
  }, [validSelectedEmployees, sortedDates]);

  const [adjustmentValues, setAdjustmentValues] = useState(defaultAdjustmentValues);
  const [adjustmentErrors, setAdjustmentErrors] = useState({});

  useEffect(() => {
    if (open && normalizedDefaultMode !== 'adjustment') {
      setAdjustmentErrors({});
    }
  }, [open, normalizedDefaultMode, setAdjustmentErrors]);

  useEffect(() => {
    setAdjustmentValues(defaultAdjustmentValues);
    setAdjustmentErrors({});
  }, [defaultAdjustmentValues]);

  useEffect(() => {
    setAdjustmentErrors({});
  }, [validSelectedEmployees, sortedDates]);

  const updateAdjustmentValue = useCallback((empId, dateStr, patch) => {
    setAdjustmentValues(prev => {
      const next = { ...prev };
      const inner = { ...(next[empId] || {}) };
      const current = inner[dateStr] || { type: 'credit', amount: '', notes: '' };
      inner[dateStr] = { ...current, ...patch };
      next[empId] = inner;
      return next;
    });
    setAdjustmentErrors(prev => {
      const next = { ...prev };
      if (!next[empId]) return next;
      const inner = { ...next[empId] };
      if (!inner[dateStr]) return next;
      delete inner[dateStr];
      if (Object.keys(inner).length === 0) {
        delete next[empId];
      } else {
        next[empId] = inner;
      }
      return next;
    });
  }, []);

  const adjustmentStats = useMemo(() => {
    let filled = 0;
    let total = 0;
    let sum = 0;
    validSelectedEmployees.forEach(empId => {
      const inner = adjustmentValues[empId] || {};
      sortedDates.forEach(d => {
        total += 1;
        const dateStr = format(d, 'yyyy-MM-dd');
        const entry = inner[dateStr];
        if (!entry) return;
        const amountValue = parseFloat(entry.amount);
        if (!entry.amount || Number.isNaN(amountValue) || amountValue <= 0) return;
        filled += 1;
        const normalized = entry.type === 'debit' ? -Math.abs(amountValue) : Math.abs(amountValue);
        sum += normalized;
      });
    });
    return { filled, total, sum };
  }, [adjustmentValues, validSelectedEmployees, sortedDates]);

  const summaryTotal = useMemo(() => rows.reduce((sum, row) => {
    const employee = employeesById[row.employee_id];
    if (!employee) return sum;
    const startDate = employeeStartDateMap.get(row.employee_id);
    if (startDate && row.date) {
      const candidate = new Date(`${row.date}T00:00:00`);
      if (!Number.isNaN(candidate.getTime()) && candidate < startDate) {
        return sum;
      }
    }
    const value = computeRowPayment(row, employee, services, getRateForDate, { leaveValueResolver });
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0), [rows, employeesById, services, getRateForDate, leaveValueResolver, employeeStartDateMap]);

  const filledCount = useMemo(
    () => rows.filter(r => {
      const employee = employeesById[r.employee_id];
      if (!employee) return false;
      const startDate = employeeStartDateMap.get(r.employee_id);
      if (startDate && r.date) {
        const candidate = new Date(`${r.date}T00:00:00`);
        if (!Number.isNaN(candidate.getTime()) && candidate < startDate) {
          return false;
        }
      }
      return isRowCompleteForProgress(r, employee);
    }).length,
    [rows, employeesById, employeeStartDateMap]
  );

  const [flash, setFlash] = useState(null);

  const formatConflictMessage = useCallback((items = []) => {
    if (!Array.isArray(items) || items.length === 0) return null;
    const lines = items.map(item => {
      const employee = employeesById[item.employeeId] || {};
      const name = item.employeeName || employee.name || '';
      const dateValue = item.date ? new Date(`${item.date}T00:00:00`) : null;
      const formatted = dateValue && !Number.isNaN(dateValue.getTime())
        ? format(dateValue, 'dd/MM/yyyy')
        : (item.date || '');
      return `${name} – ${formatted}`.trim();
    });
    if (!lines.some(Boolean)) return null;
    return `לא ניתן לשמור חופשה עבור התאריכים הבאים:\n${lines.join('\n')}`;
  }, [employeesById]);

  const formatRegularConflictMessage = useCallback((items = []) => {
    if (!Array.isArray(items) || items.length === 0) return null;
    const lines = items.map(item => {
      const employee = employeesById[item.employeeId] || {};
      const name = item.employeeName || employee.name || '';
      const dateValue = item.date ? new Date(`${item.date}T00:00:00`) : null;
      const formatted = dateValue && !Number.isNaN(dateValue.getTime())
        ? format(dateValue, 'dd/MM/yyyy')
        : (item.date || '');
      const suffix = name ? ` (${name})` : '';
      const line = `${formatted}${suffix}`.trim();
      return line;
    }).filter(Boolean);
    if (!lines.length) return null;
    return `לא ניתן להוסיף שעות בתאריך שכבר הוזנה בו חופשה:\n${lines.join('\n')}`;
  }, [employeesById]);

  const formatInvalidStartMessage = useCallback((items = []) => {
    if (!Array.isArray(items) || items.length === 0) return null;
    const lines = items.map(item => {
      const employee = employeesById[item.employeeId] || {};
      const name = item.employeeName || employee.name || '';
      const dateValue = item.date ? new Date(`${item.date}T00:00:00`) : null;
      const formattedDate = dateValue && !Number.isNaN(dateValue.getTime())
        ? format(dateValue, 'dd/MM/yyyy')
        : (item.date || '');
      const startSource = item.startDate || employee.start_date || '';
      const startValue = startSource ? new Date(`${startSource}T00:00:00`) : null;
      const formattedStart = startValue && !Number.isNaN(startValue.getTime())
        ? format(startValue, 'dd/MM/yyyy')
        : (startSource || '');
      if (formattedStart) {
        return `${name} – ${formattedDate} (תאריך התחלה ${formattedStart})`.trim();
      }
      return `${name} – ${formattedDate}`.trim();
    });
    if (!lines.some(Boolean)) return null;
    return `לא ניתן לשמור חופשה לפני תאריך תחילת העבודה:\n${lines.join('\n')}`;
  }, [employeesById]);

  const updateLeaveSelection = useCallback((empId, dateStr, updater) => {
    setLeaveSelections(prev => {
      const next = { ...prev };
      const inner = { ...(next[empId] || {}) };
      const employee = employeesById[empId];
      const current = inner[dateStr] || createDefaultLeaveSelection(employee, dateStr);
      const updated = typeof updater === 'function'
        ? updater(current)
        : { ...current, ...updater };
      inner[dateStr] = updated;
      next[empId] = inner;
      return next;
    });
  }, [employeesById, createDefaultLeaveSelection]);

  const updateLeaveWorkRow = useCallback((empId, dateStr, patch) => {
    const employee = employeesById[empId];
    updateLeaveSelection(empId, dateStr, current => {
      const baseRow = current.workRow || createDefaultWorkRow(employee, dateStr);
      return { ...current, workRow: { ...baseRow, ...patch } };
    });
  }, [employeesById, updateLeaveSelection, createDefaultWorkRow]);

  const setLeaveTypeForRow = useCallback((empId, dateStr, value) => {
    updateLeaveSelection(empId, dateStr, current => {
      const normalized = value || defaultLeaveType;
      const baseKind = getLeaveBaseKind(normalized) || normalized;
      const next = { ...current };

      if (normalized === 'system_paid') {
        next.leaveType = 'system_paid';
        next.systemPaid = true;
        return next;
      }

      next.leaveType = normalized;
      next.systemPaid = false;
      next.lastNonSystemLeaveType = normalized;

      if (normalized !== 'half_day') {
        next.includeSecondHalf = false;
        next.secondHalfMode = 'work';
        next.secondHalfLeaveType = defaultSecondHalfLeaveType;
        next.secondHalfLastNonSystemLeaveType = defaultSecondHalfLeaveType;
        next.primaryHalfLeaveType = 'employee_paid';
      } else if (baseKind === 'half_day' && !allowHalfDay) {
        next.leaveType = defaultLeaveType;
        next.lastNonSystemLeaveType = defaultLeaveType;
        next.includeSecondHalf = false;
        next.secondHalfMode = 'work';
        next.secondHalfLeaveType = defaultSecondHalfLeaveType;
        next.secondHalfLastNonSystemLeaveType = defaultSecondHalfLeaveType;
        next.primaryHalfLeaveType = 'employee_paid';
      } else if (normalized === 'half_day') {
        const employee = employeesById[empId];
        next.workRow = current.workRow || createDefaultWorkRow(employee, dateStr);
      }

      return next;
    });
  }, [
    updateLeaveSelection,
    defaultLeaveType,
    defaultSecondHalfLeaveType,
    allowHalfDay,
    employeesById,
    createDefaultWorkRow,
  ]);

  const toggleSystemPaidForRow = useCallback((empId, dateStr, checked) => {
    updateLeaveSelection(empId, dateStr, current => {
      const baseKind = getLeaveBaseKind(current.leaveType) || current.leaveType;
      if (current.leaveType === 'half_day') {
        return {
          ...current,
          primaryHalfLeaveType: checked ? 'system_paid' : 'employee_paid',
        };
      }
      if (baseKind === 'unpaid') {
        return current;
      }
      if (checked) {
        return { ...current, leaveType: 'system_paid', systemPaid: true };
      }
      const fallback = current.lastNonSystemLeaveType;
      const normalizedFallback = leaveTypeOptions.some(([value]) => value === fallback)
        ? fallback
        : defaultLeaveType;
      return {
        ...current,
        leaveType: normalizedFallback,
        systemPaid: false,
      };
    });
  }, [updateLeaveSelection, leaveTypeOptions, defaultLeaveType]);

  const handleMarkAllPaid = useCallback(() => {
    if (!validSelectedEmployees.length || !sortedDates.length) return;
    validSelectedEmployees.forEach(empId => {
      const startDate = employeeStartDateMap.get(empId);
      sortedDates.forEach(dateValue => {
        if (startDate && dateValue < startDate) {
          return;
        }
        const dateStr = format(dateValue, 'yyyy-MM-dd');
        setLeaveTypeForRow(empId, dateStr, defaultLeaveType);
      });
    });
  }, [validSelectedEmployees, sortedDates, setLeaveTypeForRow, defaultLeaveType, employeeStartDateMap]);

  const handleMarkAllUnpaid = useCallback(() => {
    if (!defaultUnpaidLeaveType || !validSelectedEmployees.length || !sortedDates.length) return;
    validSelectedEmployees.forEach(empId => {
      const startDate = employeeStartDateMap.get(empId);
      sortedDates.forEach(dateValue => {
        if (startDate && dateValue < startDate) {
          return;
        }
        const dateStr = format(dateValue, 'yyyy-MM-dd');
        setLeaveTypeForRow(empId, dateStr, defaultUnpaidLeaveType);
      });
    });
  }, [
    defaultUnpaidLeaveType,
    validSelectedEmployees,
    sortedDates,
    setLeaveTypeForRow,
    employeeStartDateMap,
  ]);

  const handleToggleGlobalSystemPaid = useCallback((checked) => {
    if (!validSelectedEmployees.length || !sortedDates.length) return;
    validSelectedEmployees.forEach(empId => {
      const startDate = employeeStartDateMap.get(empId);
      sortedDates.forEach(dateValue => {
        if (startDate && dateValue < startDate) {
          return;
        }
        const dateStr = format(dateValue, 'yyyy-MM-dd');
        toggleSystemPaidForRow(empId, dateStr, checked);
      });
    });
  }, [validSelectedEmployees, sortedDates, toggleSystemPaidForRow, employeeStartDateMap]);

  const handleMarkAllHalfDay = useCallback(() => {
    if (!allowHalfDay || !validSelectedEmployees.length || !sortedDates.length) return;
    validSelectedEmployees.forEach(empId => {
      const employee = employeesById[empId];
      if (!employee) return;
      const startDate = employeeStartDateMap.get(empId);
      const perDate = leaveSelections[empId] || {};
      sortedDates.forEach(dateValue => {
        if (startDate && dateValue < startDate) {
          return;
        }
        const dateStr = format(dateValue, 'yyyy-MM-dd');
        const selection = perDate[dateStr] || createDefaultLeaveSelection(employee, dateStr);
        const baseType = getLeaveBaseKind(selection.leaveType) || selection.leaveType;
        const isSystemPaid = baseType === 'system_paid'
          || selection.systemPaid
          || selection.primaryHalfLeaveType === 'system_paid';
        const isPaid = baseType === 'half_day'
          ? (selection.primaryHalfLeaveType === 'employee_paid' || selection.primaryHalfLeaveType === 'system_paid')
          : baseType !== 'unpaid';
        if (!isPaid) return;
        setLeaveTypeForRow(empId, dateStr, 'half_day');
        if (isSystemPaid) {
          toggleSystemPaidForRow(empId, dateStr, true);
        }
      });
    });
  }, [
    allowHalfDay,
    validSelectedEmployees,
    sortedDates,
    leaveSelections,
    employeesById,
    createDefaultLeaveSelection,
    setLeaveTypeForRow,
    toggleSystemPaidForRow,
    employeeStartDateMap,
  ]);

  const setIncludeSecondHalf = useCallback((empId, dateStr, checked) => {
    updateLeaveSelection(empId, dateStr, current => {
      const employee = employeesById[empId];
      const next = {
        ...current,
        includeSecondHalf: checked,
        secondHalfMode: checked ? current.secondHalfMode || 'work' : 'work',
      };
      if (checked && (next.secondHalfMode === 'work')) {
        next.workRow = current.workRow || createDefaultWorkRow(employee, dateStr);
      }
      return next;
    });
  }, [updateLeaveSelection, employeesById, createDefaultWorkRow]);

  const setSecondHalfModeForRow = useCallback((empId, dateStr, mode) => {
    updateLeaveSelection(empId, dateStr, current => {
      const nextMode = mode === 'leave' ? 'leave' : 'work';
      const employee = employeesById[empId];
      const next = {
        ...current,
        secondHalfMode: nextMode,
      };
      if (nextMode === 'work') {
        next.workRow = current.workRow || createDefaultWorkRow(employee, dateStr);
      }
      return next;
    });
  }, [updateLeaveSelection, employeesById, createDefaultWorkRow]);

  const setSecondHalfLeaveTypeForRow = useCallback((empId, dateStr, value) => {
    const normalized = value || defaultSecondHalfLeaveType;
    updateLeaveSelection(empId, dateStr, current => ({
      ...current,
      secondHalfLeaveType: normalized,
      secondHalfLastNonSystemLeaveType: normalized,
    }));
  }, [updateLeaveSelection, defaultSecondHalfLeaveType]);

  const updateLeaveNotes = useCallback((empId, dateStr, value) => {
    updateLeaveSelection(empId, dateStr, { notes: value });
  }, [updateLeaveSelection]);

  const buildWorkSegmentPayload = useCallback((segment) => {
    if (!segment) return null;
    return {
      id: segment.id || null,
      employee_id: segment.employee_id || null,
      date: segment.date || null,
      hours: segment.hours ?? null,
      service_id: segment.service_id || null,
      sessions_count: segment.sessions_count ?? null,
      students_count: segment.students_count ?? null,
      notes: segment.notes || null,
      entry_type: segment.entry_type || null,
    };
  }, []);

  const updateRow = (index, patch) => setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
  const handleCopy = (index, field) => {
    const { rows: updated, success } = copyFromPrevious(rows, index, field);
    setRows(updated);
    if (!success) {
      toast('אין ערך להעתקה');
    } else {
      setFlash({ index, field, ts: Date.now() });
    }
  };

  const removeRow = (index) => {
    setRows(prev => prev.filter((_, i) => i !== index));
    toast.success(he['toast.delete.success']);
  };

  const groupedRows = useMemo(() => {
    const map = new Map();
    rows.forEach((row, index) => {
      if (!row || !row.employee_id) return;
      if (!map.has(row.employee_id)) map.set(row.employee_id, []);
      map.get(row.employee_id).push({ row, index });
    });
    return Array.from(map.entries());
  }, [rows]);

  const [collapsed, setCollapsed] = useState({});
  const toggleEmp = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  const saveRegularBatches = useCallback(async () => {
    if (!rows.length) {
      toast.error('נא להזין לפחות רישום אחד.');
      return false;
    }

    const grouped = new Map();
    rows.forEach(row => {
      if (!row || !row.employee_id || !row.date) {
        return;
      }
      const startDate = employeeStartDateMap.get(row.employee_id);
      if (startDate) {
        const candidate = new Date(`${row.date}T00:00:00`);
        if (!Number.isNaN(candidate.getTime()) && candidate < startDate) {
          return;
        }
      }
      const key = `${row.employee_id}|${row.date}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push({ ...row });
    });

    if (grouped.size === 0) {
      toast.error('לא נמצאו רישומים תקינים לשמירה.');
      return false;
    }

    let savedCount = 0;

    for (const [key, segments] of grouped.entries()) {
      const [employeeId, date] = key.split('|');
      const employee = employeesById[employeeId];
      if (!employee) {
        continue;
      }

      const dayReference = new Date(`${date}T00:00:00`);
      const normalizedDay = Number.isNaN(dayReference.getTime()) ? undefined : dayReference;

      const segmentPayload = segments.map(segment => ({
        id: segment.id || null,
        hours: segment.hours ?? null,
        service_id: segment.service_id || null,
        sessions_count: segment.sessions_count || null,
        students_count: segment.students_count || null,
        notes: segment.notes || null,
        entry_type: segment.entry_type || null,
      }));

      try {
        const result = await saveWorkDay({
          employee,
          segments: segmentPayload,
          date,
          day: normalizedDay,
          dayType: 'work',
          source: 'multi_date',
        });
        const inserted = result?.insertedCount || 0;
        const updated = result?.updatedCount || 0;
        savedCount += inserted + updated;
      } catch (error) {
        if (error?.code === 'TIME_ENTRY_LEAVE_CONFLICT') {
          const message = formatRegularConflictMessage(error.conflicts);
          if (message) {
            toast.error(message, { duration: 15000 });
          }
        } else if (error?.message) {
          toast.error(error.message);
        } else {
          toast.error('השמירה נכשלה.');
        }
        return false;
      }
    }

    if (savedCount === 0) {
      toast.error('לא נמצאו רישומים לשמירה.');
      return false;
    }

    toast.success(`נשמרו ${savedCount} רישומים`);
    onSaved();
    onClose();
    return true;
  }, [rows, employeesById, saveWorkDay, formatRegularConflictMessage, onSaved, onClose, employeeStartDateMap]);

  const handleSaveLeaveMode = useCallback(async () => {
    if (!validSelectedEmployees.length || !sortedDates.length) {
      toast.error('בחרו עובדים ותאריכים להזנת חופשה');
      return;
    }

    let processedCount = 0;
    let fallbackCount = 0;
    let overrideCount = 0;

    for (const empId of validSelectedEmployees) {
      const employee = employeesById[empId];
      if (!employee) continue;
      const perDateSelections = leaveSelections[empId] || {};
      const startDate = employeeStartDateMap.get(empId);

      for (const dateValue of sortedDates) {
        if (startDate && dateValue < startDate) {
          continue;
        }
        const dateStr = format(dateValue, 'yyyy-MM-dd');
        const selection = perDateSelections[dateStr] || createDefaultLeaveSelection(employee, dateStr);
        const dayReference = new Date(`${dateStr}T00:00:00`);
        if (Number.isNaN(dayReference.getTime())) continue;

        const baseLeaveType = selection.leaveType || defaultLeaveType;
        const lastNonSystem = selection.lastNonSystemLeaveType;
        const normalizedLastNonSystem = leaveTypeOptions.some(([value]) => value === lastNonSystem)
          ? lastNonSystem
          : defaultLeaveType;
        const isHalfDay = baseLeaveType === 'half_day'
          || (baseLeaveType === 'system_paid' && normalizedLastNonSystem === 'half_day');
        const resolvedLeaveType = isHalfDay
          ? 'half_day'
          : (baseLeaveType === 'system_paid' ? 'system_paid' : baseLeaveType);
        const includeSecondHalf = isHalfDay && selection.includeSecondHalf;
        const secondHalfMode = includeSecondHalf ? selection.secondHalfMode : null;
        const workSegments = [];
        if (includeSecondHalf && secondHalfMode === 'work') {
          const payload = buildWorkSegmentPayload(selection.workRow || createDefaultWorkRow(employee, dateStr));
          if (payload) {
            workSegments.push(payload);
          }
        }
        const resolvedSecondHalfLeave = secondaryLeaveTypeOptions.some(([value]) => value === selection.secondHalfLeaveType)
          ? selection.secondHalfLeaveType
          : defaultSecondHalfLeaveType;
        const primaryHalfType = isHalfDay
          ? (selection.primaryHalfLeaveType === 'system_paid' ? 'system_paid' : 'employee_paid')
          : null;

        try {
          const result = await saveLeaveDay({
            employee,
            date: dateStr,
            day: dayReference,
            leaveType: resolvedLeaveType,
            paidLeaveNotes: selection.notes || null,
            source: 'multi_date',
            includeHalfDaySecondHalf: includeSecondHalf,
            halfDaySecondHalfMode: includeSecondHalf ? secondHalfMode : null,
            halfDayWorkSegments: includeSecondHalf && secondHalfMode === 'work' ? workSegments : [],
            halfDaySecondLeaveType: includeSecondHalf && secondHalfMode === 'leave'
              ? resolvedSecondHalfLeave
              : null,
            halfDayPrimaryLeaveType: primaryHalfType,
            halfDayRemovedWorkIds: [],
          });

          if (result?.needsConfirmation) {
            toast.error('נדרש לאשר ידנית את שווי יום החופשה. אנא השתמשו בטופס ליום בודד עבור תאריך זה.', { duration: 15000 });
            return;
          }

          processedCount += 1;
          if (result?.usedFallbackRate) {
            fallbackCount += 1;
          }
          if (result?.overrideApplied) {
            overrideCount += 1;
          }
        } catch (error) {
          if (error?.message === 'אין שינויים לשמירה.') {
            continue;
          }
          if (error?.code === 'TIME_ENTRY_LEAVE_CONFLICT') {
            let handled = false;
            if (Array.isArray(error.conflicts) && error.conflicts.length) {
              const message = formatConflictMessage(error.conflicts);
              if (message) {
                toast.error(message, { duration: 15000 });
                handled = true;
              }
            }
            if (Array.isArray(error.invalidStartDates) && error.invalidStartDates.length) {
              const invalidMessage = formatInvalidStartMessage(error.invalidStartDates);
              if (invalidMessage) {
                toast.error(invalidMessage, { duration: 15000 });
                handled = true;
              }
            }
            if (handled) return;
          }
          toast.error(error?.message || 'שמירת החופשה נכשלה.', { duration: 15000 });
          return;
        }
      }
    }

    if (processedCount === 0) {
      toast.error('לא נמצאו ימי חופשה לשמירה.');
      return;
    }

    toast.success(`נשמרו ${processedCount} ימי חופשה`);
    if (fallbackCount > 0) {
      toast.info(`הערה: עבור ${fallbackCount} ימי חופשה חושב שווי יומי חלופי.`);
    }
    if (overrideCount > 0) {
      toast.info(`הערה: ${overrideCount} ימי חופשה נשמרו עם ערך מאושר ידנית.`);
    }
    onSaved();
    onClose();
  }, [
    validSelectedEmployees,
    sortedDates,
    employeesById,
    leaveSelections,
    createDefaultLeaveSelection,
    defaultLeaveType,
    leaveTypeOptions,
    secondaryLeaveTypeOptions,
    buildWorkSegmentPayload,
    createDefaultWorkRow,
    defaultSecondHalfLeaveType,
    saveLeaveDay,
    formatConflictMessage,
    formatInvalidStartMessage,
    onSaved,
    onClose,
    employeeStartDateMap,
  ]);

  const regularSaveDisabled = mode === 'regular' && rows.length === 0;
  const leaveSaveDisabled = mode === 'leave' && (!validSelectedEmployees.length || !sortedDates.length);
  const handleAdjustmentSave = useCallback(async () => {
    const entries = [];
    const errors = {};
    let hasError = false;
    validSelectedEmployees.forEach(empId => {
      const employeeStart = employeeStartDateMap.get(empId);
      const inner = adjustmentValues[empId] || {};
      sortedDates.forEach(d => {
        if (employeeStart && d < employeeStart) {
          return;
        }
        const dateStr = format(d, 'yyyy-MM-dd');
        const entry = inner[dateStr];
        if (!entry) return;
        const amountValue = parseFloat(entry.amount);
        const rowErrors = {};
        if (!entry.amount || Number.isNaN(amountValue) || amountValue <= 0) {
          rowErrors.amount = 'סכום גדול מ-0 נדרש';
        }
        const notesValue = typeof entry.notes === 'string' ? entry.notes.trim() : '';
        if (!notesValue) {
          rowErrors.notes = 'יש להוסיף הערה להתאמה';
        }
        if (rowErrors.amount || rowErrors.notes) {
          hasError = true;
          if (!errors[empId]) errors[empId] = {};
          errors[empId][dateStr] = rowErrors;
          return;
        }
        entries.push({
          employee_id: empId,
          date: dateStr,
          type: entry.type === 'debit' ? 'debit' : 'credit',
          amount: amountValue,
          notes: notesValue,
        });
      });
    });
    if (hasError) {
      setAdjustmentErrors(errors);
      toast.error('נא למלא סכום והערה עבור כל התאמה.', { duration: 15000 });
      return;
    }
    if (!entries.length) {
      toast.error('נא להזין סכום לפחות להתאמה אחת.', { duration: 15000 });
      return;
    }
    try {
      const result = await saveAdjustments(entries);
      const insertedCount = Array.isArray(result?.inserted) ? result.inserted.length : entries.length;
      toast.success(`נשמרו ${insertedCount} התאמות`);
      setAdjustmentErrors({});
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error.message);
    }
  }, [
    adjustmentValues,
    validSelectedEmployees,
    sortedDates,
    setAdjustmentErrors,
    saveAdjustments,
    onSaved,
    onClose,
    employeeStartDateMap,
  ]);
  const adjustmentSaveDisabled = mode === 'adjustment' && adjustmentStats.filled === 0;
  const primaryDisabled = mode === 'leave'
    ? leaveSaveDisabled
    : (mode === 'adjustment' ? adjustmentSaveDisabled : regularSaveDisabled);

  const handlePrimarySave = useCallback(async () => {
    if (mode === 'leave') {
      await handleSaveLeaveMode();
      return;
    }
    if (mode === 'adjustment') {
      await handleAdjustmentSave();
      return;
    }
    await saveRegularBatches();
  }, [mode, handleSaveLeaveMode, handleAdjustmentSave, saveRegularBatches]);

  return (
      <Dialog open={open} onOpenChange={onClose}>
      <TooltipProvider>
        <DialogContent
          wide
          className="max-w-none w-[98vw] max-w-[1200px] p-0 overflow-hidden"
          style={{ maxHeight: 'none' }}
        >
          <DialogHeader>
            <DialogTitle className="sr-only">הזנה מרובה</DialogTitle>
            <DialogDescription className="sr-only">טופס הזנת רישומים למספר תאריכים</DialogDescription>
          </DialogHeader>
          <div
            data-testid="md-container"
            className="flex flex-col w-full h-[min(92vh,calc(100dvh-2rem))]"
          >
            <div
              data-testid="md-header"
              className="sticky top-0 z-20 bg-background border-b px-4 py-3"
            >
              <div className="flex items-center">
                <div className="text-xl font-semibold ml-auto">הזנה מרובה</div>
                <div className="text-sm text-slate-700 flex gap-2 mr-4">
                  <span>נבחרו {validSelectedEmployees.length} עובדים</span>
                  <span>{selectedDates.length} תאריכים להזנה</span>
                </div>
              </div>
            </div>

            <div
              className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-24 space-y-3 relative"
              data-testid="md-body"
            >
              <div className="flex items-center bg-slate-100 rounded-lg ring-1 ring-slate-200 p-1 gap-1">
                <Button
                  type="button"
                  variant={mode === 'regular' ? 'default' : 'ghost'}
                  className="flex-1 h-9"
                  onClick={() => handleModeChange('regular')}
                >
                  רישום שעות
                </Button>
                <Button
                  type="button"
                  variant={mode === 'leave' ? 'default' : 'ghost'}
                  className="flex-1 h-9"
                  onClick={() => handleModeChange('leave')}
                >
                  חופשה
                </Button>
                <Button
                  type="button"
                  variant={mode === 'adjustment' ? 'default' : 'ghost'}
                  className="flex-1 h-9"
                  onClick={() => handleModeChange('adjustment')}
                >
                  התאמות
                </Button>
              </div>

              {hasInvalidEmployees && showInvalidEmployeeNotice ? (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                  <div className="flex-1">
                    <p className="font-medium">העובדים הבאים טרם החלו לעבוד בטווח התאריכים שנבחר ויידלגו:</p>
                    <p className="mt-1 text-xs text-amber-800 text-right">{invalidEmployeesListText}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowInvalidEmployeeNotice(false)}
                    aria-label="סגירת התראה"
                  >
                    סגור
                  </Button>
                </div>
              ) : null}

              {mode === 'regular' ? (
                <>
                  <div className="flex text-sm text-slate-600">
                    <span>טיפ: אפשר להעתיק ערכים מהרישום הקודם עם האייקון ליד כל שדה.</span>
                    <span className="ml-auto">מולאו {filledCount} מתוך {rows.length} שורות</span>
                  </div>
                  <div className="text-right font-medium text-slate-700">סיכום כולל לרישומים: ₪{summaryTotal.toFixed(2)}</div>
                  {groupedRows.map(([empId, items], idx) => {
                    const emp = employeesById[empId];
                    const isCollapsed = collapsed[empId];
                    const startDate = employeeStartDateMap.get(empId);
                    return (
                      <div key={empId} className="space-y-3">
                        <div
                          className="flex items-center bg-slate-100 px-3 py-2 rounded-xl ring-1 ring-slate-200 cursor-pointer"
                          onClick={() => toggleEmp(empId)}
                        >
                          <span className="truncate max-w-[60%] text-[17px] font-semibold">{emp.name}</span>
                          <span className="ml-auto text-sm text-slate-600">{formatDatesCount(items.length)}</span>
                          <ChevronUp className={`h-4 w-4 mr-1 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
                        </div>
                        {!isCollapsed && (
                          <div className="space-y-3 mt-2 relative">
                            <div className="flex flex-col gap-3 mt-2">
                              {items.map(({ row, index }) => {
                                const rowDateValue = row.date ? new Date(`${row.date}T00:00:00`) : null;
                                const hasValidDate = rowDateValue && !Number.isNaN(rowDateValue.getTime());
                                const isBeforeStart = Boolean(startDate && hasValidDate && rowDateValue < startDate);
                                const formattedRowDate = hasValidDate ? format(rowDateValue, 'dd/MM/yyyy') : (row.date || '');
                                const formattedStart = startDate ? format(startDate, 'dd/MM/yyyy') : '';
                                if (isBeforeStart) {
                                  return (
                                    <div
                                      key={`${row.employee_id}-${row.date}-${index}`}
                                      className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900"
                                      aria-disabled="true"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-amber-900">{formattedRowDate}</span>
                                      </div>
                                      <p className="mt-2 text-right">
                                        תאריך זה לפני תאריך תחילת העבודה ({formattedStart}) ולכן לא ניתן להזין שעות עבורו.
                                      </p>
                                    </div>
                                  );
                                }
                                return (
                                  <EntryRow
                                    key={`${row.employee_id}-${row.date}-${index}`}
                                    value={row}
                                    employee={emp}
                                    services={services}
                                    getRateForDate={getRateForDate}
                                    leaveValueResolver={leaveValueResolver}
                                    onChange={(patch) => updateRow(index, patch)}
                                    onCopyField={(field) => handleCopy(index, field)}
                                    showSummary={true}
                                    readOnlyDate
                                    rowId={`row-${index}`}
                                    flashField={flash && flash.index === index ? flash.field : null}
                                    hideDayType={emp.employee_type === 'global'}
                                    allowRemove
                                    onRemove={() => removeRow(index)}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {idx !== groupedRows.length - 1 && <Separator className="my-4" />}
                      </div>
                    );
                  })}
                </>
              ) : mode === 'leave' ? (
                <div className="space-y-4">
                  <div className="text-sm text-slate-600">
                    בחרו סוג חופשה לכל תאריך. ניתן להגדיר חצי יום ולהוסיף רישום לחצי השני של היום בעת הצורך.
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-100 px-3 py-3 ring-1 ring-slate-200">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleMarkAllPaid}
                        disabled={!validSelectedEmployees.length || !sortedDates.length}
                      >
                        סמן הכל כתשלום
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleMarkAllUnpaid}
                        disabled={!validSelectedEmployees.length || !sortedDates.length || !defaultUnpaidLeaveType}
                      >
                        סמן הכל כלא תשלום
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleMarkAllHalfDay}
                        disabled={!allowHalfDay || !hasPaidLeaveRows}
                      >
                        סמן חצי יום לכל הימים בתשלום
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs font-medium text-slate-600" htmlFor="leave-global-system-paid">
                        על חשבון המערכת
                      </Label>
                      <Switch
                        id="leave-global-system-paid"
                        checked={allRowsSystemPaid}
                        onCheckedChange={handleToggleGlobalSystemPaid}
                        disabled={!validSelectedEmployees.length || !sortedDates.length}
                        aria-label="החל על חשבון המערכת לכל הימים"
                      />
                    </div>
                  </div>
                  {validSelectedEmployees.length === 0 ? (
                    <div className="text-sm text-slate-600">בחרו לפחות עובד אחד להזנת חופשה.</div>
                  ) : null}
                  {validSelectedEmployees.map(empId => {
                    const emp = employeesById[empId];
                    const perDateSelections = leaveSelections[empId] || {};
                    const employeeStartDate = employeeStartDateMap.get(empId);
                    return (
                      <div key={empId} className="space-y-4 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[17px] font-semibold truncate max-w-[60%]">{emp?.name || 'עובד'}</span>
                          <span className="text-sm text-slate-600">{formatDatesCount(sortedDates.length)}</span>
                        </div>
                        {sortedDates.length === 0 ? (
                          <div className="text-sm text-slate-600">בחרו תאריכים להזנת חופשה.</div>
                        ) : (
                          <div className="space-y-3">
                            {sortedDates.map(dateValue => {
                              const dateStr = format(dateValue, 'yyyy-MM-dd');
                              const selection = perDateSelections[dateStr] || createDefaultLeaveSelection(emp, dateStr);
                              const lastNonSystem = selection.lastNonSystemLeaveType;
                              const normalizedLastNonSystem = leaveTypeOptions.some(([value]) => value === lastNonSystem)
                                ? lastNonSystem
                                : defaultLeaveType;
                              const baseType = selection.leaveType || normalizedLastNonSystem;
                              const isHalfDay = baseType === 'half_day'
                                || (baseType === 'system_paid' && normalizedLastNonSystem === 'half_day');
                              const isSystemPaid = isHalfDay
                                ? selection.primaryHalfLeaveType === 'system_paid'
                                : baseType === 'system_paid';
                              const visibleLeaveType = isHalfDay
                                ? 'half_day'
                                : (isSystemPaid ? normalizedLastNonSystem : baseType);
                              const selectValue = leaveTypeOptions.some(([value]) => value === visibleLeaveType)
                                ? visibleLeaveType
                                : defaultLeaveType;
                              const includeSecondHalf = isHalfDay && selection.includeSecondHalf;
                              const secondHalfMode = selection.secondHalfMode || 'work';
                              const workRow = selection.workRow || createDefaultWorkRow(emp, dateStr);
                              const systemPaidDisabled = !isHalfDay && (getLeaveBaseKind(selectValue) === 'unpaid');
                              const resolvedSecondHalfType = secondaryLeaveTypeOptions.some(([value]) => value === selection.secondHalfLeaveType)
                                ? selection.secondHalfLeaveType
                                : (
                                  secondaryLeaveTypeOptions.some(([value]) => value === selection.secondHalfLastNonSystemLeaveType)
                                    ? selection.secondHalfLastNonSystemLeaveType
                                    : defaultSecondHalfLeaveType
                                );
                              if (employeeStartDate && dateValue < employeeStartDate) {
                                const formattedStart = format(employeeStartDate, 'dd/MM/yyyy');
                                return (
                                  <div
                                    key={`${empId}-${dateStr}`}
                                    className="space-y-2 rounded-xl bg-slate-50 px-3 py-3 ring-1 ring-slate-200"
                                    aria-disabled="true"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <span className="text-sm font-medium text-slate-700">{format(dateValue, 'dd/MM/yyyy')}</span>
                                    </div>
                                    <p className="text-xs text-slate-600 text-right">
                                      תאריך זה לפני תאריך תחילת העבודה ({formattedStart}) ולכן לא ניתן להזין חופשה עבורו.
                                    </p>
                                  </div>
                                );
                              }
                              return (
                                <div
                                  key={`${empId}-${dateStr}`}
                                  className="space-y-3 rounded-xl bg-slate-50 px-3 py-3 ring-1 ring-slate-200"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <span className="text-sm font-medium text-slate-700">{format(dateValue, 'dd/MM/yyyy')}</span>
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs font-medium text-slate-600" htmlFor={`system-paid-${empId}-${dateStr}`}>
                                        על חשבון המערכת
                                      </Label>
                                      <Switch
                                        id={`system-paid-${empId}-${dateStr}`}
                                        checked={isSystemPaid}
                                        disabled={systemPaidDisabled}
                                        onCheckedChange={checked => toggleSystemPaidForRow(empId, dateStr, checked)}
                                        aria-label="על חשבון המערכת"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-end">
                                    <div className="space-y-1">
                                      <Label className="text-sm font-medium text-slate-700">סוג חופשה</Label>
                                      <Select
                                        value={selectValue}
                                        onValueChange={value => setLeaveTypeForRow(empId, dateStr, value)}
                                      >
                                        <SelectTrigger className="bg-white h-10 text-base leading-6">
                                          <SelectValue placeholder="בחר סוג חופשה" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {leaveTypeOptions.map(([value, label]) => (
                                            <SelectItem key={value} value={value}>{label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-sm font-medium text-slate-700">הערות</Label>
                                      <Textarea
                                        value={selection.notes || ''}
                                        onChange={event => updateLeaveNotes(empId, dateStr, event.target.value)}
                                        rows={2}
                                        className="bg-white text-base leading-6"
                                        placeholder="הערה חופשית (לא חובה)"
                                      />
                                    </div>
                                  </div>
                                  {isSystemPaid ? (
                                    <div
                                      role="alert"
                                      className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900"
                                    >
                                      {SYSTEM_PAID_ALERT_TEXT}
                                    </div>
                                  ) : null}
                                  {isHalfDay ? (
                                    <div className="space-y-3 rounded-xl bg-white px-3 py-3 ring-1 ring-slate-200">
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm font-medium text-slate-700">חצי היום השני</span>
                                        <Switch
                                          checked={includeSecondHalf}
                                          onCheckedChange={checked => setIncludeSecondHalf(empId, dateStr, checked)}
                                          aria-label="הוסף רישום לחצי היום השני"
                                        />
                                      </div>
                                      <div className="text-xs text-slate-600">
                                        חצי היום הראשון נשמר כ{isSystemPaid ? 'על חשבון המערכת' : 'חופשה בתשלום מהמקצה'}.
                                      </div>
                                      {includeSecondHalf ? (
                                        <div className="space-y-3">
                                          <div className="flex gap-2">
                                            <Button
                                              type="button"
                                              variant={secondHalfMode === 'work' ? 'default' : 'outline'}
                                              onClick={() => setSecondHalfModeForRow(empId, dateStr, 'work')}
                                            >
                                              עבודה
                                            </Button>
                                            <Button
                                              type="button"
                                              variant={secondHalfMode === 'leave' ? 'default' : 'outline'}
                                              onClick={() => setSecondHalfModeForRow(empId, dateStr, 'leave')}
                                            >
                                              חופשה
                                            </Button>
                                          </div>
                                          {secondHalfMode === 'work' ? (
                                            <div className="space-y-2 rounded-xl bg-slate-50 px-2 py-2 ring-1 ring-slate-200">
                                              <EntryRow
                                                value={workRow}
                                                employee={emp}
                                                services={services}
                                                getRateForDate={getRateForDate}
                                                leaveValueResolver={leaveValueResolver}
                                                onChange={patch => updateLeaveWorkRow(empId, dateStr, patch)}
                                                showSummary={true}
                                                readOnlyDate
                                                rowId={`half-work-${empId}-${dateStr}`}
                                                hideDayType={emp?.employee_type === 'global'}
                                                allowRemove={false}
                                              />
                                              <p className="text-xs text-slate-600 text-right">
                                                מלאו את פרטי העבודה לחצי היום השני.
                                              </p>
                                            </div>
                                          ) : (
                                            <div className="space-y-2">
                                              <Label className="text-sm font-medium text-slate-700">סוג חופשה לחצי השני</Label>
                                              <Select
                                                value={resolvedSecondHalfType}
                                                onValueChange={value => setSecondHalfLeaveTypeForRow(empId, dateStr, value)}
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
                                          )}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm text-slate-600">
                    מלאו סכום לכל התאמות שתרצו לשמור. שורות ללא סכום יידלגו אוטומטית.
                  </div>
                  {validSelectedEmployees.length === 0 ? (
                    <div className="text-sm text-slate-600">בחרו לפחות עובד אחד להזנת התאמות.</div>
                  ) : null}
                  {validSelectedEmployees.map(empId => {
                    const emp = employeesById[empId];
                    const map = adjustmentValues[empId] || {};
                    const employeeStart = employeeStartDateMap.get(empId);
                    return (
                      <div key={empId} className="space-y-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[17px] font-semibold truncate max-w-[60%]">{emp?.name || 'עובד'}</span>
                          <span className="text-sm text-slate-600">{formatDatesCount(sortedDates.length)}</span>
                        </div>
                        <div className="space-y-2">
                          {sortedDates.length === 0 ? (
                            <div className="text-sm text-slate-600">בחרו תאריכים להזנת התאמות.</div>
                          ) : null}
                          {sortedDates.map(d => {
                            if (employeeStart && d < employeeStart) {
                              const formattedStart = format(employeeStart, 'dd/MM/yyyy');
                              return (
                                <div
                                  key={`${empId}-${format(d, 'yyyy-MM-dd')}`}
                                  className="space-y-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200"
                                  aria-disabled="true"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <span className="text-sm font-medium text-slate-700">{format(d, 'dd/MM/yyyy')}</span>
                                  </div>
                                  <p className="text-xs text-slate-600 text-right">
                                    תאריך זה לפני תאריך תחילת העבודה ({formattedStart}) ולכן לא ניתן להזין התאמה עבורו.
                                  </p>
                                </div>
                              );
                            }
                            const dateStr = format(d, 'yyyy-MM-dd');
                            const entry = map[dateStr] || { type: 'credit', amount: '', notes: '' };
                            const rowErrors = (adjustmentErrors[empId] && adjustmentErrors[empId][dateStr]) || {};
                            const isDebit = entry.type === 'debit';
                            return (
                              <div
                                key={`${empId}-${dateStr}`}
                                className="space-y-3 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <span className="text-sm font-medium text-slate-700">{format(d, 'dd/MM/yyyy')}</span>
                                  <div className="flex gap-2" role="radiogroup" aria-label={`סוג התאמה עבור ${format(d, 'dd/MM/yyyy')}`}>
                                    <Button
                                      type="button"
                                      variant={!isDebit ? 'default' : 'ghost'}
                                      className="h-9"
                                      onClick={() => updateAdjustmentValue(empId, dateStr, { type: 'credit' })}
                                    >
                                      זיכוי
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={isDebit ? 'default' : 'ghost'}
                                      className="h-9"
                                      onClick={() => updateAdjustmentValue(empId, dateStr, { type: 'debit' })}
                                    >
                                      ניכוי
                                    </Button>
                                  </div>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                  <div className="space-y-1">
                                    <Label className="text-sm font-medium text-slate-700">סכום (₪)</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={entry.amount}
                                      onChange={event => updateAdjustmentValue(empId, dateStr, { amount: event.target.value })}
                                      className="bg-white h-10 text-base"
                                    />
                                    {rowErrors.amount ? (
                                      <p className="text-xs text-red-600 text-right">{rowErrors.amount}</p>
                                    ) : null}
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-sm font-medium text-slate-700">הערות</Label>
                                    <Textarea
                                      value={entry.notes}
                                      onChange={event => updateAdjustmentValue(empId, dateStr, { notes: event.target.value })}
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
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              data-testid="md-footer"
              className="shrink-0 bg-background border-t px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-end gap-3 sm:flex-row-reverse">
                {mode === 'adjustment' ? (
                  <div className="text-sm font-medium text-slate-700 text-right">
                    {adjustmentStats.total > 0
                      ? `סה"כ התאמות: ${adjustmentStats.sum > 0 ? '+' : adjustmentStats.sum < 0 ? '-' : ''}₪${Math.abs(adjustmentStats.sum).toLocaleString()} (${adjustmentStats.filled}/${adjustmentStats.total})`
                      : 'סה"כ התאמות: ₪0'}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose}>בטל</Button>
                  <Button
                    onClick={handlePrimarySave}
                    disabled={primaryDisabled}
                  >
                    שמור רישומים
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </TooltipProvider>
    </Dialog>
  );
}
