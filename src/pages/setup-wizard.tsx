import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/app/providers/auth-provider'
import { useOrganization } from '@/app/providers/organization-provider'
import {
  checkSchemaStatus,
  fetchOrganizationSetupSettings,
  initializeSetupForOrganization,
  runDiagnostics,
  runSchemaBootstrap,
  type DiagnosticsSqlSnippet,
  type OrganizationSetupSettings,
  type SetupDiagnostics,
  type SetupWizardError,
  updateTuttiudConnectionStatus
} from '@/lib/setup-wizard'

const statusLabel = {
  idle: 'ממתין',
  loading: 'בטיפול…',
  success: 'הושלם',
  warning: 'דרושה תשומת לב',
  error: 'שגיאה'
} as const

const issueTypeLabel: Record<string, string> = {
  table: 'טבלאות שחסרות',
  policy: 'מדיניות חסרה',
  permission: 'הרשאות חסרות',
  other: 'פריטים נוספים'
}

const formatTechnicalDetails = (cause: unknown): string | null => {
  if (!cause) return null
  if (cause instanceof Error) {
    return cause.stack ?? cause.message
  }
  if (typeof cause === 'string') {
    return cause
  }
  try {
    return JSON.stringify(cause, null, 2)
  } catch {
    return String(cause)
  }
}

const TechnicalDetails = ({ details }: { details: string | null | undefined }) => {
  if (!details) return null
  return (
    <details className="rounded-md border border-muted-foreground/30 bg-muted/20 p-3 text-xs text-muted-foreground" dir="ltr">
      <summary className="cursor-pointer text-right text-sm font-semibold" dir="rtl">
        פרטים טכניים לצוות התמיכה
      </summary>
      <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-left">{details}</pre>
    </details>
  )
}

type StepState = {
  status: keyof typeof statusLabel
  message?: string
  error?: string | null
}

type SchemaState = StepState & {
  exists: boolean | null
  lastBootstrappedAt: string | null
}

type DiagnosticsState = StepState & {
  diagnostics: SetupDiagnostics | null
}

const StepStatusBadge = ({ state }: { state: StepState }) => {
  const baseClasses =
    'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium'
  if (state.status === 'success') {
    return <span className={`${baseClasses} border-emerald-300 bg-emerald-100 text-emerald-800`}>✅ {statusLabel.success}</span>
  }
  if (state.status === 'warning') {
    return <span className={`${baseClasses} border-amber-400/60 bg-amber-100 text-amber-800`}>⚠️ {statusLabel.warning}</span>
  }
  if (state.status === 'error') {
    return <span className={`${baseClasses} border-destructive/40 bg-destructive/10 text-destructive`}>⚠️ {statusLabel.error}</span>
  }
  if (state.status === 'loading') {
    return <span className={`${baseClasses} border-primary/40 bg-primary/10 text-primary`}>⏳ {statusLabel.loading}</span>
  }
  return <span className={`${baseClasses} border-muted-foreground/40 bg-muted text-muted-foreground`}>• {statusLabel.idle}</span>
}

const DiagnosticsSqlList = ({ snippets }: { snippets: DiagnosticsSqlSnippet[] }) => {
  if (!snippets.length) return null
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/40 p-4 text-sm">
      <p className="font-medium text-muted-foreground">הנחיות נוספות לצוות הטכני</p>
      <p className="text-xs text-muted-foreground">
        אם אתם עובדים עם צוות תמיכה טכני, ניתן למסור לו את ההוראות הבאות לביצוע ב-SQL.
      </p>
      <div className="space-y-3">
        {snippets.map((snippet, index) => (
          <div key={`${snippet.title}-${index}`} className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground/80">{snippet.title}</p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-background p-3 text-left text-xs ltr" dir="ltr">
              <code>{snippet.sql}</code>
            </pre>
          </div>
        ))}
      </div>
    </div>
  )
}

