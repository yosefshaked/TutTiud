import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { fetchEmploymentScopePolicySettings } from '@/lib/settings-client.js';
import { upsertSetting } from '@/api/settings.js';

const EMPLOYMENT_SCOPE_OPTIONS = [
  { value: 'global', label: 'גלובלי', disabled: true },
  { value: 'hourly', label: 'שעתי', disabled: false },
  { value: 'instructor', label: 'מדריך', disabled: false },
];

const DEFAULT_POLICY = { enabled_types: ['global'] };

function normalizePolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_POLICY;
  }

  const allowedValues = EMPLOYMENT_SCOPE_OPTIONS.map(option => option.value);
  const normalizedTypes = Array.isArray(value.enabled_types)
    ? [
        ...new Set(
          value.enabled_types
            .map(item => (typeof item === 'string' ? item.trim() : ''))
            .filter(item => item && allowedValues.includes(item)),
        ),
      ]
    : [];

  if (!normalizedTypes.includes('global')) {
    normalizedTypes.unshift('global');
  }

  return normalizedTypes.length ? { enabled_types: normalizedTypes } : DEFAULT_POLICY;
}

function EmploymentScopeSettings({ session, orgId, activeOrgHasConnection }) {
  const [policy, setPolicy] = useState(DEFAULT_POLICY);
  const [initialPolicy, setInitialPolicy] = useState(DEFAULT_POLICY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadPolicy = async () => {
      if (!activeOrgHasConnection || !session || !orgId) {
        setPolicy(DEFAULT_POLICY);
        setInitialPolicy(DEFAULT_POLICY);
        setIsLoading(false);
        setError('');
        return;
      }

      setIsLoading(true);
      setError('');

      try {
        const result = await fetchEmploymentScopePolicySettings({ session, orgId });
        if (cancelled) {
          return;
        }

        const normalized = normalizePolicy(result?.value);
        setPolicy(normalized);
        setInitialPolicy(normalized);
      } catch (fetchError) {
        console.error('Failed to load employment scope policy', fetchError);
        if (!cancelled) {
          setPolicy(DEFAULT_POLICY);
          setInitialPolicy(DEFAULT_POLICY);
          setError('שגיאה בטעינת הגדרות היקף המשרה');
          toast.error('שגיאה בטעינת היקף המשרה');
        }
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
  }, [activeOrgHasConnection, session, orgId]);

  const enabledTypes = useMemo(
    () => (policy.enabled_types ? [...policy.enabled_types] : []),
    [policy.enabled_types],
  );

  const initialEnabledTypes = useMemo(
    () => (initialPolicy.enabled_types ? [...initialPolicy.enabled_types] : []),
    [initialPolicy.enabled_types],
  );

  const hasChanges = useMemo(() => {
    if (enabledTypes.length !== initialEnabledTypes.length) {
      return true;
    }
    const currentSet = new Set(enabledTypes);
    return initialEnabledTypes.some(type => !currentSet.has(type));
  }, [enabledTypes, initialEnabledTypes]);

  const handleToggle = (type) => (event) => {
    const { checked } = event.target;
    setPolicy(prevPolicy => {
      const currentEnabledTypes = prevPolicy.enabled_types || [];
      const updatedTypes = checked
        ? [...currentEnabledTypes, type]
        : currentEnabledTypes.filter(existingType => existingType !== type);
      const uniqueUpdatedTypes = [...new Set(updatedTypes)];
      return normalizePolicy({ enabled_types: uniqueUpdatedTypes });
    });
  };

  const handleSave = async () => {
    if (!activeOrgHasConnection) {
      toast.error('השלם את חיבור ה-Supabase לפני שמירה.');
      return;
    }

    if (!session) {
      toast.error('נדרש להתחבר מחדש לפני שמירת ההגדרות.');
      return;
    }

    if (!orgId) {
      toast.error('בחרו ארגון פעיל לפני שמירת ההגדרות.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const normalized = normalizePolicy(policy);
      await upsertSetting({
        session,
        orgId,
        key: 'employment_scope_policy',
        value: normalized,
      });
      setPolicy(normalized);
      setInitialPolicy(normalized);
      toast.success('הגדרת היקף המשרה נשמרה בהצלחה');
    } catch (saveError) {
      console.error('Failed to save employment scope policy', saveError);
      setError('שמירת הגדרת היקף המשרה נכשלה');
      toast.error('שמירת היקף המשרה נכשלה');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-0 shadow-lg bg-white/80">
      <CardHeader className="border-b">
        <CardTitle className="text-xl font-semibold text-slate-900">היקף משרה</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4" dir="rtl">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              בחרו עבור אילו סוגי עובדים יוגדר היקף המשרה לצרכי מידע ודוחות בלבד.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {EMPLOYMENT_SCOPE_OPTIONS.map(option => {
                const checkboxId = `employment-scope-${option.value}`;
                const isChecked = option.disabled || enabledTypes.includes(option.value);
                return (
                  <label
                    key={option.value}
                    htmlFor={checkboxId}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                      option.disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50'
                    }`}
                  >
                    <span className="font-medium text-slate-700">{option.label}</span>
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={isChecked}
                      onChange={option.disabled ? undefined : handleToggle(option.value)}
                      disabled={option.disabled || isSaving}
                      className="h-5 w-5"
                    />
                  </label>
                );
              })}
            </div>
            {error ? (
              <div className="text-sm text-red-600" role="alert">
                {error}
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!hasChanges || isSaving} className="gap-2">
                {isSaving ? 'שומר...' : 'שמור'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default EmploymentScopeSettings;
