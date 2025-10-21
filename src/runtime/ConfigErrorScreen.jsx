import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { activateConfig, getRuntimeConfigDiagnostics } from './config.js';

const ACTION_SUGGESTIONS = {
  'network-failure': [
    'ודא ששרת הפונקציות פועל (למשל באמצעות ‎swa start --api-location api‎ או פריסת Azure פעילה).',
    'בדוק שאין חסימה ברשת או ב-VPN שמונעת גישה אל ‎/api/config‎ או ‎/api/org/:id/keys‎.',
  ],
  'response-not-json': [
    'הוסף כותרת ‎Content-Type: application/json‎ לתשובת הפונקציה (‎/api/config‎ או ‎/api/org/:id/keys‎).',
    'ודא שהפונקציה אינה מחזירה HTML של שגיאת שרת במקום JSON.',
  ],
  'invalid-json': [
    'בדוק שאין תווים מודפסים לפני/אחרי ה-JSON (‎console.log‎ או BOM).',
    'הרץ את הפונקציה הרלוונטית (‎node api/config/index.js‎ או ‎node api/org-keys/index.js‎) כדי לראות את הפלט המדויק.',
  ],
  'missing-keys': [
    'הגדר את ‎APP_SUPABASE_URL‎ ו-‎APP_SUPABASE_ANON_KEY‎ בסביבה.',
    'עדכן את ערכי ‎supabase_url‎ ו-‎anon_key‎ בטבלת ‎org_settings‎ או במסך ההגדרות לאחר עליית המערכת.',
  ],
  default: [
    'בדוק את לוגי הפונקציות ‎/api/config‎ ו-‎/api/org/:id/keys‎ וודא שהן מחזירות תשובה תקינה.',
    'ודא שלמשתמש המחובר יש הרשאות לגשת לפונקציה (JWT בתוקף ומדיניות מתאימה).',
  ],
};

function maskToken(token) {
  if (!token) {
    return '—';
  }
  const trimmed = token.trim();
  if (trimmed.length <= 8) {
    return trimmed;
  }
  return `${trimmed.slice(0, 4)}•••${trimmed.slice(-4)}`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return '—';
  }
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch {
    return '—';
  }
}

function formatScope(scope) {
  if (scope === 'org') {
    return 'בקשת ארגון (‎/api/org/:id/keys עם טוקן משתמש‎)';
  }
  return 'בקשת אפליקציה (ללא טוקן)';
}