export const SetupWizardPage = () => {
  const navigate = useNavigate()
  const { clientAvailable } = useAuth()
  const { selectedOrganization, status: organizationStatus } = useOrganization()

  const [initState, setInitState] = useState<StepState>({ status: 'idle' })
  const [schemaState, setSchemaState] = useState<SchemaState>({
    status: 'idle',
    exists: null,
    lastBootstrappedAt: null
  })
  const [diagnosticsState, setDiagnosticsState] = useState<DiagnosticsState>({
    status: 'idle',
    diagnostics: null
  })
  const [refreshToken, setRefreshToken] = useState(0)
  const [organizationSettings, setOrganizationSettings] =
    useState<OrganizationSetupSettings | null>(null)
  const [connectionUpdateState, setConnectionUpdateState] = useState<StepState>({
    status: 'idle'
  })

  const readyToStart = useMemo(
    () => clientAvailable && organizationStatus === 'ready' && Boolean(selectedOrganization),
    [clientAvailable, organizationStatus, selectedOrganization]
  )

  useEffect(() => {
    if (!readyToStart || !selectedOrganization) return

    const orgId = selectedOrganization.org_id

    const runChecks = async () => {
      setInitState({ status: 'loading' })
      setOrganizationSettings(null)
      setSchemaState({ status: 'idle', exists: null, lastBootstrappedAt: null })
      setDiagnosticsState({ status: 'idle', diagnostics: null })
      setConnectionUpdateState({ status: 'idle' })

      try {
        const settings = await fetchOrganizationSetupSettings(orgId)
        setOrganizationSettings(settings)
        if (!settings) {
          setInitState({
            status: 'warning',
            message: 'לא הצלחנו למצוא את הגדרות החיבור של הארגון. אנא צרו קשר עם התמיכה של TutTiud.'
          })
          return
        }

        if (settings.metadata.connections.tuttiud === 'connected') {
          setInitState({
            status: 'success',
            message: 'החיבור למסד הנתונים כבר פעיל. נוודא שהכל עדיין תקין.'
          })
        } else {
          const initResult = await initializeSetupForOrganization(orgId)
          setInitState({
            status: initResult.initialized ? 'success' : 'error',
            message:
              initResult.message ??
              (initResult.initialized
                ? 'התחברנו למסד הנתונים בהצלחה.'
                : 'לא הצלחנו להתחבר למסד הנתונים. בדקו את ההגדרות ונסו שוב.')
          })
          if (!initResult.initialized) {
            return
          }
        }
      } catch (error) {
        const setupError = error as SetupWizardError
        setInitState({
          status: 'error',
          message: setupError.message,
          error: formatTechnicalDetails(setupError.cause)
        })
        return
      }

      setSchemaState({ status: 'loading', exists: null, lastBootstrappedAt: null })
      try {
        const schemaResult = await checkSchemaStatus(orgId)
        setSchemaState({
          status: schemaResult.exists ? 'success' : 'warning',
          exists: schemaResult.exists,
          lastBootstrappedAt: schemaResult.lastBootstrappedAt,
          message: schemaResult.exists
            ? 'מבנה הנתונים של TutTiud זמין ומוכן.'
            : 'מבנה הנתונים של TutTiud עדיין לא נוצר.'
        })
        if (!schemaResult.exists) {
          setDiagnosticsState({ status: 'idle', diagnostics: null })
          return
        }
      } catch (error) {
        const schemaError = error as SetupWizardError
        setSchemaState({
          status: 'error',
          exists: null,
          lastBootstrappedAt: null,
          message: schemaError.message,
          error: formatTechnicalDetails(schemaError.cause)
        })
        return
      }

      setDiagnosticsState({ status: 'loading', diagnostics: null })
      try {
        const diagnostics = await runDiagnostics(orgId)
        const severity: StepState['status'] = diagnostics
          ? diagnostics.status === 'ok'
            ? 'success'
            : diagnostics.status === 'warning'
            ? 'warning'
            : 'error'
          : 'success'
        setDiagnosticsState({
          status: severity,
          diagnostics,
          message: diagnostics?.summary
        })
      } catch (error) {
        const diagnosticsError = error as SetupWizardError
        setDiagnosticsState({
          status: 'error',
          diagnostics: null,
          message: diagnosticsError.message,
          error: formatTechnicalDetails(diagnosticsError.cause)
        })
      }
    }

    void runChecks()
  }, [readyToStart, selectedOrganization, refreshToken])

  const runConnectionUpdate = useCallback(async () => {
    if (!selectedOrganization || !organizationSettings) {
      return
    }

    setConnectionUpdateState({
      status: 'loading',
      message: 'מעדכן את סטטוס החיבור של TutTiud...'
    })

    try {
      const metadata = await updateTuttiudConnectionStatus(
        selectedOrganization.org_id,
        'connected',
        {
          currentMetadata: organizationSettings.metadata.raw
        }
      )

      setConnectionUpdateState({
        status: 'success',
        message: 'סימנו שההגדרות הושלמו והחיבור פעיל.'
      })

      setOrganizationSettings((previous) => {
        if (!previous) {
          return previous
        }

        if (selectedOrganization && previous.org_id !== selectedOrganization.org_id) {
          return previous
        }

        return {
          ...previous,
          metadata
        }
      })
    } catch (error) {
      const updateError = error as SetupWizardError
      setConnectionUpdateState({
        status: 'error',
        message: 'לא הצלחנו לעדכן את סטטוס החיבור. נסו שוב ואם הבעיה נמשכת פנו לתמיכה.',
        error: formatTechnicalDetails(updateError.cause)
      })
    }
  }, [organizationSettings, selectedOrganization])

  useEffect(() => {
    if (
      !selectedOrganization ||
      !organizationSettings ||
      organizationSettings.metadata.connections.tuttiud === 'connected'
    ) {
      return
    }

    const initSuccess = initState.status === 'success'
    const schemaReady = schemaState.status === 'success' && schemaState.exists === true
    const diagnosticsReady = diagnosticsState.status === 'success'

    if (
      initSuccess &&
      schemaReady &&
      diagnosticsReady &&
      connectionUpdateState.status === 'idle'
    ) {
      void runConnectionUpdate()
    }
  }, [
    connectionUpdateState.status,
    diagnosticsState.status,
    initState.status,
    organizationSettings,
    runConnectionUpdate,
    schemaState.exists,
    schemaState.status,
    selectedOrganization
  ])

  const handleCreateSchema = async () => {
    if (!selectedOrganization) return

    setSchemaState({ status: 'loading', exists: null, lastBootstrappedAt: null })
    try {
      const result = await runSchemaBootstrap(selectedOrganization.org_id)
      setSchemaState({
        status: result.executed ? 'success' : 'error',
        exists: result.executed,
        lastBootstrappedAt: null,
        message:
          result.message ??
          (result.executed
            ? 'מבנה הנתונים של TutTiud נוצר בהצלחה.'
            : 'לא הצלחנו ליצור את מבנה הנתונים. בדקו את ההרשאות במסד הנתונים ונסו שוב.')
      })
      if (result.executed) {
        setRefreshToken((value) => value + 1)
      }
    } catch (error) {
      const bootstrapError = error as SetupWizardError
      setSchemaState({
        status: 'error',
        exists: null,
        lastBootstrappedAt: null,
        message: bootstrapError.message,
        error: formatTechnicalDetails(bootstrapError.cause)
      })
    }
  }

  const diagnosticsSeverity = diagnosticsState.diagnostics?.status ?? null
  const diagnosticsIssues = diagnosticsState.diagnostics?.issues ?? []
  const diagnosticsSql = diagnosticsState.diagnostics?.sqlSnippets ?? []
  const isConnectionUpdateLoading = connectionUpdateState.status === 'loading'

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-6 bg-muted/30 px-4 py-8">
      <header className="text-right">
        <h1 className="text-3xl font-bold">אשף ההקמה של TutTiud</h1>
        <p className="mt-2 text-muted-foreground">
          האשף יסייע לך לוודא שהחיבור למסד הנתונים הושלם שהמערכת מוכנה לשימוש.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col items-start gap-2 text-right">
            <CardTitle className="text-xl">שלבי ההקמה</CardTitle>
            <p className="text-sm text-muted-foreground">
              המערכת תריץ את השלבים באופן אוטומטי ותציג את מצבם. ניתן להפעיל מחדש במידת הצורך.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-3 rounded-lg border border-muted-foreground/30 bg-background/80 p-4">
              <header className="flex items-center justify-between">
                <div className="text-right">
                  <h2 className="text-lg font-semibold">שלב 1 — בדיקת החיבור למסד הנתונים</h2>
                  <p className="text-sm text-muted-foreground">
                    אנו טוענים את פרטי ההתחברות ובודקים שניתן להתחבר למסד הנתונים של TutTiud.
                  </p>
                </div>
                <StepStatusBadge state={initState} />
              </header>
              {initState.message && (
                <p className="text-sm text-muted-foreground">{initState.message}</p>
              )}
              {organizationSettings && (
                <dl className="grid gap-2 rounded-md border border-muted-foreground/20 bg-muted/30 p-3 text-xs">
                  <div className="flex flex-col gap-0.5 text-right">
                    <dt className="font-semibold text-foreground">Supabase URL</dt>
                    <dd className="truncate text-left" dir="ltr">
                      {organizationSettings.supabase_url ?? 'לא הוגדר'}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5 text-right">
                    <dt className="font-semibold text-foreground">מפתח גישה ציבורי (Anon Key)</dt>
                    <dd className="text-left" dir="ltr">
                      {organizationSettings.anon_key
                        ? '✓ מוגדר (מוסתר לביטחון)'
                        : 'לא הוגדר'}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5 text-right">
                    <dt className="font-semibold text-foreground">עודכן לאחרונה</dt>
                    <dd>
                      {organizationSettings.updated_at
                        ? new Date(organizationSettings.updated_at).toLocaleString('he-IL')
                        : 'טרם סונכרן'}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5 text-right">
                    <dt className="font-semibold text-foreground">סטטוס חיבור TutTiud</dt>
                    <dd
                      className={
                        organizationSettings.metadata.connections.tuttiud === 'connected'
                          ? 'text-emerald-600'
                          : 'text-amber-600'
                      }
                    >
                      {organizationSettings.metadata.connections.tuttiud === 'connected'
                        ? 'מחובר'
                        : 'דורש השלמה'}
                    </dd>
                  </div>
                </dl>
              )}
              {connectionUpdateState.status === 'loading' && connectionUpdateState.message ? (
                <p className="text-xs text-muted-foreground">{connectionUpdateState.message}</p>
              ) : null}
              {connectionUpdateState.status === 'success' && connectionUpdateState.message ? (
                <p className="text-xs text-emerald-600">{connectionUpdateState.message}</p>
              ) : null}
              {connectionUpdateState.status === 'error' && (
                <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-right text-xs">
                  <p className="text-destructive">{connectionUpdateState.message}</p>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runConnectionUpdate()}
                      disabled={isConnectionUpdateLoading}
                      type="button"
                    >
                      נסו שוב לעדכן סטטוס
                    </Button>
                    <TechnicalDetails details={connectionUpdateState.error} />
                  </div>
                </div>
              )}
              <TechnicalDetails details={initState.error} />
            </section>

            <section className="space-y-3 rounded-lg border border-muted-foreground/30 bg-background/80 p-4">
              <header className="flex items-center justify-between">
                <div className="text-right">
                  <h2 className="text-lg font-semibold">שלב 2 — אימות מבנה הנתונים</h2>
                  <p className="text-sm text-muted-foreground">
                    בודקים שהטבלאות וההרשאות של TutTiud קיימות ומעודכנות.
                  </p>
                </div>
                <StepStatusBadge state={schemaState} />
              </header>
              {schemaState.message && (
                <p className="text-sm text-muted-foreground">{schemaState.message}</p>
              )}
              {schemaState.lastBootstrappedAt && (
                <p className="text-xs text-muted-foreground">
                  עודכן לאחרונה: {new Date(schemaState.lastBootstrappedAt).toLocaleString('he-IL')}
                </p>
              )}
              {schemaState.error && (
                <TechnicalDetails details={schemaState.error} />
              )}
              {schemaState.status === 'success' && schemaState.exists === false && (
                <div className="flex flex-col items-end justify-between gap-3 rounded-md border border-dashed border-primary/40 bg-primary/5 p-4 text-sm">
                  <p>
                    נראה שמבנה הנתונים עדיין לא הוגדר. לחצו על הכפתור כדי להפעיל את תהליך ההקמה האוטומטי.
                  </p>
                  <Button onClick={handleCreateSchema}>
                    צרו את מבנה הנתונים של TutTiud
                  </Button>
                </div>
              )}
            </section>

            <section className="space-y-3 rounded-lg border border-muted-foreground/30 bg-background/80 p-4">
              <header className="flex items-center justify-between">
                <div className="text-right">
                  <h2 className="text-lg font-semibold">שלב 3 — בדיקות אחרונות</h2>
                  <p className="text-sm text-muted-foreground">
                    מריצים בדיקות כדי לוודא שהכל מוכן לעבודה ושאין הרשאות חסרות.
                  </p>
                </div>
                <StepStatusBadge state={diagnosticsState} />
              </header>
              {diagnosticsState.message && (
                <p className="text-sm text-muted-foreground">{diagnosticsState.message}</p>
              )}
              {diagnosticsState.error && (
                <TechnicalDetails details={diagnosticsState.error} />
              )}

              {diagnosticsState.status === 'success' && diagnosticsState.diagnostics && (
                <div className="space-y-4 text-sm">
                  <div className="rounded-md border border-muted-foreground/30 bg-muted/30 p-3">
                    <p className="font-medium">
                      סטטוס האבחון:{' '}
                      <span
                        className={
                          diagnosticsSeverity === 'ok'
                            ? 'text-emerald-600'
                            : diagnosticsSeverity === 'warning'
                            ? 'text-amber-600'
                            : 'text-destructive'
                        }
                      >
                        {diagnosticsSeverity === 'ok'
                          ? 'הכל תקין'
                          : diagnosticsSeverity === 'warning'
                          ? 'דרושה תשומת לב'
                          : 'נמצאו כשלים'}
                      </span>
                    </p>
                  </div>

                  {diagnosticsIssues.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-semibold text-muted-foreground">
                        פריטים הדורשים טיפול:
                      </p>
                      <ul className="space-y-2 text-right">
                        {diagnosticsIssues.map((issue, index) => (
                          <li
                            key={`${issue.type}-${index}-${issue.description}`}
                            className="rounded-md border border-dashed border-amber-400/50 bg-amber-100/40 p-3 text-amber-900"
                          >
                            <span className="font-semibold">
                              {issueTypeLabel[issue.type] ?? 'פריט שדורש טיפול'}:
                            </span>{' '}
                            {issue.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <DiagnosticsSqlList snippets={diagnosticsSql} />
                </div>
              )}
            </section>
          </CardContent>
          <CardFooter className="flex flex-col items-end gap-3 border-t bg-muted/10 p-4 text-right text-sm text-muted-foreground">
            <p>
              לאחר השלמת כל השלבים בהצלחה, ניתן להמשיך למערכת ולנהל את המפגשים באמצעות TutTiud.
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setRefreshToken((value) => value + 1)}>
                רענן את השלבים
              </Button>
              <Button type="button" onClick={() => navigate('/')} disabled={schemaState.exists === false}>
                כניסה למערכת
              </Button>
            </div>
          </CardFooter>
        </Card>

        <Card className="h-fit">
          <CardHeader className="text-right">
            <CardTitle>סטטוס ארגון נבחר</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-right text-muted-foreground">
            {!selectedOrganization && (
              <p>לא נבחר ארגון. אנא חזור למסך בחירת הארגון.</p>
            )}
            {selectedOrganization && (
              <>
                <div>
                  <p className="font-semibold text-foreground">{selectedOrganization.organization_name}</p>
                  <p className="text-xs text-muted-foreground">מזהה ארגון: {selectedOrganization.org_id}</p>
                </div>
                <div className="space-y-1 rounded-md border border-muted-foreground/30 bg-muted/30 p-3">
                  <p>סטטוס ספק:</p>
                  <p className="text-xs">
                    {readyToStart
                      ? 'Supabase מחובר והארגון מוכן לבדיקות.'
                      : 'ממתין להתחברות או טעינת הארגון.'}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
