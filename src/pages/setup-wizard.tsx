import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/app/providers/auth-provider'
import { useOrganization } from '@/app/providers/organization-provider'
import {
  checkSchemaStatus,
  fetchSetupStatus,
  fetchOrganizationSetupSettings,
  initializeSetupForOrganization,
  runDiagnostics,
  runSchemaBootstrap,
  type DiagnosticsSqlSnippet,
  type OrganizationSetupSettings,
  type SetupStatus,
  type SetupDiagnostics,
  type SetupWizardError,
  type TuttiudConnectionStatus,
  saveTuttiudAppKey,
  verifyStoredTuttiudSetup,
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

const DATABASE_PREPARATION_SQL = `-- -- =================================================================
-- Tuttiud Platform Setup Script V2.2 (Idempotent RLS)
-- =================================================================
-- ... (Parts 1 and 2 remain unchanged) ...
-- =================================================================

-- Part 1: Extensions and Schema Creation (No Changes)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS tuttiud;

-- Part 2: Table Creation within 'tuttiud' schema (No Changes)
CREATE TABLE IF NOT EXISTS tuttiud."Instructors" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" text NOT NULL,
  "email" text,
  "phone" text,
  "is_active" boolean DEFAULT true,
  "notes" text,
  "metadata" jsonb
);
CREATE TABLE IF NOT EXISTS tuttiud."Students" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" text NOT NULL,
  "contact_info" text,
  "assigned_instructor_id" uuid REFERENCES tuttiud."Instructors"("id"),
  "tags" text[],
  "notes" text,
  "metadata" jsonb
);
CREATE TABLE IF NOT EXISTS tuttiud."SessionRecords" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "date" date NOT NULL,
  "student_id" uuid NOT NULL REFERENCES tuttiud."Students"("id"),
  "instructor_id" uuid REFERENCES tuttiud."Instructors"("id"),
  "service_context" text,
  "content" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "deleted" boolean NOT NULL DEFAULT false,
  "deleted_at" timestamptz,
  "metadata" jsonb
);
CREATE TABLE IF NOT EXISTS tuttiud."Settings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "settings_value" jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "SessionRecords_student_date_idx" ON tuttiud."SessionRecords" ("student_id", "date");
CREATE INDEX IF NOT EXISTS "SessionRecords_instructor_idx" ON tuttiud."SessionRecords" ("instructor_id");

-- Part 3: Row Level Security (RLS) Setup - NOW IDEMPOTENT

-- Enable RLS on all tables
ALTER TABLE tuttiud."Instructors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuttiud."Students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuttiud."SessionRecords" ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuttiud."Settings" ENABLE ROW LEVEL SECURITY;

-- Policies for "Instructors"
DROP POLICY IF EXISTS "Allow full access to authenticated users on Instructors" ON tuttiud."Instructors";
CREATE POLICY "Allow full access to authenticated users on Instructors" ON tuttiud."Instructors" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Policies for "Students"
DROP POLICY IF EXISTS "Allow full access to authenticated users on Students" ON tuttiud."Students";
CREATE POLICY "Allow full access to authenticated users on Students" ON tuttiud."Students" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Policies for "SessionRecords"
DROP POLICY IF EXISTS "Allow full access to authenticated users on SessionRecords" ON tuttiud."SessionRecords";
CREATE POLICY "Allow full access to authenticated users on SessionRecords" ON tuttiud."SessionRecords" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Policies for "Settings"
DROP POLICY IF EXISTS "Allow full access to authenticated users on Settings" ON tuttiud."Settings";
CREATE POLICY "Allow full access to authenticated users on Settings" ON tuttiud."Settings" FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- Part 4: Application Role and Permissions (No Changes)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA tuttiud TO app_user;
GRANT ALL ON ALL TABLES IN SCHEMA tuttiud TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA tuttiud GRANT ALL ON TABLES TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tuttiud TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA tuttiud GRANT USAGE, SELECT ON SEQUENCES TO app_user;
GRANT app_user TO postgres, authenticated, anon;


-- Part 5: Diagnostics Function (No Changes)
CREATE OR REPLACE FUNCTION tuttiud.setup_assistant_diagnostics()
RETURNS TABLE (check_name text, success boolean, details text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  required_tables constant text[] := array['Instructors', 'Students', 'SessionRecords', 'Settings'];
  table_name text;
  table_exists boolean;
BEGIN
  success := EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'tuttiud');
  check_name := 'Schema "tuttiud" exists';
  details := CASE WHEN success THEN 'OK' ELSE 'Schema "tuttiud" not found.' END;
  RETURN NEXT;
  success := EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'app_user');
  check_name := 'Role "app_user" exists';
  details := CASE WHEN success THEN 'OK' ELSE 'Role "app_user" not found.' END;
  RETURN NEXT;
  FOREACH table_name IN ARRAY required_tables LOOP
    success := to_regclass('tuttiud.' || quote_ident(table_name)) IS NOT NULL;
    check_name := 'Table "' || table_name || '" exists';
    details := CASE WHEN success THEN 'OK' ELSE 'Table ' || table_name || ' is missing.' END;
    RETURN NEXT;
  END LOOP;
END;
$$;


-- Part 6: Generate the Application-Specific JWT (No Changes)
SELECT extensions.sign(
  json_build_object(
    'role', 'app_user',
    'exp', (EXTRACT(EPOCH FROM (NOW() + INTERVAL '5 year')))::integer,
    'iat', (EXTRACT(EPOCH FROM NOW()))::integer
  ),
  'YOUR_SUPER_SECRET_AND_LONG_JWT_SECRET_HERE'
) AS "APP_DEDICATED_KEY (COPY THIS BACK TO THE APP)";`

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
  const { clientAvailable, session } = useAuth()
  const { selectedOrganization, status: organizationStatus } = useOrganization()
  const queryClient = useQueryClient()

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
  const [needsPreparation, setNeedsPreparation] = useState(false)
  const [preparationState, setPreparationState] = useState<StepState>({ status: 'idle' })
  const [preparationChecklist, setPreparationChecklist] = useState({
    schemaExposed: false,
    scriptExecuted: false,
    keyCaptured: false
  })
  const [preparationAcknowledged, setPreparationAcknowledged] = useState(false)
  const [preparationDetails, setPreparationDetails] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [appKeyInput, setAppKeyInput] = useState('')
  const [appKeyState, setAppKeyState] = useState<StepState>({ status: 'idle' })
  const [validationTrigger, setValidationTrigger] = useState<'auto' | 'manual' | null>(null)
  const previousContextRef = useRef<{
    orgId: string | null
    hasDedicatedKey: boolean
    tuttiudStatus: TuttiudConnectionStatus
  }>({ orgId: null, hasDedicatedKey: false, tuttiudStatus: null })

  const readyToStart = useMemo(
    () => clientAvailable && organizationStatus === 'ready' && Boolean(selectedOrganization),
    [clientAvailable, organizationStatus, selectedOrganization]
  )

  const organizationId = selectedOrganization?.org_id ?? null
  const accessToken = session?.access_token ?? null

  const setupStatusQuery = useQuery<SetupStatus, SetupWizardError>({
    queryKey: ['setup-wizard', 'setup-status', organizationId, accessToken, refreshToken],
    queryFn: () => fetchSetupStatus(organizationId!, { accessToken }),
    enabled: readyToStart && Boolean(organizationId) && Boolean(accessToken),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  })

  const settingsQuery = useQuery<OrganizationSetupSettings | null, SetupWizardError>({
    queryKey: ['setup-wizard', 'organization-settings', organizationId, refreshToken],
    queryFn: () => fetchOrganizationSetupSettings(organizationId!),
    enabled: readyToStart && Boolean(organizationId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  })

  useEffect(() => {
    if (!selectedOrganization) {
      setOrganizationSettings(null)
      previousContextRef.current = {
        orgId: null,
        hasDedicatedKey: false,
        tuttiudStatus: null
      }
    }
  }, [selectedOrganization])

  const tuttiudStatus = organizationSettings?.metadata.connections.tuttiud ?? null
  const hasDedicatedKeyStored = setupStatusQuery.data?.hasDedicatedKey ?? false
  const hasStoredAppKey =
    hasDedicatedKeyStored || Boolean(organizationSettings?.metadata.credentials.tuttiudAppJwt)
  const shouldShowPreparationGuide = needsPreparation
  const shouldShowAppKeyStep =
    !hasDedicatedKeyStored &&
    (!shouldShowPreparationGuide || preparationAcknowledged || hasStoredAppKey)
  const showReturningVerification = hasDedicatedKeyStored && !needsPreparation
  const diagnosticsSeverity = diagnosticsState.diagnostics?.status ?? null
  const diagnosticsIssues = diagnosticsState.diagnostics?.issues ?? []
  const diagnosticsSql = diagnosticsState.diagnostics?.sqlSnippets ?? []
  const isValidationLoading = initState.status === 'loading'
  const canRequestValidation =
    Boolean(selectedOrganization && organizationSettings) &&
    (hasDedicatedKeyStored || !shouldShowPreparationGuide || preparationAcknowledged) &&
    (hasDedicatedKeyStored || tuttiudStatus === 'connected' || hasStoredAppKey)
  const requiresFullPreparation = !hasDedicatedKeyStored
  const isPreparationChecklistComplete =
    (requiresFullPreparation ? preparationChecklist.schemaExposed : true) &&
    preparationChecklist.scriptExecuted &&
    (requiresFullPreparation ? preparationChecklist.keyCaptured : true)
  const isSettingsLoaded = Boolean(organizationSettings)
  const isConnectionUpdateLoading = connectionUpdateState.status === 'loading'

  const connectionStepTitle = showReturningVerification
    ? 'אימות ההגדרה במסד הנתונים'
    : 'שלב 2 — בדיקת החיבור למסד הנתונים'
  const connectionStepDescription = showReturningVerification
    ? 'זיהינו שמפתח היישום כבר שמור. לחצו על הכפתור כדי לוודא שהמסד מוכן לשימוש. אם הבדיקה נכשלת, האשף יציג מחדש את הוראות ההכנה.'
    : 'לאחר שמירת המפתח נריץ בדיקה יזומה כדי לוודא שניתן להתחבר למסד הנתונים של TutTiud.'
  const validationButtonLabel = showReturningVerification ? 'אימות ההגדרה' : 'בדיקת החיבור'

  const resetPreparationChecklist = useCallback(() => {
    setPreparationChecklist({
      schemaExposed: false,
      scriptExecuted: false,
      keyCaptured: false
    })
    setPreparationAcknowledged(false)
  }, [])

  const updatePreparationChecklist = useCallback(
    (key: keyof typeof preparationChecklist, checked: boolean) => {
      setPreparationChecklist((current) => {
        const next = {
          ...current,
          [key]: checked
        }

        const checklistComplete =
          (requiresFullPreparation ? next.schemaExposed : true) &&
          next.scriptExecuted &&
          (requiresFullPreparation ? next.keyCaptured : true)

        if (!checklistComplete) {
          setPreparationAcknowledged(false)
          setPreparationState((previous) =>
            previous.status === 'success'
              ? {
                  status: 'idle',
                  message: 'השלימו את הצעדים הידניים כדי להמשיך לשלב 1.',
                  error: undefined
                }
              : previous
          )
        }

        return next
      })
    },
    [requiresFullPreparation]
  )

  const requireManualPreparation = useCallback(
    (state?: StepState) => {
      setNeedsPreparation(true)
      resetPreparationChecklist()
      setPreparationState(
        state ?? {
          status: 'idle',
          message: 'השלימו את הצעדים הידניים כדי שנוכל להמשיך לאימות החיבור.',
          error: undefined
        }
      )
    },
    [resetPreparationChecklist]
  )

  const markPreparationSatisfied = useCallback(
    (message?: string) => {
      setNeedsPreparation(false)
      setPreparationState({
        status: 'success',
        message: message ?? 'שלב ההכנה הושלם. ניתן להתקדם לבדיקה המלאה.',
        error: undefined
      })
      setPreparationAcknowledged(true)
    },
    []
  )

  useEffect(() => {
    if (!readyToStart || !selectedOrganization) return

    if (settingsQuery.isFetching || setupStatusQuery.isFetching) {
      setPreparationDetails(null)
      setCopyStatus('idle')
    }
  }, [
    readyToStart,
    selectedOrganization,
    settingsQuery.isFetching,
    setupStatusQuery.isFetching
  ])

  useEffect(() => {
    if (!readyToStart || !selectedOrganization) return

    if (setupStatusQuery.isError) {
      const statusError = setupStatusQuery.error
      setOrganizationSettings(null)
      setInitState({
        status: 'error',
        message:
          statusError.message ?? 'טעינת סטטוס ההגדרה נכשלה. נסו שוב בעוד רגע.',
        error: formatTechnicalDetails(statusError.cause)
      })
      return
    }

    if (settingsQuery.isError) {
      const fetchError = settingsQuery.error
      setOrganizationSettings(null)
      setInitState({
        status: 'error',
        message:
          fetchError.message ?? 'טעינת הגדרות הארגון נכשלה. נסו שוב בעוד רגע.',
        error: formatTechnicalDetails(fetchError.cause)
      })
      return
    }

    if (!setupStatusQuery.isSuccess || !settingsQuery.isSuccess) {
      return
    }

    const settings = settingsQuery.data ?? null
    setOrganizationSettings(settings)

    if (!settings) {
      requireManualPreparation({
        status: 'warning',
        message:
          'לא הצלחנו למצוא את הגדרות החיבור של הארגון. אנא צרו קשר עם התמיכה של TutTiud.',
        error: undefined
      })
      setAppKeyInput('')
      setAppKeyState({ status: 'idle' })
      setInitState({
        status: 'warning',
        message: 'לא הצלחנו למצוא את הגדרות החיבור של הארגון. אנא צרו קשר עם התמיכה של TutTiud.',
        error: undefined
      })
      return
    }

    const hasDedicatedKey = setupStatusQuery.data?.hasDedicatedKey ?? false
    const storedKey = settings.metadata.credentials.tuttiudAppJwt ?? ''
    const tuttiudStatus = settings.metadata.connections.tuttiud ?? null
    const isAlreadyConnected = tuttiudStatus === 'connected'

    const currentContext = {
      orgId: selectedOrganization?.org_id ?? null,
      hasDedicatedKey,
      tuttiudStatus
    }
    const contextChanged =
      previousContextRef.current.orgId !== currentContext.orgId ||
      previousContextRef.current.hasDedicatedKey !== currentContext.hasDedicatedKey ||
      previousContextRef.current.tuttiudStatus !== currentContext.tuttiudStatus
    previousContextRef.current = currentContext

    if (hasDedicatedKey) {
      setAppKeyInput('')
      setAppKeyState((previous) =>
        previous.status === 'error'
          ? previous
          : {
              status: 'success',
              message: 'מפתח היישום כבר שמור בארגון. ניתן לאמת את ההתקנה הקיימת.',
              error: undefined
            }
      )

      if (!needsPreparation) {
        setPreparationAcknowledged(true)
        setPreparationState((previous) =>
          previous.status === 'error'
            ? previous
            : {
                status: 'success',
                message: 'זיהינו מפתח שמור. המשיכו לאימות כדי לוודא שהכל תקין.',
                error: undefined
              }
        )
        setInitState((previous) =>
          previous.status === 'error'
            ? previous
            : {
                status: 'idle',
                message: 'לחצו על "אימות ההגדרה" כדי לבדוק שהמסד מוכן לשימוש.',
                error: undefined
              }
        )
      }

      return
    }

    setAppKeyInput(storedKey)

    if (storedKey) {
      setAppKeyState((previous) =>
        previous.status === 'error'
          ? previous
          : {
              status: 'success',
              message: 'מפתח היישום נשמר. ניתן לעבור לבדיקה בשלב הבא.',
              error: undefined
            }
      )
    } else {
      setAppKeyState((previous) =>
        previous.status === 'error' ? previous : { status: 'idle', error: undefined }
      )
    }

    if (isAlreadyConnected) {
      markPreparationSatisfied('החיבור למסד הנתונים כבר פעיל. נריץ בדיקות לוודא שהכל תקין.')
      setInitState({
        status: 'success',
        message: 'החיבור למסד הנתונים כבר פעיל. נריץ בדיקות לוודא שהכל תקין.',
        error: undefined
      })
      setValidationTrigger((current) => current ?? 'auto')
    } else {
      if (!needsPreparation || contextChanged) {
        requireManualPreparation({
          status: 'idle',
          message:
            'לפני שנבדוק את החיבור, עקבו אחר ההנחיות בשלב 0 והזינו את מפתח היישום בשלב 1.',
          error: undefined
        })
        setInitState({
          status: 'idle',
          message:
            'לפני שנבדוק את החיבור, עקבו אחר ההנחיות בשלב 0 והזינו את מפתח היישום בשלב 1.',
          error: undefined
        })
      }
    }
  }, [
    markPreparationSatisfied,
    needsPreparation,
    readyToStart,
    requireManualPreparation,
    selectedOrganization,
    settingsQuery.data,
    settingsQuery.error,
    settingsQuery.isError,
    settingsQuery.isSuccess,
    setupStatusQuery.data,
    setupStatusQuery.error,
    setupStatusQuery.isError,
    setupStatusQuery.isSuccess
  ])

  const runValidation = useCallback(
    async (origin: 'auto' | 'manual') => {
      if (!selectedOrganization) return

      const orgId = selectedOrganization.org_id

      setPreparationDetails(null)
      setInitState({
        status: 'loading',
        message:
          origin === 'auto'
            ? 'מוודאים שהחיבור למסד הנתונים עדיין פעיל...'
            : 'בודקים את החיבור למסד הנתונים...',
        error: undefined
      })
      setSchemaState({ status: 'idle', exists: null, lastBootstrappedAt: null })
      setDiagnosticsState({ status: 'idle', diagnostics: null })
      setConnectionUpdateState({ status: 'idle' })

      let verificationDiagnostics: SetupDiagnostics | null = null

      try {
        const settings = await fetchOrganizationSetupSettings(orgId)
        setOrganizationSettings(settings)

        if (!settings) {
          requireManualPreparation({
            status: 'warning',
            message: 'לא נמצאו הגדרות חיבור לארגון. פנו לתמיכת TutTiud להמשך טיפול.',
            error: undefined
          })
          setAppKeyState({ status: 'idle' })
          setInitState({
            status: 'warning',
            message: 'לא נמצאו הגדרות חיבור לארגון. פנו לתמיכת TutTiud להמשך טיפול.',
            error: undefined
          })
          return
        }

        const storedKey = settings.metadata.credentials.tuttiudAppJwt ?? ''
        const isAlreadyConnected = settings.metadata.connections.tuttiud === 'connected'

        if (hasDedicatedKeyStored) {
          setAppKeyInput('')
          setAppKeyState((previous) =>
            previous.status === 'error'
              ? previous
              : {
                  status: 'success',
                  message: 'מפתח היישום שמור. נבדוק את ההתקנה הקיימת.',
                  error: undefined
                }
          )
        } else {
          setAppKeyInput(storedKey)

          if (storedKey) {
            setAppKeyState((previous) =>
              previous.status === 'error'
                ? previous
                : {
                    status: 'success',
                    message: 'מפתח היישום נשמר. ממשיכים לבדיקה.',
                    error: undefined
                  }
            )
          } else if (!isAlreadyConnected) {
            requireManualPreparation({
              status: 'error',
              message: 'הדביקו ושמרו את מפתח APP_DEDICATED_KEY לפני בדיקת החיבור.',
              error: undefined
            })
            setAppKeyState({
              status: 'error',
              message: 'הדביקו ושמרו את מפתח APP_DEDICATED_KEY לפני בדיקת החיבור.',
              error: undefined
            })
            setInitState({
              status: 'error',
              message: 'חסר מפתח יישום. השלימו את שלב 1 ונסו שוב.',
              error: undefined
            })
            return
          }
        }

        if (hasDedicatedKeyStored && !needsPreparation) {
          try {
            const verification = await verifyStoredTuttiudSetup(orgId, {
              accessToken
            })

            verificationDiagnostics = verification.diagnostics
            markPreparationSatisfied('החיבור אומת בהצלחה באמצעות המפתח הקיים.')
            setInitState({
              status: 'success',
              message: 'החיבור אומת בהצלחה באמצעות המפתח הקיים.',
              error: undefined
            })
          } catch (error) {
            const verificationError = error as SetupWizardError
            requireManualPreparation({
              status: 'error',
              message: 'האימות עם המפתח הקיים נכשל. הריצו את סקריפט ההתקנה ונסו שוב.',
              error: undefined
            })
            setPreparationDetails(formatTechnicalDetails(verificationError.cause))
            setInitState({
              status: 'error',
              message: verificationError.message,
              error: formatTechnicalDetails(verificationError.cause)
            })
            return
          }
        } else if (isAlreadyConnected) {
          markPreparationSatisfied('החיבור כבר אושר בעבר. נמשיך לבדיקות משלימות.')
          setInitState({
            status: 'success',
            message: 'החיבור כבר אושר בעבר. נמשיך לבדיקות משלימות.',
            error: undefined
          })
        } else {
          try {
            const initResult = await initializeSetupForOrganization(orgId)

            if (!initResult.initialized) {
              requireManualPreparation({
                status: 'error',
                message:
                  initResult.message ??
                  'לא הצלחנו להתחבר למסד הנתונים. בדקו את ההרשאות ונסו שוב.',
                error: undefined
              })
              setInitState({
                status: 'error',
                message:
                  initResult.message ??
                  'לא הצלחנו להתחבר למסד הנתונים. בדקו את ההרשאות ונסו שוב.',
                error: undefined
              })
              return
            }

            markPreparationSatisfied(initResult.message ?? 'התחברנו למסד הנתונים בהצלחה.')
            setInitState({
              status: 'success',
              message: initResult.message ?? 'התחברנו למסד הנתונים בהצלחה.',
              error: undefined
            })
          } catch (error) {
            const setupError = error as SetupWizardError
            if (setupError.kind === 'missing-function') {
              requireManualPreparation({
                status: 'warning',
                message: 'נדרש להריץ את סקריפט ההתקנה של TutTiud לפני שנוכל להמשיך.',
                error: undefined
              })
              setPreparationDetails(formatTechnicalDetails(setupError.cause))
              setInitState({
                status: 'warning',
                message: 'נדרש להריץ את סקריפט ההתקנה של TutTiud לפני שנוכל להמשיך.',
                error: undefined
              })
              return
            }

            setInitState({
              status: 'error',
              message: setupError.message,
              error: formatTechnicalDetails(setupError.cause)
            })
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
            : 'מבנה הנתונים של TutTiud עדיין לא נוצר.',
          error: undefined
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

      if (verificationDiagnostics) {
        const severity: StepState['status'] =
          verificationDiagnostics.status === 'ok'
            ? 'success'
            : verificationDiagnostics.status === 'warning'
            ? 'warning'
            : 'error'

        setDiagnosticsState({
          status: severity,
          diagnostics: verificationDiagnostics,
          message: verificationDiagnostics.summary,
          error: undefined
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
          message: diagnostics?.summary,
          error: undefined
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
    },
    [
      accessToken,
      hasDedicatedKeyStored,
      markPreparationSatisfied,
      needsPreparation,
      requireManualPreparation,
      selectedOrganization
    ]
  )

  useEffect(() => {
    if (!selectedOrganization || !validationTrigger) return

    const trigger = validationTrigger
    setValidationTrigger(null)
    void runValidation(trigger)
  }, [runValidation, selectedOrganization, validationTrigger])

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
      organizationSettings.metadata.connections.tuttiud === 'connected' ||
      needsPreparation
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
    needsPreparation,
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

  const handleCopyScript = useCallback(async () => {
    try {
      if (!navigator?.clipboard?.writeText) {
        setCopyStatus('error')
        return
      }
      await navigator.clipboard.writeText(DATABASE_PREPARATION_SQL)
      setCopyStatus('success')
    } catch (error) {
      console.error('copy setup script failed', error)
      setCopyStatus('error')
    }
  }, [])

  const handlePreparationContinue = useCallback(() => {
    if (!isPreparationChecklistComplete) {
      return
    }

    setPreparationAcknowledged(true)
    setPreparationState({
      status: 'success',
      message: 'סימנתם שהשלמתם את שלב ההכנה. עברו לשלב 1 להזנת המפתח.',
      error: undefined
    })
  }, [isPreparationChecklistComplete])

  const handleSaveAppKey = useCallback(async () => {
    if (!selectedOrganization) {
      return
    }

    const trimmedKey = appKeyInput.trim()

    if (!trimmedKey) {
      setAppKeyState({
        status: 'error',
        message: 'הדביקו את ערך APP_DEDICATED_KEY ולאחר מכן לחצו על "שמירת המפתח".',
        error: undefined
      })
      return
    }

    if (!organizationSettings) {
      setAppKeyState({
        status: 'error',
        message: 'ההגדרות של הארגון עדיין נטענות. נסו שוב בעוד רגע.',
        error: undefined
      })
      return
    }

    if (!organizationSettings.supabase_url) {
      setAppKeyState({
        status: 'error',
        message: 'יש להזין את כתובת Supabase של הארגון לפני שמירת המפתח.',
        error: undefined
      })
      return
    }

    setAppKeyState({
      status: 'loading',
      message: 'שומרים ומאמתים את מפתח היישום...',
      error: undefined
    })

    try {
      const metadata = await saveTuttiudAppKey(selectedOrganization.org_id, trimmedKey, {
        currentMetadata: organizationSettings.metadata.raw,
        supabaseUrl: organizationSettings.supabase_url,
        accessToken: session?.access_token ?? null
      })

      setOrganizationSettings((previous) => {
        if (!previous || previous.org_id !== selectedOrganization.org_id) {
          return previous
        }

        return {
          ...previous,
          metadata
        }
      })

      setAppKeyInput('')

      setAppKeyState({
        status: 'success',
        message: 'המפתח נשמר והאימות הראשוני בוצע בהצלחה. המשיכו לבדיקה המלאה של החיבור.',
        error: undefined
      })

      void queryClient.invalidateQueries({ queryKey: ['setup-wizard', 'setup-status'] })
    } catch (error) {
      const keyError = error as SetupWizardError
      setAppKeyState({
        status: 'error',
        message: keyError.message,
        error: formatTechnicalDetails(keyError.cause)
      })
    }
  }, [appKeyInput, organizationSettings, queryClient, selectedOrganization, session?.access_token])

  const handleRequestValidation = useCallback(() => {
    if (!selectedOrganization) {
      return
    }

    if (shouldShowPreparationGuide && !preparationAcknowledged) {
      setPreparationState({
        status: 'error',
        message: 'סמנו שסיימתם את הצעדים הידניים לפני בדיקת החיבור.',
        error: undefined
      })
      return
    }

    if (shouldShowPreparationGuide && !hasStoredAppKey) {
      setAppKeyState({
        status: 'error',
        message: 'שמרו את מפתח היישום לפני בדיקת החיבור.',
        error: undefined
      })
      return
    }

    setValidationTrigger('manual')
  }, [
    hasStoredAppKey,
    preparationAcknowledged,
    selectedOrganization,
    shouldShowPreparationGuide
  ])

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
            {showReturningVerification && (
              <section className="space-y-2 rounded-lg border border-primary/40 bg-primary/10 p-4 text-right">
                <h2 className="text-lg font-semibold text-primary">ברוכים השבים ל-TutTiud</h2>
                <p className="text-sm text-primary">
                  זיהינו שמפתח היישום של TutTiud כבר שמור בארגון. לחצו על "אימות ההגדרה" כדי לוודא שהמסד מוכן לשימוש. אם האימות נכשל, נציג מחדש את הוראות ההכנה הידניות.
                </p>
              </section>
            )}
            {shouldShowPreparationGuide && (
              <section className="space-y-4 rounded-lg border border-primary/40 bg-primary/10 p-4">
                <header className="flex flex-col gap-2 text-right sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-primary">שלב 0 — הכנת מסד הנתונים</h2>
                    <p className="text-sm text-muted-foreground">
                      לפני שננסה להתחבר למסד הנתונים, עקבו אחר ההנחיות הידניות הבאות. האשף יאפשר המשך רק לאחר שתסמנו שהמשימות הושלמו.
                    </p>
                  </div>
                  <StepStatusBadge state={preparationState} />
                </header>
                {preparationState.message && (
                  <p className="text-sm text-muted-foreground">{preparationState.message}</p>
                )}
                {preparationState.error && <TechnicalDetails details={preparationState.error} />}
                <ol className="space-y-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3 text-right text-sm">
                  {(!hasDedicatedKeyStored || !needsPreparation) && (
                    <li className="flex flex-col gap-2">
                      <label className="flex items-start gap-3 text-right">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-muted-foreground/40 text-primary focus:ring-primary"
                          checked={preparationChecklist.schemaExposed}
                          onChange={(event) =>
                            updatePreparationChecklist('schemaExposed', event.currentTarget.checked)
                          }
                        />
                        <span className="flex flex-1 flex-col items-end gap-1">
                          <span className="text-sm font-semibold text-foreground">פעולה 1: חשיפת הסכימה tuttiud</span>
                          <span className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
                            <span className="text-lg" aria-hidden="true">
                              🗂️
                            </span>
                            היכנסו ל-Supabase Settings → API והוסיפו את tuttiud לרשימת Exposed schemas (הקישור ייפתח בחלון חדש – בחרו בפרויקט הרלוונטי במידת הצורך).
                          </span>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button asChild size="sm" variant="outline">
                              <a
                                href="https://app.supabase.com/project/_/settings/api"
                                target="_blank"
                                rel="noreferrer"
                              >
                                פתיחת הגדרות API
                              </a>
                            </Button>
                          </div>
                        </span>
                      </label>
                    </li>
                  )}
                  <li className="flex flex-col gap-2">
                    <label className="flex items-start gap-3 text-right">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-muted-foreground/40 text-primary focus:ring-primary"
                        checked={preparationChecklist.scriptExecuted}
                        onChange={(event) =>
                          updatePreparationChecklist('scriptExecuted', event.currentTarget.checked)
                        }
                      />
                      <span className="flex flex-1 flex-col items-end gap-1">
                        <span className="text-sm font-semibold text-foreground">פעולה 2: הרצת סקריפט ההתקנה</span>
                        <span className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
                          <span className="text-lg" aria-hidden="true">
                            💾
                          </span>
                          העתיקו את הסקריפט המלא, הדביקו אותו ב-SQL Editor של Supabase והריצו אותו מתחילתו ועד סופו.
                        </span>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button type="button" size="sm" variant="secondary" onClick={handleCopyScript}>
                            העתקת הסקריפט
                          </Button>
                        </div>
                      </span>
                    </label>
                  </li>
                  {(!hasDedicatedKeyStored || !needsPreparation) && (
                    <li className="flex flex-col gap-2">
                      <label className="flex items-start gap-3 text-right">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-muted-foreground/40 text-primary focus:ring-primary"
                          checked={preparationChecklist.keyCaptured}
                          onChange={(event) =>
                            updatePreparationChecklist('keyCaptured', event.currentTarget.checked)
                          }
                        />
                        <span className="flex flex-1 flex-col items-end gap-1">
                          <span className="text-sm font-semibold text-foreground">פעולה 3: שמירת APP_DEDICATED_KEY</span>
                          <span className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
                            <span className="text-lg" aria-hidden="true">
                              🔑
                            </span>
                            לאחר הרצת הסקריפט העתיקו את ערך APP_DEDICATED_KEY שיופיע בתוצאה ושמרו אותו זמנית להדבקה בשלב הבא.
                          </span>
                        </span>
                      </label>
                    </li>
                  )}
                </ol>
                {copyStatus === 'success' && (
                  <p className="text-xs text-emerald-700">
                    הסקריפט הועתק ללוח. הדביקו אותו ב-SQL Editor של Supabase והפעילו אותו במלואו.
                  </p>
                )}
                {copyStatus === 'error' && (
                  <p className="text-xs text-destructive">
                    לא הצלחנו להעתיק אוטומטית את הסקריפט. העתיקו ידנית את הטקסט המלא שמופיע למטה.
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button type="button" onClick={handlePreparationContinue} disabled={!isPreparationChecklistComplete}>
                    סיימתי את ההכנה — המשך לשלב 1
                  </Button>
                </div>
                <pre className="overflow-x-auto whitespace-pre rounded-md border border-muted-foreground/30 bg-background p-3 text-left text-xs ltr" dir="ltr">
                  <code>{DATABASE_PREPARATION_SQL}</code>
                </pre>
                <TechnicalDetails details={preparationDetails} />
              </section>
            )}
            {shouldShowAppKeyStep && (
              <section className="space-y-3 rounded-lg border border-muted-foreground/30 bg-background/80 p-4">
                <header className="flex items-center justify-between">
                  <div className="text-right">
                  <h2 className="text-lg font-semibold">שלב 1 — הזנת מפתח היישום</h2>
                    <p className="text-sm text-muted-foreground">
                      הדביקו את APP_DEDICATED_KEY שהתקבל מהסקריפט ושמרו אותו כדי שנוכל להמשיך לאימות החיבור.
                    </p>
                  </div>
                  <StepStatusBadge state={appKeyState} />
                </header>
                <div className="space-y-2 text-right">
                  <Label htmlFor="tuttiud-app-key" className="text-sm font-semibold">
                    ערך APP_DEDICATED_KEY
                  </Label>
                  <textarea
                    id="tuttiud-app-key"
                    className="min-h-[6rem] w-full rounded-md border border-muted-foreground/40 bg-background p-3 text-left text-xs ltr focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    dir="ltr"
                    value={appKeyInput}
                    onChange={(event) => setAppKeyInput(event.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  />
                </div>
                {appKeyState.message && (
                  <p className="text-sm text-muted-foreground">{appKeyState.message}</p>
                )}
                {appKeyState.error && <TechnicalDetails details={appKeyState.error} />}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    onClick={handleSaveAppKey}
                    disabled={appKeyState.status === 'loading' || !isSettingsLoaded}
                  >
                    שמירת המפתח
                  </Button>
                </div>
              </section>
            )}

            <section className="space-y-3 rounded-lg border border-muted-foreground/30 bg-background/80 p-4">
              <header className="flex items-center justify-between">
                <div className="text-right">
                  <h2 className="text-lg font-semibold">{connectionStepTitle}</h2>
                  <p className="text-sm text-muted-foreground">{connectionStepDescription}</p>
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
                      {organizationSettings.anon_key ? '✓ מוגדר (מוסתר לביטחון)' : 'לא הוגדר'}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5 text-right">
                    <dt className="font-semibold text-foreground">סטטוס חיבור TutTiud</dt>
                    <dd className="text-left" dir="ltr">
                      {tuttiudStatus === 'connected' ? '✓ מחובר' : 'ממתין לאימות'}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5 text-right">
                    <dt className="font-semibold text-foreground">עודכן לאחרונה</dt>
                    <dd>
                      {organizationSettings.updated_at
                        ? new Date(organizationSettings.updated_at).toLocaleString('he-IL')
                        : 'אין נתון'}
                    </dd>
                  </div>
                </dl>
              )}
              {initState.error && <TechnicalDetails details={initState.error} />}
              {connectionUpdateState.status === 'loading' && connectionUpdateState.message && (
                <p className="text-xs text-muted-foreground">{connectionUpdateState.message}</p>
              )}
              {connectionUpdateState.status === 'success' && connectionUpdateState.message && (
                <p className="text-xs text-emerald-600">{connectionUpdateState.message}</p>
              )}
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
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setRefreshToken((value) => value + 1)}
                  disabled={isValidationLoading}
                >
                  רענון הנתונים
                </Button>
                <Button
                  type="button"
                  onClick={handleRequestValidation}
                  disabled={!canRequestValidation || isValidationLoading}
                >
                  {validationButtonLabel}
                </Button>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-muted-foreground/30 bg-background/80 p-4">
              <header className="flex items-center justify-between">
                <div className="text-right">
                  <h2 className="text-lg font-semibold">שלב 3 — יצירת מבנה הנתונים</h2>
                  <p className="text-sm text-muted-foreground">
                    בודקים שהטבלאות והפונקציות של TutTiud קיימות. אם חסר מבנה נתונים ניתן להפעיל את תהליך ההקמה האוטומטי.
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
              {schemaState.error && <TechnicalDetails details={schemaState.error} />}
              {schemaState.exists === false && (
                <div className="flex flex-col items-end justify-between gap-3 rounded-md border border-dashed border-primary/40 bg-primary/5 p-4 text-sm">
                  <p>
                    נראה שמבנה הנתונים עדיין לא הוגדר. לחצו על הכפתור כדי להריץ את ההקמה האוטומטית.
                  </p>
                  <Button onClick={handleCreateSchema}>צרו את מבנה הנתונים של TutTiud</Button>
                </div>
              )}
            </section>

            <section className="space-y-3 rounded-lg border border-muted-foreground/30 bg-background/80 p-4">
              <header className="flex items-center justify-between">
                <div className="text-right">
                  <h2 className="text-lg font-semibold">שלב 4 — בדיקות אחרונות</h2>
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
