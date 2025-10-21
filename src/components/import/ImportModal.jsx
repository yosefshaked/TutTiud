import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { parseText, parseFile, DELIMITERS } from '@/lib/parsers.js';
import { mapRows } from '@/lib/csvMapping.js';
import { validateRows } from '@/lib/validators.js';
import { isLeaveEntryType } from '@/lib/leave.js';
import { downloadCsvTemplate, downloadExcelTemplate } from '@/lib/excelTemplate.js';
import { format } from 'date-fns';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { createWorkSessions } from '@/api/work-sessions.js';

const GENERIC_RATE_SERVICE_ID = '00000000-0000-0000-0000-000000000000';

export default function ImportModal({ open, onOpenChange, employees, services, getRateForDate, onImported, workSessions = [] }) {
  const [employeeId, setEmployeeId] = useState('');
  const [tab, setTab] = useState('paste');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [detectedDelim, setDetectedDelim] = useState(',');
  const [overrideDelim, setOverrideDelim] = useState('');
  const [includeDup, setIncludeDup] = useState(false);
  const { authClient, user, loading, session } = useSupabase();
  const { tenantClientReady, activeOrgId } = useOrg();

  const handleFileChange = e => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const parseSource = async () => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) {
      toast.error('יש לבחור עובד לפני הפענוח');
      return;
    }
    try {
      let parsed;
      if (tab === 'file' && file) parsed = await parseFile(file, overrideDelim || undefined);
      else parsed = parseText(text, overrideDelim || undefined);
      setDetectedDelim(parsed.delimiter);
      const mapped = mapRows(parsed.headers, parsed.rows, services);
      const validated = validateRows(mapped, employee, services, getRateForDate, includeDup);
      setRows(validated);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleImport = async () => {
    const employee = employees.find(e => e.id === employeeId);
    const valid = rows.filter(r => r.errors.length === 0);
    if (!employee || !valid.length) {
      toast.error('אין שורות תקינות לייבוא');
      return;
    }
    const leaveSet = new Set(
      (workSessions || [])
        .filter(ws => ws.employee_id === employee.id && isLeaveEntryType(ws.entry_type))
        .map(ws => `${ws.employee_id}-${ws.date}`)
    );
    const payload = valid.map(r => ({
      employee_id: employee.id,
      date: r.date,
      entry_type: r.entry_type,
      service_id: r.entry_type === 'session' ? r.service_id : (employee.employee_type === 'hourly' ? GENERIC_RATE_SERVICE_ID : null),
      hours: r.entry_type === 'hours' ? (employee.employee_type === 'hourly' ? r.hours : (employee.employee_type === 'global' ? (r.hours || null) : null)) : null,
      sessions_count: r.entry_type === 'session' ? r.sessions_count : null,
      students_count: r.entry_type === 'session' ? r.students_count : null,
      notes: isLeaveEntryType(r.entry_type) ? 'leave' : r.notes || null,
      rate_used: r.rate_used,
      total_payment: r.total_payment,
    }));
    const conflicts = [];
    const filteredPayload = payload.filter(item => {
      if (isLeaveEntryType(item.entry_type)) return true;
      const key = `${item.employee_id}-${item.date}`;
      if (leaveSet.has(key)) {
        conflicts.push({ date: item.date });
        return false;
      }
      return true;
    });
    if (!filteredPayload.length) {
      if (conflicts.length > 0) {
        const lines = conflicts.map(c => {
          const dateValue = c.date ? new Date(`${c.date}T00:00:00`) : null;
          const formatted = dateValue && !Number.isNaN(dateValue.getTime())
            ? format(dateValue, 'dd/MM/yyyy')
            : (c.date || '');
          const suffix = employee.name ? ` (${employee.name})` : '';
          return `${formatted}${suffix}`.trim();
        }).filter(Boolean);
        if (lines.length) {
          toast.error(`לא ניתן להוסיף שעות בתאריך שכבר הוזנה בו חופשה:\n${lines.join('\n')}`, { duration: 15000 });
        }
      }
      return;
    }
    if (!session) {
      toast.error('נדרשת התחברות לפני ביצוע הייבוא.');
      return;
    }
    if (!activeOrgId) {
      toast.error('יש לבחור ארגון פעיל לפני ביצוע הייבוא.');
      return;
    }
    try {
      await createWorkSessions({ session, orgId: activeOrgId, sessions: filteredPayload });
    } catch (error) {
      toast.error(error.message || 'הייבוא נכשל. נסה שוב מאוחר יותר.');
      return;
    }
    toast.success(`${filteredPayload.length} שורות יובאו בהצלחה`);
    if (conflicts.length > 0) {
      const lines = conflicts.map(c => {
        const dateValue = c.date ? new Date(`${c.date}T00:00:00`) : null;
        const formatted = dateValue && !Number.isNaN(dateValue.getTime())
          ? format(dateValue, 'dd/MM/yyyy')
          : (c.date || '');
        const suffix = employee.name ? ` (${employee.name})` : '';
        return `${formatted}${suffix}`.trim();
      }).filter(Boolean);
      if (lines.length) {
        toast.error(`לא ניתן להוסיף שעות בתאריך שכבר הוזנה בו חופשה:\n${lines.join('\n')}`, { duration: 15000 });
      }
    }
    onImported();
    setRows([]);
    setText('');
    setFile(null);
    setEmployeeId('');
    onOpenChange(false);
  };

  const delimiterName = DELIMITERS[overrideDelim || detectedDelim];

  if (loading || !authClient) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ייבוא נתונים</DialogTitle>
          </DialogHeader>
          <p className="text-center text-slate-500">טוען את חיבור Supabase...</p>
        </DialogContent>
      </Dialog>
    );
  }

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ייבוא נתונים</DialogTitle>
          </DialogHeader>
          <p className="text-center text-slate-500">נא להתחבר לפני ייבוא נתונים.</p>
        </DialogContent>
      </Dialog>
    );
  }

  if (!tenantClientReady || !activeOrgId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ייבוא נתונים</DialogTitle>
          </DialogHeader>
          <p className="text-center text-slate-500">נדרש לבחור ארגון עם חיבור פעיל.</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>ייבוא נתונים</DialogTitle>
        </DialogHeader>
        <div className="flex justify-between mb-2">
          <div></div>
          <div className="space-x-2">
            <Button variant="outline" onClick={downloadExcelTemplate}>הורד Excel להזנה (.xlsx)</Button>
            <Button variant="outline" onClick={downloadCsvTemplate}>הורד CSV להזנה (.csv)</Button>
          </div>
        </div>
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger className="bg-white"><SelectValue placeholder="בחר עובד" /></SelectTrigger>
          <SelectContent>{employees.map(e => (<SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>))}</SelectContent>
        </Select>
        <Tabs value={tab} onValueChange={setTab} className="mt-4">
          <TabsList>
            <TabsTrigger value="paste">הדבקה</TabsTrigger>
            <TabsTrigger value="file">העלאת קובץ</TabsTrigger>
          </TabsList>
          <TabsContent value="paste" className="mt-4 space-y-2">
            <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="הדביקו כאן CSV או TSV" />
            <div className="text-sm text-slate-600 space-y-1">
              <div>אפשר להדביק CSV או TSV (טאבים)</div>
              <div>נתמכים מפרידים: פסיק / TAB / נקודה-פסיק / קו-אנכי</div>
              <div>שורות שמתחילות ב-# יזוהו כהערות וידולגו</div>
              <div>פורמט תאריך: DD/MM/YYYY</div>
              <div>אל תזינו 'שירות' לרישום של עובד גלובלי</div>
            </div>
          </TabsContent>
          <TabsContent value="file" className="mt-4">
            <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} />
          </TabsContent>
        </Tabs>
        {text && (
          <div className="mt-2 text-sm">זוהה מפריד: {delimiterName}</div>
        )}
        <div className="flex gap-4 mt-2 text-sm">
          {Object.entries(DELIMITERS).map(([d, name]) => (
            <label key={d} className="flex items-center gap-1"><input type="radio" name="delim" value={d} checked={overrideDelim===d} onChange={e=>setOverrideDelim(e.target.value)} />{name}</label>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2 text-sm">
          <input type="checkbox" checked={includeDup} onChange={e=>setIncludeDup(e.target.checked)} id="dup" />
          <label htmlFor="dup">ייבא שורות כפולות</label>
        </div>
        <Button className="mt-2" variant="outline" onClick={parseSource}>תצוגה מקדימה</Button>
        {rows.length > 0 && (
          <div className="max-h-64 overflow-auto border rounded mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="p-2">תאריך</th>
                  <th className="p-2">סוג</th>
                  <th className="p-2">שירות</th>
                  <th className="p-2">שעות</th>
                  <th className="p-2">שיעורים</th>
                  <th className="p-2">תלמידים</th>
                  <th className="p-2">סכום התאמה</th>
                  <th className="p-2">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0,100).map((r, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2 text-right">{r.date}</td>
                    <td className="p-2 text-right">{r.entry_type}</td>
                    <td className="p-2 text-right">{r.service_name || ''}</td>
                    <td className="p-2 text-right">{r.hours ?? ''}</td>
                    <td className="p-2 text-right">{r.sessions_count ?? ''}</td>
                    <td className="p-2 text-right">{r.students_count ?? ''}</td>
                    <td className="p-2 text-right">{r.adjustment_amount ?? ''}</td>
                    <td className="p-2 text-right">{r.errors.length ? r.errors.join('; ') : '✓ תקין'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>בטל</Button>
          <Button onClick={handleImport} disabled={!rows.some(r => r.errors.length === 0)}>ייבא</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
