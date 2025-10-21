import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import ConfirmPermanentDeleteModal from './ConfirmPermanentDeleteModal.jsx';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';
import { Undo2, Trash2 } from 'lucide-react';
import { HOLIDAY_TYPE_LABELS, getLeaveKindFromEntryType, inferLeaveType, isLeaveEntryType } from '@/lib/leave.js';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { permanentlyDeleteWorkSession, restoreWorkSession } from '@/api/work-sessions.js';

function resolveEmployeeName(employeesById, id) {
  const record = employeesById.get(id);
  return record ? record.name : '—';
}

function resolveServiceName(servicesById, id) {
  const record = servicesById.get(id);
  return record ? record.name : null;
}

function formatDate(value) {
  if (!value) return '—';
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return format(parsed, 'dd/MM/yyyy', { locale: he });
}

function formatDateTime(value) {
  if (!value) return '—';
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return format(parsed, 'dd/MM/yyyy HH:mm', { locale: he });
}

function formatAge(value) {
  if (!value) return '—';
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return formatDistanceToNow(parsed, { addSuffix: true, locale: he });
}

function resolveTypeLabel(entry) {
  if (!entry) return '—';
  if (entry.entry_type === 'hours') return 'שעות';
  if (entry.entry_type === 'session') return 'שיעורים';
  if (entry.entry_type === 'adjustment') return 'התאמה';
  if (isLeaveEntryType(entry.entry_type)) {
    const inferredType = inferLeaveType(entry);
    if (inferredType) {
      return HOLIDAY_TYPE_LABELS[inferredType] || inferredType;
    }
    const leaveKind = getLeaveKindFromEntryType(entry.entry_type);
    return HOLIDAY_TYPE_LABELS[leaveKind] || leaveKind || 'חופשה';
  }
  return entry.entry_type || '—';
}

function resolveValueLabel(entry, servicesById) {
  if (!entry) return '—';
  if (entry.entry_type === 'adjustment') {
    const amount = Number(entry.total_payment) || 0;
    const prefix = amount >= 0 ? '+' : '-';
    return `${prefix}₪${Math.abs(amount).toLocaleString()}`;
  }
  if (entry.entry_type === 'session') {
    const count = Number(entry.sessions_count) || 0;
    const service = resolveServiceName(servicesById, entry.service_id);
    if (service) {
      return `${count} × ${service}`;
    }
    return `${count} מפגשים`;
  }
  if (entry.entry_type === 'hours') {
    const hours = Number(entry.hours) || 0;
    return `${hours.toFixed(2)} שעות`;
  }
  if (isLeaveEntryType(entry.entry_type)) {
    const inferredType = inferLeaveType(entry);
    if (entry.payable === false) {
      if (inferredType) {
        return HOLIDAY_TYPE_LABELS[inferredType] || 'חופשה ללא תשלום';
      }
      return 'חופשה ללא תשלום';
    }
    const amount = Number(entry.total_payment) || 0;
    if (!amount) return '—';
    return `₪${amount.toLocaleString()}`;
  }
  if (entry.total_payment != null) {
    const amount = Number(entry.total_payment) || 0;
    if (!amount) return '—';
    return `₪${amount.toLocaleString()}`;
  }
  return '—';
}

function toIdArray(ids) {
  return (ids || []).map(id => String(id)).filter(Boolean);
}