function escapeDoubleQuotes(value) {
  return value.replace(/"/g, '\\"');
}

function buildActions({ error, status, scope }, manualToken, manualOrgId) {
  const base = ACTION_SUGGESTIONS[error] || ACTION_SUGGESTIONS.default;
  const items = [...base];

  if ((status === 401 || status === 403) && !items.includes('ודא שלמשתמש המחובר יש הרשאות לגשת לפונקציה (JWT בתוקף ומדיניות מתאימה).')) {
    items.push('ודא שלמשתמש המחובר יש הרשאות לגשת לפונקציה (JWT בתוקף ומדיניות מתאימה).');
  }

  if (!manualToken.trim() && scope === 'org') {
    items.push('השג אסימון Supabase (‎supabase.auth.getSession‎) והדבק אותו כדי לבדוק ידנית את הפונקציה.');
  }

  if (!manualOrgId.trim() && scope === 'org') {
    items.push('הזן את מזהה הארגון בנתיב ‎/api/org/<org-id>/keys‎ כדי לבדוק את הקריאה הידנית.');
  }

  return Array.from(new Set(items));
}

// eslint-disable-next-line react-refresh/only-export-components
export function renderConfigError(error) {
  const container = document.getElementById('root');
  if (!container) {
    return;
  }

  const root = ReactDOM.createRoot(container);
  root.render(<ConfigErrorScreen error={error} />);
}

function ConfigErrorScreen({ error }) {
  const diagnostics = useMemo(() => getRuntimeConfigDiagnostics(), []);
  const [manualOrgId, setManualOrgId] = useState(diagnostics.orgId || '');
  const [manualToken, setManualToken] = useState(diagnostics.accessToken || '');
  const [showToken, setShowToken] = useState(false);
  const [copyState, setCopyState] = useState('idle');
  const [curlCopyState, setCurlCopyState] = useState('idle');
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState('idle');
  const [testOutput, setTestOutput] = useState('');
  const [testError, setTestError] = useState('');
  const [testHttpStatus, setTestHttpStatus] = useState(null);
  const [lastConfig, setLastConfig] = useState(null);

  const message = error?.message || 'לא נמצאה תצורת Supabase לטעינת המערכת.';
  const httpStatusLabel = diagnostics.status !== null ? diagnostics.status : '—';
  const scopeLabel = formatScope(diagnostics.scope);
  const lastAttemptLabel = formatTimestamp(diagnostics.timestamp);
  const actionItems = useMemo(
    () =>
      buildActions(
        { error: diagnostics.error, status: diagnostics.status, scope: diagnostics.scope },
        manualToken,
        manualOrgId,
      ),
    [diagnostics.error, diagnostics.status, diagnostics.scope, manualToken, manualOrgId],
  );
  const trimmedToken = manualToken.trim();
  const hasToken = Boolean(trimmedToken);
  const tokenPreview = hasToken ? (showToken ? trimmedToken : maskToken(trimmedToken)) : diagnostics.accessTokenPreview || 'לא נשלח אסימון';

  const curlCommand = useMemo(() => {
    const trimmedOrg = manualOrgId.trim();
    const endpoint = trimmedOrg
      ? `/api/org/${encodeURIComponent(trimmedOrg)}/keys`
      : '/api/config';
    const baseUrl = `${window.location.origin}${endpoint}`;
    const parts = ['curl', '-i', '-H "Accept: application/json"'];
    if (trimmedToken) {
      parts.push(`-H "X-Supabase-Authorization: Bearer ${escapeDoubleQuotes(trimmedToken)}"`);
    }
    parts.push(`"${baseUrl}"`);
    return parts.join(' ');
  }, [manualOrgId, trimmedToken]);

  const resetCopyLater = setter => {
    setTimeout(() => setter('idle'), 1600);
  };

  const handleCopyToken = async () => {
    if (!trimmedToken) {
      return;
    }
    try {
      await navigator.clipboard.writeText(trimmedToken);
      setCopyState('copied');
      resetCopyLater(setCopyState);
    } catch {
      setCopyState('failed');
      resetCopyLater(setCopyState);
    }
  };

  const handleCopyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlCommand);
      setCurlCopyState('copied');
      resetCopyLater(setCurlCopyState);
    } catch {
      setCurlCopyState('failed');
      resetCopyLater(setCurlCopyState);
    }
  };

  const handleTestRequest = async () => {
    setIsTesting(true);
    setTestStatus('loading');
    setTestError('');
    setTestOutput('');
    setTestHttpStatus(null);
    setLastConfig(null);

    try {
      const headers = { Accept: 'application/json' };
      const orgId = manualOrgId.trim();
      if (trimmedToken) {
        headers['X-Supabase-Authorization'] = `Bearer ${trimmedToken}`;
      }

      const endpoint = orgId ? `/api/org/${encodeURIComponent(orgId)}/keys` : '/api/config';

      const response = await fetch(endpoint, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });

      const text = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }

      setTestHttpStatus(response.status);

      if (!response.ok) {
        const messageText = typeof parsed === 'string'
          ? parsed || `HTTP ${response.status}`
          : parsed?.error || JSON.stringify(parsed, null, 2);
        throw new Error(messageText);
      }

      const display = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
      setTestOutput(display);
      setTestStatus('success');

      if (parsed && typeof parsed === 'object') {
        const supabaseUrl = typeof parsed.supabaseUrl === 'string'
          ? parsed.supabaseUrl
          : typeof parsed.supabase_url === 'string'
            ? parsed.supabase_url
            : '';
        const anonKey = typeof parsed.supabaseAnonKey === 'string'
          ? parsed.supabaseAnonKey
          : typeof parsed.supabase_anon_key === 'string'
            ? parsed.supabase_anon_key
            : typeof parsed.anon_key === 'string'
              ? parsed.anon_key
              : '';
        if (supabaseUrl && anonKey) {
          setLastConfig({
            supabaseUrl: supabaseUrl.trim(),
            supabaseAnonKey: anonKey.trim(),
          });
        }
      }
    } catch (testErr) {
      setTestStatus('error');
      setTestError(testErr?.message || 'הבדיקה נכשלה.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleLaunchWithConfig = async () => {
    if (!lastConfig) {
      return;
    }
    try {
      await activateConfig(lastConfig, { source: 'manual' });
      const { renderApp } = await import('../main.jsx');
      renderApp(lastConfig);
    } catch (launchError) {
      setTestStatus('error');
      setTestError(launchError?.message || 'טעינת האפליקציה עם ההגדרות שסופקו נכשלה.');
    }
  };

  return (
    <div style={styles.wrapper} dir="rtl">
      <div style={styles.card}>
        <header style={styles.header}>
          <h1 style={styles.title}>טעינת ההגדרות נכשלה</h1>
          <p style={styles.message}>{message}</p>
        </header>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>מידע שנאסף</h2>
          <dl style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <dt style={styles.infoTerm}>סוג הבקשה</dt>
              <dd style={styles.infoValue}>{scopeLabel}</dd>
            </div>
            <div style={styles.infoItem}>
              <dt style={styles.infoTerm}>סטטוס HTTP אחרון</dt>
              <dd style={styles.infoValue}>{httpStatusLabel}</dd>
            </div>
            <div style={styles.infoItem}>
              <dt style={styles.infoTerm}>מזהה ארגון שנשלח</dt>
              <dd style={styles.infoValue}>{diagnostics.orgId || '—'}</dd>
            </div>
            <div style={styles.infoItem}>
              <dt style={styles.infoTerm}>תוצאת ניסיון אחרון</dt>
              <dd style={styles.infoValue}>{diagnostics.ok ? 'הצלחה' : 'כשל'}</dd>
            </div>
            <div style={styles.infoItem}>
              <dt style={styles.infoTerm}>קוד אבחון</dt>
              <dd style={styles.infoValue}>{diagnostics.error || '—'}</dd>
            </div>
            <div style={styles.infoItem}>
              <dt style={styles.infoTerm}>עודכן לאחרונה</dt>
              <dd style={styles.infoValue}>{lastAttemptLabel}</dd>
            </div>
          </dl>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>אסימון וזיהוי ארגון</h2>
          <div style={styles.tokenBox}>
            <div style={styles.tokenHeader}>
              <span style={styles.tokenLabel}>X-Supabase-Authorization header</span>
              {hasToken ? (
                <button type="button" style={styles.linkButton} onClick={() => setShowToken(value => !value)}>
                  {showToken ? 'הסתר ערך' : 'הצג ערך מלא'}
                </button>
              ) : null}
            </div>
            <code style={styles.tokenValue}>{tokenPreview}</code>
            <div style={styles.tokenActions}>
              <div style={styles.fieldGroup}>
                <label style={styles.label} htmlFor="org-id-input">מזהה ארגון</label>
                <input
                  id="org-id-input"
                  style={styles.input}
                  value={manualOrgId}
                  onChange={event => setManualOrgId(event.target.value)}
                  placeholder="לדוגמה: 00000000-0000-0000-0000-000000000000"
                />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label} htmlFor="token-input">Bearer token</label>
                <textarea
                  id="token-input"
                  style={styles.textarea}
                  value={manualToken}
                  onChange={event => setManualToken(event.target.value)}
                  placeholder="הדבק כאן את ה-JWT של המשתמש"
                  rows={3}
                />
              </div>
            </div>
            <div style={styles.tokenButtonsRow}>
              <button
                type="button"
                style={{ ...styles.button, ...styles.secondaryButton, opacity: trimmedToken ? 1 : 0.6 }}
                onClick={handleCopyToken}
                disabled={!trimmedToken}
              >
                העתק אסימון
              </button>
              <button type="button" style={{ ...styles.button, ...styles.linkButton }} onClick={() => setShowToken(value => !value)}>
                {showToken ? 'הסתר אסימון' : 'הצג אסימון'}
              </button>
              <span style={styles.feedback}>
                {copyState === 'copied'
                  ? 'הועתק!'
                  : copyState === 'failed'
                    ? 'העתקה נכשלה'
                    : '\u00A0'}
              </span>
            </div>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>פעולות מומלצות</h2>
          <ul style={styles.actionList}>
            {actionItems.map(item => (
              <li key={item} style={styles.actionItem}>{item}</li>
            ))}
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>בדיקה ידנית של פונקציות התצורה</h2>
          <p style={styles.helperText}>
            הפעל את הבדיקה לאחר עדכון ההגדרות. אם הפונקציה חוזרת תקין ניתן לטעון את המערכת כאן ללא ריענון.
          </p>
          <div style={styles.buttonRow}>
            <button type="button" style={{ ...styles.button, ...styles.primaryButton }} onClick={handleTestRequest} disabled={isTesting}>
              {isTesting ? 'מריץ בדיקה...' : 'בדוק את הפונקציה עכשיו'}
            </button>
            <button type="button" style={{ ...styles.button, ...styles.secondaryButton }} onClick={() => window.location.reload()}>
              רענן את העמוד
            </button>
          </div>
          <div style={styles.curlBox}>
            <label style={styles.label} htmlFor="curl-command">פקודת curl</label>
            <textarea id="curl-command" style={styles.codeBlock} readOnly value={curlCommand} rows={3} />
            <div style={styles.buttonRow}>
              <button type="button" style={{ ...styles.button, ...styles.secondaryButton }} onClick={handleCopyCurl}>
                העתק פקודה
              </button>
              <span style={styles.feedback}>
                {curlCopyState === 'copied'
                  ? 'הפקודה הועתקה.'
                  : curlCopyState === 'failed'
                    ? 'העתקה נכשלה'
                    : '\u00A0'}
              </span>
            </div>
          </div>

          {testStatus === 'loading' ? (
            <p style={styles.helperText}>מריץ בדיקה...</p>
          ) : null}
          {testStatus === 'error' ? (
            <div style={styles.errorBox}>
              <strong style={styles.errorTitle}>הבדיקה נכשלה</strong>
              <p style={styles.errorMessage}>{testError}</p>
              {testHttpStatus !== null ? (
                <p style={styles.errorMessage}>סטטוס HTTP: {testHttpStatus}</p>
              ) : null}
            </div>
          ) : null}
          {testStatus === 'success' ? (
            <div style={styles.successBox}>
              <strong style={styles.successTitle}>התגובה שהתקבלה</strong>
              <pre style={styles.pre}>{testOutput}</pre>
              {lastConfig ? (
                <button type="button" style={{ ...styles.button, ...styles.primaryButton }} onClick={handleLaunchWithConfig}>
                  טען את האפליקציה עם ההגדרות האלו
                </button>
              ) : (
                <p style={styles.helperText}>
                  ההחזרה לא כללה ‎supabase_url‎ ו-‎anon_key‎ ולכן לא ניתן לטעון מחדש את המערכת אוטומטית.
                </p>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f5f7ff 0%, #e0f2fe 100%)',
    padding: '32px',
  },
  card: {
    maxWidth: '880px',
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: '24px',
    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
    padding: '36px',
    textAlign: 'right',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  title: {
    fontSize: '30px',
    fontWeight: 700,
    color: '#0f172a',
    margin: 0,
  },
  message: {
    fontSize: '18px',
    color: '#475569',
    margin: 0,
    lineHeight: 1.6,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#0f172a',
    margin: 0,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
  },
  infoItem: {
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    padding: '16px',
    backgroundColor: '#f8fafc',
  },
  infoTerm: {
    margin: 0,
    fontSize: '13px',
    color: '#64748b',
  },
  infoValue: {
    margin: '6px 0 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#0f172a',
    wordBreak: 'break-all',
  },
  tokenBox: {
    border: '1px solid #cbd5f5',
    borderRadius: '20px',
    padding: '20px',
    backgroundColor: '#f1f5ff',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  tokenHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tokenLabel: {
    fontWeight: 600,
    color: '#1d4ed8',
  },
  tokenValue: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '12px 16px',
    border: '1px dashed #94a3b8',
    fontFamily: 'monospace',
    fontSize: '14px',
    color: '#0f172a',
    wordBreak: 'break-all',
  },
  tokenActions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#334155',
  },
  input: {
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #cbd5f5',
    fontSize: '14px',
    direction: 'ltr',
  },
  textarea: {
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid #cbd5f5',
    fontSize: '14px',
    direction: 'ltr',
    resize: 'vertical',
  },
  tokenButtonsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  button: {
    borderRadius: '9999px',
    border: 'none',
    padding: '10px 18px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.2s ease',
  },
  primaryButton: {
    background: 'linear-gradient(90deg, #6366f1 0%, #3b82f6 100%)',
    color: '#fff',
    boxShadow: '0 12px 30px rgba(99, 102, 241, 0.35)',
  },
  secondaryButton: {
    backgroundColor: '#e2e8f0',
    color: '#0f172a',
    boxShadow: '0 8px 18px rgba(148, 163, 184, 0.35)',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
  },
  feedback: {
    fontSize: '13px',
    color: '#1d4ed8',
    minWidth: '100px',
  },
  actionList: {
    margin: 0,
    paddingInlineStart: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    color: '#0f172a',
  },
  actionItem: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '14px',
    padding: '10px 14px',
    listStyle: 'disc',
  },
  helperText: {
    fontSize: '14px',
    color: '#475569',
    margin: 0,
    lineHeight: 1.6,
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  curlBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '12px',
  },
  codeBlock: {
    borderRadius: '12px',
    border: '1px solid #cbd5f5',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    fontFamily: 'monospace',
    padding: '14px',
    direction: 'ltr',
    resize: 'none',
  },
  errorBox: {
    borderRadius: '16px',
    border: '1px solid #f87171',
    backgroundColor: '#fef2f2',
    padding: '16px',
    color: '#b91c1c',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '12px',
  },
  errorTitle: {
    fontSize: '15px',
    fontWeight: 600,
    margin: 0,
  },
  errorMessage: {
    fontSize: '14px',
    margin: 0,
  },
  successBox: {
    borderRadius: '16px',
    border: '1px solid #34d399',
    backgroundColor: '#ecfdf5',
    padding: '16px',
    color: '#047857',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginTop: '12px',
  },
  successTitle: {
    fontSize: '15px',
    fontWeight: 600,
    margin: 0,
  },
  pre: {
    margin: 0,
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    borderRadius: '12px',
    padding: '12px',
    fontSize: '13px',
    direction: 'ltr',
    maxHeight: '220px',
    overflow: 'auto',
  },
};

export default ConfigErrorScreen;
