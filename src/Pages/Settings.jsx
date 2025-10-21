import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Save, Trash2, PlugZap, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SetupAssistant from '@/components/settings/SetupAssistant.jsx';
import OrgMembersCard from '@/components/settings/OrgMembersCard.jsx';
import EmploymentScopeSettings from '@/components/settings/EmploymentScopeSettings.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import {
  DEFAULT_LEAVE_POLICY,
  HOLIDAY_TYPE_LABELS,
  LEAVE_TYPE_OPTIONS,
  normalizeLeavePolicy,
  findHolidayForDate,
  normalizeHolidayRule,
  DEFAULT_LEAVE_PAY_POLICY,
  LEAVE_PAY_METHOD_OPTIONS,
  normalizeLeavePayPolicy,
  DEFAULT_LEGAL_INFO_URL,
} from '@/lib/leave.js';
import { fetchLeavePolicySettings, fetchLeavePayPolicySettings } from '@/lib/settings-client.js';
import { upsertSetting } from '@/api/settings.js';

function createNewRule() {
  const today = new Date().toISOString().slice(0, 10);
  return normalizeHolidayRule({
    name: '',
    type: 'employee_paid',
    start_date: today,
    end_date: today,
  });
}

function HolidayRuleRow({ rule, onChange, onRemove, onSave, allowHalfDay, isSaving }) {
  const typeOptions = useMemo(() => {
    if (allowHalfDay) return LEAVE_TYPE_OPTIONS;
    return LEAVE_TYPE_OPTIONS.filter(option => option.value !== 'half_day');
  }, [allowHalfDay]);
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Input
          value={rule.name}
          onChange={(event) => onChange(rule.id, { name: event.target.value })}
          placeholder="שם החג"
        />
      </TableCell>
      <TableCell>
        <select
          value={rule.type}
          onChange={(event) => onChange(rule.id, { type: event.target.value })}
          className="w-full border rounded-md px-3 py-2 text-sm bg-white"
        >
          {typeOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <Input
          type="date"
          value={rule.start_date || ''}
          onChange={(event) => onChange(rule.id, { start_date: event.target.value })}
        />
      </TableCell>
      <TableCell>
        <Input
          type="date"
          value={rule.end_date || ''}
          min={rule.start_date || undefined}
          onChange={(event) => onChange(rule.id, { end_date: event.target.value })}
        />
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="outline">{HOLIDAY_TYPE_LABELS[rule.type] || 'הגדרה מותאמת'}</Badge>
      </TableCell>
      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSave(rule.id)}
            disabled={isSaving}
            className="gap-1"
            aria-label="שמור כלל חג"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'שומר...' : 'שמור'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(rule.id)}
            className="text-red-600 hover:bg-red-50"
            aria-label="מחק כלל חג"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function Settings() {
  const { activeOrg, activeOrgHasConnection, tenantClientReady, activeOrgId } = useOrg();
  const [policy, setPolicy] = useState(DEFAULT_LEAVE_POLICY);
  const [leavePayPolicy, setLeavePayPolicy] = useState(DEFAULT_LEAVE_PAY_POLICY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingLeavePayPolicy, setIsSavingLeavePayPolicy] = useState(false);
  const setupDialogAutoOpenRef = useRef(!activeOrgHasConnection);
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(!activeOrgHasConnection);
  const { authClient, user, loading, session } = useSupabase();

  useEffect(() => {
    if (activeOrgHasConnection) {
      setupDialogAutoOpenRef.current = false;
      setIsSetupDialogOpen(false);
      return;
    }
    if (!setupDialogAutoOpenRef.current) {
      setupDialogAutoOpenRef.current = true;
      setIsSetupDialogOpen(true);
    }
  }, [activeOrgHasConnection]);

  const handleSetupDialogChange = (open) => {
    setIsSetupDialogOpen(open);
    if (!open && !activeOrgHasConnection) {
      setupDialogAutoOpenRef.current = true;
    }
  };
  useEffect(() => {
    if (!activeOrgHasConnection || !tenantClientReady || !session || !activeOrgId) {
      setPolicy(DEFAULT_LEAVE_POLICY);
      setLeavePayPolicy(DEFAULT_LEAVE_PAY_POLICY);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadPolicy = async () => {
      setIsLoading(true);
      try {
        if (!session) {
          throw new Error('נדרש להתחבר מחדש כדי לקרוא הגדרות.');
        }
        if (!activeOrgId) {
          throw new Error('בחרו ארגון פעיל לפני טעינת ההגדרות.');
        }

        const [leavePolicyResult, leavePayPolicyResult] = await Promise.all([
          fetchLeavePolicySettings({ session, orgId: activeOrgId }),
          fetchLeavePayPolicySettings({ session, orgId: activeOrgId }),
        ]);

        if (cancelled) {
          return;
        }

        setPolicy(
          leavePolicyResult.value
            ? normalizeLeavePolicy(leavePolicyResult.value)
            : DEFAULT_LEAVE_POLICY,
        );

        setLeavePayPolicy(
          leavePayPolicyResult.value
            ? normalizeLeavePayPolicy(leavePayPolicyResult.value)
            : DEFAULT_LEAVE_PAY_POLICY,
        );
      } catch (error) {
        console.error('Error loading leave policy', error);
        toast.error('שגיאה בטעינת הגדרות החופשה');
        setPolicy(DEFAULT_LEAVE_POLICY);
        setLeavePayPolicy(DEFAULT_LEAVE_PAY_POLICY);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPolicy();
    return () => {
      cancelled = true;
    };
  }, [activeOrgHasConnection, tenantClientReady, session, activeOrgId]);

  const handleToggle = (key) => (checked) => {
    setPolicy(prev => ({ ...prev, [key]: checked }));
  };

  const handleNumberChange = (key) => (event) => {
    const value = event.target.value;
    if (value === '') {
      setPolicy(prev => ({ ...prev, [key]: 0 }));
      return;
    }
    const numeric = Number(value);
    setPolicy(prev => ({
      ...prev,
      [key]: Number.isNaN(numeric) ? prev[key] : numeric,
    }));
  };

  const handleRuleChange = (id, updates) => {
    setPolicy(prev => ({
      ...prev,
      holiday_rules: (prev.holiday_rules || []).map(rule =>
        rule.id === id ? { ...rule, ...updates } : rule
      ),
    }));
  };

  const handleRuleRemove = (id) => {
    setPolicy(prev => ({
      ...prev,
      holiday_rules: prev.holiday_rules.filter(rule => rule.id !== id),
    }));
  };

  const addRule = () => {
    setPolicy(prev => ({
      ...prev,
      holiday_rules: [...(prev.holiday_rules || []), createNewRule()],
    }));
  };

  const handleSave = async () => {
    if (!activeOrgHasConnection) {
      toast.error('השלם את חיבור ה-Supabase לפני שמירה.');
      return;
    }
    setIsSaving(true);
    try {
      const normalized = normalizeLeavePolicy(policy);
      if (!session) {
        throw new Error('נדרש להתחבר מחדש לפני שמירת ההגדרות.');
      }
      if (!activeOrgId) {
        throw new Error('בחרו ארגון פעיל לפני שמירת ההגדרות.');
      }

      await upsertSetting({
        session,
        orgId: activeOrgId,
        key: 'leave_policy',
        value: normalized,
      });
      setPolicy(normalized);
      toast.success('הגדרות החופשה נשמרו בהצלחה');
    } catch (error) {
      console.error('Error saving leave policy', error);
      toast.error('שמירת ההגדרות נכשלה');
    }
    setIsSaving(false);
  };

  const handleRuleSave = async (ruleId) => {
    const hasRule = (policy.holiday_rules || []).some(rule => rule.id === ruleId);
    if (!hasRule) return;
    await handleSave();
  };

  const handleLeavePayMethodChange = (event) => {
    const { value } = event.target;
    setLeavePayPolicy(prev => ({
      ...prev,
      default_method: value,
    }));
  };

  const handleLeavePayToggle = (key) => (checked) => {
    setLeavePayPolicy(prev => ({
      ...prev,
      [key]: checked,
    }));
  };

  const handleLeavePayNumberChange = (key) => (event) => {
    const { value } = event.target;
    setLeavePayPolicy(prev => ({
      ...prev,
      [key]: value === '' ? '' : Number(value),
    }));
  };

  const handleLeavePayInputChange = (key) => (event) => {
    setLeavePayPolicy(prev => ({
      ...prev,
      [key]: event.target.value,
    }));
  };

  const handleSaveLeavePayPolicy = async () => {
    if (!activeOrgHasConnection) {
      toast.error('השלם את חיבור ה-Supabase לפני שמירה.');
      return;
    }
    setIsSavingLeavePayPolicy(true);
    try {
      const normalized = normalizeLeavePayPolicy(leavePayPolicy);
      if (!session) {
        throw new Error('נדרש להתחבר מחדש לפני שמירת ההגדרות.');
      }
      if (!activeOrgId) {
        throw new Error('בחרו ארגון פעיל לפני שמירת ההגדרות.');
      }

      await upsertSetting({
        session,
        orgId: activeOrgId,
        key: 'leave_pay_policy',
        value: normalized,
      });
      setLeavePayPolicy(normalized);
      toast.success('שיטת חישוב שווי יום חופשה נשמרה בהצלחה');
    } catch (error) {
      console.error('Error saving leave pay policy', error);
      toast.error('שמירת שיטת חישוב שווי יום חופשה נכשלה');
    }
    setIsSavingLeavePayPolicy(false);
  };

  const handleOpenLegalInfo = () => {
    const url = (leavePayPolicy.legal_info_url || '').trim() || DEFAULT_LEGAL_INFO_URL;
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const upcomingHoliday = findHolidayForDate(policy);
  const resolvedLegalInfoUrl = (leavePayPolicy.legal_info_url || '').trim() || DEFAULT_LEGAL_INFO_URL;

  if (loading || !authClient) {
    return (
      <div className="p-6 text-center text-slate-500">
        טוען חיבור Supabase...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 text-center text-slate-500">
        יש להתחבר כדי להגדיר את הארגון.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">חגים וימי חופשה</h1>
          <p className="text-slate-600">נהל את מדיניות החופשות והחגים הארגונית במקום מרכזי אחד</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.5fr,1fr]">
          <Card className="border-0 shadow-lg bg-white/80" dir="rtl">
            <CardHeader className="border-b border-slate-200 space-y-3">
              <CardTitle className="flex flex-col gap-2 text-xl font-semibold text-slate-900 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-center gap-2 text-slate-900">
                  <PlugZap className="w-5 h-5 text-blue-600" aria-hidden="true" />
                  מצב חיבור Supabase
                </span>
                <Badge className={activeOrgHasConnection ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}>
                  {activeOrgHasConnection ? 'חיבור פעיל' : 'נדרש חיבור'}
                </Badge>
              </CardTitle>
              <p className="text-sm text-slate-600">
                {activeOrgHasConnection
                  ? 'החיבור הנוכחי מאפשר שמירה וטעינה של מדיניות החופשות. ניתן לפתוח את האשף כדי לעדכן מפתחות או להריץ בדיקות חוזרות.'
                  : 'השלם את אשף ההגדרה כדי לחבר את Supabase ולשמור את מדיניות החופשות עבור הארגון.'}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                <span>ארגון פעיל: {activeOrg ? activeOrg.name : 'לא נבחר ארגון'}</span>
                {activeOrgHasConnection ? (
                  <div className="flex items-center gap-1 text-emerald-700">
                    <Sparkles className="w-4 h-4" aria-hidden="true" />
                    <span>האשף זמין לכל בדיקה חוזרת</span>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-end gap-3 pt-6">
              <Button onClick={() => setIsSetupDialogOpen(true)} className="gap-2">
                <PlugZap className="w-4 h-4" aria-hidden="true" />
                {activeOrgHasConnection ? 'נהל חיבור Supabase' : 'התחל אשף הגדרה'}
              </Button>
            </CardContent>
          </Card>

          <OrgMembersCard />
        </div>

        <Dialog open={isSetupDialogOpen} onOpenChange={handleSetupDialogChange}>
          <DialogContent
            wide
            className="max-w-5xl w-[min(100vw-2rem,1080px)] p-0 bg-transparent shadow-none"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>אשף הגדרת חיבור Supabase</DialogTitle>
              <DialogDescription>
                השלם את ההגדרות והבדיקות כדי לחבר את הארגון הפעיל ל-Supabase.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[85vh] overflow-y-auto p-2 sm:p-4">
              <SetupAssistant />
            </div>
          </DialogContent>
        </Dialog>

        {activeOrgHasConnection ? (
          <>
            {/* Storage Usage widget temporarily disabled; flip features.storageUsage=true to re-enable (requires RPCs). */}

        <Card className="border-0 shadow-lg bg-white/80">
          <CardHeader className="border-b">
            <CardTitle className="text-xl font-semibold text-slate-900">הגדרות כלליות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-2/3" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-between border rounded-lg p-4 bg-slate-50">
                  <div>
                    <Label className="text-sm font-semibold text-slate-700">אישור חצי יום</Label>
                    <p className="text-xs text-slate-500 mt-1">אפשר הקלטת שימוש של 0.5 יום בחופשה</p>
                  </div>
                  <Switch checked={policy.allow_half_day} onCheckedChange={handleToggle('allow_half_day')} />
                </div>

                <div className="flex items-center justify-between border rounded-lg p-4 bg-slate-50">
                  <div>
                    <Label className="text-sm font-semibold text-slate-700">היתרה יכולה לרדת למינוס</Label>
                    <p className="text-xs text-slate-500 mt-1">אפשר חריגה מהמכסה לטווח המוגדר</p>
                  </div>
                  <Switch checked={policy.allow_negative_balance} onCheckedChange={handleToggle('allow_negative_balance')} />
                </div>

                {policy.allow_negative_balance && (
                  <div className="border rounded-lg p-4 bg-slate-50">
                    <Label className="text-sm font-semibold text-slate-700">כמות חריגה מימי החופש המוגדרים</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={policy.negative_floor_days}
                      onChange={handleNumberChange('negative_floor_days')}
                      className="mt-2"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between border rounded-lg p-4 bg-slate-50">
                  <div>
                    <Label className="text-sm font-semibold text-slate-700">העברת יתרה לשנה הבאה</Label>
                    <p className="text-xs text-slate-500 mt-1">יתרות חיוביות יעברו לשנה הבאה עד למגבלה</p>
                  </div>
                  <Switch checked={policy.carryover_enabled} onCheckedChange={handleToggle('carryover_enabled')} />
                </div>

                {policy.carryover_enabled && (
                  <div className="border rounded-lg p-4 bg-slate-50">
                    <Label className="text-sm font-semibold text-slate-700">מקסימום להעברה</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={policy.carryover_max_days}
                      onChange={handleNumberChange('carryover_max_days')}
                      className="mt-2"
                    />
                  </div>
                )}

                {upcomingHoliday && (
                  <div className="border rounded-lg p-4 bg-emerald-50 text-emerald-800">
                    <p className="text-sm font-semibold">החג הקרוב לפי ההגדרות</p>
                    <p className="text-sm mt-1">{upcomingHoliday.name || upcomingHoliday.label}</p>
                    <p className="text-xs mt-1 text-emerald-700">{HOLIDAY_TYPE_LABELS[upcomingHoliday.type]}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={isSaving || isLoading} className="gap-2">
                <Save className="w-4 h-4" />
                {isSaving ? 'שומר...' : 'שמור הגדרות'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <EmploymentScopeSettings
          session={session}
          orgId={activeOrgId}
          activeOrgHasConnection={activeOrgHasConnection}
        />

        <Card className="border-0 shadow-lg bg-white/80">
          <CardHeader className="border-b">
            <CardTitle className="text-xl font-semibold text-slate-900">שיטת חישוב שווי יום חופשה לעובדים שאינם גלובליים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-600 text-right">
                  ברירת המחדל היא השיטה החוקית (מומלץ) כדי להבטיח עמידה בדרישות החוק. ניתן לבחור חלופות בהתאם להסכמות בארגון.
                </p>
                <div className="space-y-3">
                  {LEAVE_PAY_METHOD_OPTIONS.map(option => {
                    const isActive = leavePayPolicy.default_method === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex items-center gap-4 border rounded-lg p-4 cursor-pointer transition-colors flex-row-reverse ${
                          isActive ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="leave-pay-method"
                          value={option.value}
                          checked={isActive}
                          onChange={handleLeavePayMethodChange}
                          className="w-4 h-4"
                        />
                        <div className="flex-1 text-right">
                          <p className="font-semibold text-slate-800">{option.title}</p>
                          {option.description && (
                            <p className="text-sm text-slate-500 mt-1">{option.description}</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-semibold text-slate-700">תקופת בדיקה (חודשים)</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={leavePayPolicy.lookback_months ?? ''}
                      onChange={handleLeavePayNumberChange('lookback_months')}
                    />
                  </div>
                  <div className="flex items-center justify-between border rounded-lg p-4 bg-slate-50">
                    <div className="text-right">
                      <Label className="text-sm font-semibold text-slate-700">אפשר לבדוק גם 12 חודשים ולהחיל את הגבוה לעובד</Label>
                      <p className="text-xs text-slate-500 mt-1">נבדקת גם תקופת 12 חודשים כאשר האפשרות מסומנת</p>
                    </div>
                    <Switch
                      checked={Boolean(leavePayPolicy.legal_allow_12m_if_better)}
                      onCheckedChange={handleLeavePayToggle('legal_allow_12m_if_better')}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-semibold text-slate-700">תעריף יומי קבוע (₪)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={leavePayPolicy.fixed_rate_default ?? ''}
                      onChange={handleLeavePayNumberChange('fixed_rate_default')}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-semibold text-slate-700">קישור למידע בחוק</Label>
                    <Input
                      type="url"
                      value={leavePayPolicy.legal_info_url || ''}
                      placeholder="https://..."
                      onChange={handleLeavePayInputChange('legal_info_url')}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 justify-end">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={handleOpenLegalInfo}
                    disabled={!resolvedLegalInfoUrl}
                  >
                    מידע בחוק
                  </Button>
                  <Button onClick={handleSaveLeavePayPolicy} disabled={isSavingLeavePayPolicy || isLoading} className="gap-2">
                    <Save className="w-4 h-4" />
                    {isSavingLeavePayPolicy ? 'שומר...' : 'שמור שיטת חישוב'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-white/80">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b">
            <div>
              <CardTitle className="text-xl font-semibold text-slate-900">כללי חגים</CardTitle>
              <p className="text-sm text-slate-500 mt-1">הוסף, ערוך או הסר כללים לקביעת ימי חג והטיפול בהם</p>
            </div>
            <Button onClick={addRule} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" />
              הוסף כלל חדש
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שם חג</TableHead>
                    <TableHead className="text-right">סוג חופשה</TableHead>
                  <TableHead className="text-right">תאריך התחלה</TableHead>
                  <TableHead className="text-right">תאריך סיום</TableHead>
                  <TableHead className="text-right">תגית</TableHead>
                  <TableHead className="w-32 text-right">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(policy.holiday_rules || []).length === 0 ? (
                  <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                        לא הוגדרו חגים. הוסף כלל חדש כדי להתחיל.
                      </TableCell>
                    </TableRow>
                  ) : (
                    policy.holiday_rules.map(rule => (
                      <HolidayRuleRow
                        key={rule.id}
                        rule={rule}
                        onChange={handleRuleChange}
                        onRemove={handleRuleRemove}
                        onSave={handleRuleSave}
                        allowHalfDay={policy.allow_half_day}
                        isSaving={isSaving}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
          </>
        ) : (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 text-sm text-right">
            השלם את אשף ההגדרה כדי להטעין ולהגדיר את מדיניות החופשות עבור הארגון.
          </div>
        )}
      </div>
    </div>
  );
}