export default function TrashTab({
  sessions = [],
  employees = [],
  services = [],
  onRestore,
  onPermanentDelete,
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [pendingPermanent, setPendingPermanent] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { session } = useSupabase();
  const { activeOrgId } = useOrg();

  const employeesById = useMemo(() => new Map(employees.map(emp => [emp.id, emp])), [employees]);
  const servicesById = useMemo(() => new Map(services.map(service => [service.id, service])), [services]);

  useEffect(() => {
    setSelectedIds(prev => {
      const existing = new Set(sessions.map(item => String(item.id)));
      return prev.filter(id => existing.has(id));
    });
  }, [sessions]);

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(sessions.map(item => String(item.id)));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const key = String(id);
      return prev.includes(key)
        ? prev.filter(existing => existing !== key)
        : [...prev, key];
    });
  };

  const closeRestoreDialog = () => setPendingRestore(null);
  const closePermanentDialog = () => setPendingPermanent(null);

  const ensureSessionAndOrg = () => {
    if (!session) {
      const error = new Error('נדרשת התחברות כדי לבצע פעולה זו.');
      error.code = 'AUTH_REQUIRED';
      throw error;
    }
    if (!activeOrgId) {
      const error = new Error('יש לבחור ארגון פעיל לפני ביצוע הפעולה.');
      error.code = 'ORG_REQUIRED';
      throw error;
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore) {
      closeRestoreDialog();
      return;
    }

    const normalizedIds = toIdArray(pendingRestore.ids);
    if (!normalizedIds.length) {
      closeRestoreDialog();
      return;
    }

    try {
      ensureSessionAndOrg();
      setSubmitting(true);
      await Promise.all(
        normalizedIds.map(sessionId => restoreWorkSession({
          session,
          orgId: activeOrgId,
          sessionId,
        })),
      );
      toast.success(normalizedIds.length === 1 ? 'הרישום שוחזר.' : 'הרישומים שוחזרו.');
      setSelectedIds(prev => prev.filter(id => !normalizedIds.includes(id)));
      if (typeof onRestore === 'function') {
        await onRestore(normalizedIds);
      }
      closeRestoreDialog();
    } catch (error) {
      console.error('Failed to restore work sessions', error);
      const message = error?.message || 'שחזור נכשל, נסו שוב.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPermanent = async () => {
    if (!pendingPermanent) {
      closePermanentDialog();
      return;
    }

    const normalizedIds = toIdArray(pendingPermanent.ids);
    if (!normalizedIds.length) {
      closePermanentDialog();
      return;
    }

    try {
      ensureSessionAndOrg();
      setSubmitting(true);
      await Promise.all(
        normalizedIds.map(sessionId => permanentlyDeleteWorkSession({
          session,
          orgId: activeOrgId,
          sessionId,
        })),
      );
      toast.success(normalizedIds.length === 1 ? 'הרישום נמחק לצמיתות.' : 'הרישומים נמחקו לצמיתות.');
      setSelectedIds(prev => prev.filter(id => !normalizedIds.includes(id)));
      if (typeof onPermanentDelete === 'function') {
        await onPermanentDelete(normalizedIds);
      }
      closePermanentDialog();
    } catch (error) {
      console.error('Failed to delete work sessions permanently', error);
      const message = error?.message || 'מחיקה נכשלה, נסו שוב.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const openRestoreDialog = (ids) => {
    const uniqueIds = toIdArray(ids);
    if (!uniqueIds.length) return;
    const label = uniqueIds.length === 1 ? 'רישום בודד' : `${uniqueIds.length} רישומים`;
    setPendingRestore({ ids: uniqueIds, label });
  };

  const openPermanentDialog = (ids) => {
    const uniqueIds = toIdArray(ids);
    if (!uniqueIds.length) return;
    setPendingPermanent({ ids: uniqueIds, summaryText: buildSummaryText(uniqueIds) });
  };

  const buildSummaryText = (ids) => {
    if (!ids.length) return '';
    if (ids.length === 1) {
      const record = sessions.find(item => String(item.id) === ids[0]);
      if (!record) return '';
      const employeeName = resolveEmployeeName(employeesById, record.employee_id);
      const dateLabel = formatDate(record.date);
      const typeLabel = resolveTypeLabel(record);
      return `${employeeName} • ${dateLabel} • ${typeLabel}`;
    }
    return `מחיקה לצמיתות של ${ids.length} רישומים`;
  };

  const selectedCount = selectedIds.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>סל אשפה</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            פריטים שנמחקו מומלץ להסיר לצמיתות תוך 90 יום. מחיקה לצמיתות אינה הפיכה.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => openRestoreDialog(selectedIds)}
              disabled={!selectedCount || submitting}
            >
              שחזר נבחרים
            </Button>
            <Button
              variant="destructive"
              onClick={() => openPermanentDialog(selectedIds)}
              disabled={!selectedCount || submitting}
            >
              מחק נבחרים לצמיתות
            </Button>
          </div>
          <div className="overflow-auto rounded-lg border">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <div className="flex items-center justify-center">
                      <input
                        id="trash-select-all"
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer"
                        checked={selectedCount > 0 && selectedCount === sessions.length}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        aria-label="בחר הכל"
                        disabled={!sessions.length || submitting}
                      />
                      <Label htmlFor="trash-select-all" className="sr-only">
                        בחר את כל הפריטים בסל האשפה
                      </Label>
                    </div>
                  </TableHead>
                  <TableHead>סוג</TableHead>
                  <TableHead>עובד</TableHead>
                  <TableHead>תאריך</TableHead>
                  <TableHead>ערך</TableHead>
                  <TableHead>נמחק ב־</TableHead>
                  <TableHead>לפני</TableHead>
                  <TableHead className="text-left">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-slate-500">
                      אין פריטים בסל האשפה.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map(session => {
                    const id = String(session.id);
                    const isChecked = selectedIds.includes(id);
                    const employeeName = resolveEmployeeName(employeesById, session.employee_id);
                    const rowCheckboxId = `trash-row-${id}`;
                    return (
                      <TableRow key={id} className={isChecked ? 'bg-slate-50' : undefined}>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            <input
                              id={rowCheckboxId}
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer"
                              checked={isChecked}
                              onChange={() => toggleSelection(id)}
                              aria-label={`בחר רישום ${id}`}
                              disabled={submitting}
                            />
                            <Label htmlFor={rowCheckboxId} className="sr-only">
                              {`בחר רישום ${employeeName !== '—' ? employeeName : id}`}
                            </Label>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{resolveTypeLabel(session)}</TableCell>
                        <TableCell>{employeeName}</TableCell>
                        <TableCell>{formatDate(session.date)}</TableCell>
                        <TableCell>{resolveValueLabel(session, servicesById)}</TableCell>
                        <TableCell>{formatDateTime(session.deleted_at)}</TableCell>
                        <TableCell>{formatAge(session.deleted_at)}</TableCell>
                        <TableCell className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openRestoreDialog([id])}
                            disabled={submitting}
                            className="flex items-center gap-1"
                          >
                            <Undo2 className="h-4 w-4" />
                            שחזר
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPermanentDialog([id])}
                            disabled={submitting}
                            className="flex items-center gap-1 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                            מחק לצמיתות
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(pendingRestore)} onOpenChange={(open) => !open && closeRestoreDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>שחזור רישומים</AlertDialogTitle>
            <AlertDialogDescription>
              שחזור {pendingRestore?.label || 'רישומים'} יחזיר אותם לתצוגה הראשית.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>בטל</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRestore} disabled={submitting}>
              שחזר
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmPermanentDeleteModal
        isOpen={Boolean(pendingPermanent)}
        onClose={closePermanentDialog}
        onConfirm={handleConfirmPermanent}
        summaryText={pendingPermanent?.summaryText || ''}
      />
    </div>
  );
}
