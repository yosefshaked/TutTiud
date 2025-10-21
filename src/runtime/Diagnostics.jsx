import React, { useMemo } from 'react';
import { useRuntimeConfig } from './RuntimeConfigContext.jsx';
import { getRuntimeConfigDiagnostics } from './config.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';

function maskValue(value) {
  if (!value) {
    return '—';
  }
  const trimmed = String(value).trim();
  if (trimmed.length <= 4) {
    return trimmed;
  }
  const suffix = trimmed.slice(-4);
  return `••••${suffix}`;
}

export default function Diagnostics() {
  const config = useRuntimeConfig();
  const diagnostics = getRuntimeConfigDiagnostics();
  const { user, session } = useAuth();
  const { activeOrgId, configStatus, activeOrgConfig, tenantClientReady } = useOrg();

  const runtimeSourceLabel = useMemo(() => {
    switch (config?.source) {
      case 'api':
        return '‎/api/config (תצורת הליבה)';
      case 'org-api':
        return '‎/api/org/:id/keys (חיבור ארגוני)';
      default:
        return 'מקור לא ידוע';
    }
  }, [config?.source]);

  const maskedUserId = useMemo(() => maskValue(user?.id), [user?.id]);
  const activeOrgLabel = activeOrgId || '—';
  const configFetchLabel = useMemo(() => {
    switch (configStatus) {
      case 'loading':
        return 'בתהליך טעינה';
      case 'success':
        return 'נטען בהצלחה';
      case 'error':
        return 'טעינה נכשלה';
      default:
        return 'טרם נטען';
    }
  }, [configStatus]);

  const orgSupabaseLabel = maskValue(activeOrgConfig?.supabaseUrl);
  const orgAnonLabel = maskValue(activeOrgConfig?.supabaseAnonKey);
  const isDev = Boolean(import.meta?.env?.DEV);
  const diagnosticsOrgId = diagnostics.orgId || '—';
  const diagnosticsStatus = diagnostics.status !== null ? diagnostics.status : '—';
  const diagnosticsScope = diagnostics.scope === 'org'
    ? 'בקשת ארגון (‎/api/org/:id/keys‎)'
    : 'בקשת אפליקציה (‎/api/config‎)';
  const controlSessionLabel = session ? 'כן' : 'לא';
  const tenantClientLabel = tenantClientReady ? 'כן' : 'לא';
  const lastKeysStatus = diagnostics.scope === 'org'
    ? (diagnostics.status !== null ? diagnostics.status : '—')
    : '—';
  const lastKeysBody = diagnostics.scope === 'org' && diagnostics.bodyIsJson
    ? JSON.stringify(diagnostics.body, null, 2)
    : '—';

  return (
    <div className="max-w-2xl mx-auto mt-16 bg-white shadow-xl rounded-2xl p-8 space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">אבחון קונפיגורציה</h1>
        <p className="text-slate-600">סקירה מהירה של מקור ההגדרות בזמן ריצה.</p>
      </div>
      <dl className="grid grid-cols-1 gap-4">
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
          <dt className="text-sm text-slate-500">מקור התצורה</dt>
          <dd className="text-lg font-semibold text-slate-900">{runtimeSourceLabel}</dd>
        </div>
        <div className="border border-slate-200 rounded-xl p-4">
          <dt className="text-sm text-slate-500">מזהה משתמש (מוסתר)</dt>
          <dd className="text-lg font-semibold text-slate-900">{maskedUserId}</dd>
        </div>
        <div className="border border-slate-200 rounded-xl p-4">
          <dt className="text-sm text-slate-500">active_org_id</dt>
          <dd className="text-lg font-semibold text-slate-900">{activeOrgLabel}</dd>
        </div>
        <div className="border border-slate-200 rounded-xl p-4">
          <dt className="text-sm text-slate-500">מצב טעינת קונפיגורציית ארגון</dt>
          <dd className="text-lg font-semibold text-slate-900">{configFetchLabel}</dd>
        </div>
        <div className="border border-slate-200 rounded-xl p-4">
          <dt className="text-sm text-slate-500">Supabase URL</dt>
          <dd className="text-lg font-semibold text-slate-900">{maskValue(config?.supabaseUrl)}</dd>
        </div>
        <div className="border border-slate-200 rounded-xl p-4">
          <dt className="text-sm text-slate-500">Supabase anon key</dt>
          <dd className="text-lg font-semibold text-slate-900">{maskValue(config?.supabaseAnonKey)}</dd>
        </div>
        <div className="border border-slate-200 rounded-xl p-4">
          <dt className="text-sm text-slate-500">Supabase URL ארגוני</dt>
          <dd className="text-lg font-semibold text-slate-900">{orgSupabaseLabel}</dd>
        </div>
        <div className="border border-slate-200 rounded-xl p-4">
          <dt className="text-sm text-slate-500">anon key ארגוני</dt>
          <dd className="text-lg font-semibold text-slate-900">{orgAnonLabel}</dd>
        </div>
        {isDev ? (
          <>
            <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50">
              <dt className="text-sm text-slate-500">org-id בבקשת התצורה האחרונה</dt>
              <dd className="text-lg font-semibold text-slate-900">{diagnosticsOrgId}</dd>
            </div>
            <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50">
              <dt className="text-sm text-slate-500">סטטוס HTTP אחרון</dt>
              <dd className="text-lg font-semibold text-slate-900">{diagnosticsStatus}</dd>
            </div>
            <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50">
              <dt className="text-sm text-slate-500">סוג הבקשה</dt>
              <dd className="text-lg font-semibold text-slate-900">{diagnosticsScope}</dd>
            </div>
          </>
        ) : null}
      </dl>
      <div className="border border-slate-200 rounded-xl p-4 space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">חיבור Supabase ארגוני</h2>
        <dl className="grid grid-cols-1 gap-4">
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
            <dt className="text-sm text-slate-500">סשן ניהול (control) זמין</dt>
            <dd className="text-lg font-semibold text-slate-900">{controlSessionLabel}</dd>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <dt className="text-sm text-slate-500">מזהה ארגון פעיל</dt>
            <dd className="text-lg font-semibold text-slate-900">{activeOrgLabel}</dd>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <dt className="text-sm text-slate-500">לקוח Supabase ארגוני מאותחל</dt>
            <dd className="text-lg font-semibold text-slate-900">{tenantClientLabel}</dd>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <dt className="text-sm text-slate-500">סטטוס אחרון של ‎/api/org/:id/keys‎</dt>
            <dd className="text-lg font-semibold text-slate-900">{lastKeysStatus}</dd>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <dt className="text-sm text-slate-500">תוכן תשובת ‎/api/org/:id/keys‎</dt>
            <dd className="text-sm font-mono text-left whitespace-pre-wrap break-words text-slate-800 bg-white border border-slate-200 rounded-lg p-3">
              {lastKeysBody}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
