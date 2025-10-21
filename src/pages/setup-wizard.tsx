import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
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
  saveTuttiudAppKey,
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

const DATABASE_PREPARATION_SQL = `-- =================================================================
-- Tuttiud Platform Setup Script V2.1 (MVP Refined)
-- =================================================================
-- This script prepares a Supabase database for use with the Tuttiud platform.
-- It creates a dedicated 'tuttiud' schema, required tables, security policies,
-- and a diagnostics function.
--
-- INSTRUCTIONS:
-- 1. Run this entire script in your Supabase SQL Editor.
-- 2. At the end, it will generate a long string (JWT). Copy this key.
-- 3. Paste the key back into the Tuttiud Setup Wizard.
--
-- IMPORTANT: Replace 'YOUR_SUPER_SECRET_AND_LONG_JWT_SECRET_HERE' at the
-- bottom of the script with the actual JWT secret from your Supabase
-- project (Settings -> API -> JWT Secret).
-- =================================================================

-- Part 1: Extensions and Schema Creation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS tuttiud;

-- Part 2: Table Creation within 'tuttiud' schema (MVP Focus)

-- Instructors Table
CREATE TABLE IF NOT EXISTS tuttiud."Instructors" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" text NOT NULL,
  "email" text,
  "phone" text,
  "is_active" boolean DEFAULT true,
  "notes" text,
  "metadata" jsonb
);

-- Students Table
CREATE TABLE IF NOT EXISTS tuttiud."Students" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" text NOT NULL,
  "contact_info" text, -- Phone or Email
  "assigned_instructor_id" uuid REFERENCES tuttiud."Instructors"("id"),
  "tags" text[], -- For "belongs to" / health-fund
  "notes" text,
  "metadata" jsonb
);

-- Session Records Table
CREATE TABLE IF NOT EXISTS tuttiud."SessionRecords" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "date" date NOT NULL,
  "student_id" uuid NOT NULL REFERENCES tuttiud."Students"("id"),
  "instructor_id" uuid REFERENCES tuttiud."Instructors"("id"),
  "service_context" text, -- Optional context for the session (replaces Services table)
  "content" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "deleted" boolean NOT NULL DEFAULT false,
  "deleted_at" timestamptz,
  "metadata" jsonb
);

-- Settings Table (For future use, e.g., backup configuration)
CREATE TABLE IF NOT EXISTS tuttiud."Settings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "settings_value" jsonb NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "SessionRecords_student_date_idx" ON tuttiud."SessionRecords" ("student_id", "date");
CREATE INDEX IF NOT EXISTS "SessionRecords_instructor_idx" ON tuttiud."SessionRecords" ("instructor_id");

-- Part 3: Row Level Security (RLS) Setup

-- Enable RLS on all tables
ALTER TABLE tuttiud."Instructors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuttiud."Students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuttiud."SessionRecords" ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuttiud."Settings" ENABLE ROW LEVEL SECURITY;

-- Policies: Allow full access for authenticated users.
-- The application logic will be responsible for filtering records based on user roles (e.g., member sees only their students).
CREATE POLICY "Allow full access to authenticated users on Instructors" ON tuttiud."Instructors" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to authenticated users on Students" ON tuttiud."Students" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to authenticated users on SessionRecords" ON tuttiud."SessionRecords" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to authenticated users on Settings" ON tuttiud."Settings" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Part 4: Application Role and Permissions

-- Create the dedicated, non-login role for the application
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user;
  END IF;
END
$$;

-- Grant permissions to the app_user role on the 'tuttiud' schema
GRANT USAGE ON SCHEMA tuttiud TO app_user;
GRANT ALL ON ALL TABLES IN SCHEMA tuttiud TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA tuttiud GRANT ALL ON TABLES TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tuttiud TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA tuttiud GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Allow standard roles to switch to the app_user role
GRANT app_user TO postgres, authenticated, anon;

-- Part 5: Diagnostics Function

CREATE OR REPLACE FUNCTION tuttiud.setup_assistant_diagnostics()
RETURNS TABLE (check_name text, success boolean, details text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  required_tables constant text[] := array['Instructors', 'Students', 'SessionRecords', 'Settings'];
  table_name text;
  table_exists boolean;
BEGIN
  -- Check for 'tuttiud' schema
  success := EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'tuttiud');
  check_name := 'Schema "tuttiud" exists';
  details := CASE WHEN success THEN 'OK' ELSE 'Schema "tuttiud" not found.' END;
  RETURN NEXT;

  -- Check for 'app_user' role
  success := EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'app_user');
  check_name := 'Role "app_user" exists';
  details := CASE WHEN success THEN 'OK' ELSE 'Role "app_user" not found.' END;
  RETURN NEXT;

  -- Check for all required tables
  FOREACH table_name IN ARRAY required_tables LOOP
    success := to_regclass('tuttiud.' || quote_ident(table_name)) IS NOT NULL;
    check_name := 'Table "' || table_name || '" exists';
    details := CASE WHEN success THEN 'OK' ELSE 'Table ' || table_name || ' is missing.' END;
    RETURN NEXT;
  END LOOP;
END;
$$;


-- Part 6: Generate the Application-Specific JWT

-- IMPORTANT: Replace with your actual JWT secret from Supabase settings.
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
  const [needsPreparation, setNeedsPreparation] = useState(false)
  const [preparationDetails, setPreparationDetails] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [appKeyInput, setAppKeyInput] = useState('')
  const [appKeyState, setAppKeyState] = useState<StepState>({ status: 'idle' })
  const [validationTrigger, setValidationTrigger] = useState<'auto' | 'manual' | null>(null)

  const readyToStart = useMemo(
    () => clientAvailable && organizationStatus === 'ready' && Boolean(selectedOrganization),
    [clientAvailable, organizationStatus, selectedOrganization]
  )

  const tuttiudStatus = organizationSettings?.metadata.connections.tuttiud ?? null
  const hasStoredAppKey = Boolean(organizationSettings?.metadata.credentials.tuttiudAppJwt)
  const shouldShowPreparationGuide = needsPreparation
  const shouldShowAppKeyStep = shouldShowPreparationGuide || !hasStoredAppKey
  const diagnosticsSeverity = diagnosticsState.diagnostics?.status ?? null
  const diagnosticsIssues = diagnosticsState.diagnostics?.issues ?? []
  const diagnosticsSql = diagnosticsState.diagnostics?.sqlSnippets ?? []
  const isValidationLoading = initState.status === 'loading'
  const canRequestValidation =
    Boolean(selectedOrganization && organizationSettings) &&
    (tuttiudStatus === 'connected' || hasStoredAppKey)
  const isSettingsLoaded = Boolean(organizationSettings)
  const isConnectionUpdateLoading = connectionUpdateState.status === 'loading'

  useEffect(() => {
    if (!readyToStart || !selectedOrganization) return

    let isActive = true
    const orgId = selectedOrganization.org_id

    const loadSettings = async () => {
      setPreparationDetails(null)
      setCopyStatus('idle')

      try {
        const settings = await fetchOrganizationSetupSettings(orgId)
        if (!isActive) return

        setOrganizationSettings(settings)

        if (!settings) {
          setNeedsPreparation(true)
          setAppKeyInput('')
          setAppKeyState({ status: 'idle' })
          setInitState({
            status: 'warning',
            message: 'לא הצלחנו למצוא את הגדרות החיבור של הארגון. אנא צרו קשר עם התמיכה של TutTiud.',
            error: undefined
          })
          return
        }

        const storedKey = settings.metadata.credentials.tuttiudAppJwt ?? ''
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

        if (settings.metadata.connections.tuttiud === 'connected') {
          setNeedsPreparation(false)
          setInitState({
            status: 'success',
            message: 'החיבור למסד הנתונים כבר פעיל. נריץ בדיקות לוודא שהכל תקין.',
            error: undefined
          })
          setValidationTrigger((current) => current ?? 'auto')
        } else {
          setNeedsPreparation(true)
          setInitState({
            status: 'idle',
            message:
              'לפני שנבדוק את החיבור, הכינו את מסד הנתונים לפי ההנחיות בשלב 1 והזינו את מפתח היישום בשלב 2.',
            error: undefined
          })
        }
      } catch (error) {
        if (!isActive) return
        const fetchError = error as SetupWizardError
        setInitState({
          status: 'error',
          message:
            fetchError.message ?? 'טעינת הגדרות הארגון נכשלה. נסו שוב בעוד רגע.',
          error: formatTechnicalDetails(fetchError.cause)
        })
      }
    }

    void loadSettings()

    return () => {
      isActive = false
    }
  }, [readyToStart, selectedOrganization, refreshToken])

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

      try {
        const settings = await fetchOrganizationSetupSettings(orgId)
        setOrganizationSettings(settings)

        if (!settings) {
          setNeedsPreparation(true)
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
          setNeedsPreparation(true)
          setAppKeyState({
            status: 'error',
            message: 'הדביקו ושמרו את מפתח APP_DEDICATED_KEY לפני בדיקת החיבור.',
            error: undefined
          })
          setInitState({
            status: 'error',
            message: 'חסר מפתח יישום. השלימו את שלב 2 ונסו שוב.',
            error: undefined
          })
          return
        }

        if (isAlreadyConnected) {
          setNeedsPreparation(false)
          setInitState({
            status: 'success',
            message: 'החיבור כבר אושר בעבר. נמשיך לבדיקות משלימות.',
            error: undefined
          })
        } else {
          try {
            const initResult = await initializeSetupForOrganization(orgId)

            if (!initResult.initialized) {
              setNeedsPreparation(true)
              setInitState({
                status: 'error',
                message:
                  initResult.message ??
                  'לא הצלחנו להתחבר למסד הנתונים. בדקו את ההרשאות ונסו שוב.',
                error: undefined
              })
              return
            }

            setNeedsPreparation(false)
            setInitState({
              status: 'success',
              message: initResult.message ?? 'התחברנו למסד הנתונים בהצלחה.',
              error: undefined
            })
          } catch (error) {
            const setupError = error as SetupWizardError
            if (setupError.kind === 'missing-function') {
              setNeedsPreparation(true)
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
    [selectedOrganization]
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
        supabaseUrl: organizationSettings.supabase_url
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
    } catch (error) {
      const keyError = error as SetupWizardError
      setAppKeyState({
        status: 'error',
        message: keyError.message,
        error: formatTechnicalDetails(keyError.cause)
      })
    }
  }, [appKeyInput, organizationSettings, selectedOrganization])

  const handleRequestValidation = useCallback(() => {
    if (!selectedOrganization) {
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
  }, [hasStoredAppKey, selectedOrganization, shouldShowPreparationGuide])

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
            {shouldShowPreparationGuide && (
              <section className="space-y-3 rounded-lg border border-primary/40 bg-primary/10 p-4">
                <header className="flex flex-col gap-1 text-right">
                  <h2 className="text-lg font-semibold text-primary">שלב 1 — הכנת מסד הנתונים</h2>
                  <p className="text-sm text-muted-foreground">
                    לפני בדיקת החיבור, ודאו שהסכימה tuttiud חשופה דרך הגדרות ה-API והריצו את סקריפט ההכנה המלא במסד הנתונים של Supabase.
                  </p>
                </header>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={handleCopyScript}>
                    העתקת הסקריפט
                  </Button>
                <Button
                  type="button"
                    onClick={() => setRefreshToken((value) => value + 1)}
                    disabled={isValidationLoading}
                  >
                    סיימתי את ההכנה — רעננו את הנתונים
                  </Button>
                </div>
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
                <ol className="list-decimal space-y-1 rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 p-3 text-right text-sm">
                  <li>ב-Supabase Settings → API הוסיפו את tuttiud לרשימת Exposed schemas.</li>
                  <li>פתחו את SQL Editor, הדביקו את הסקריפט המלא והריצו אותו.</li>
                  <li>בסיום העתקו את הערך APP_DEDICATED_KEY שיוצג והמשיכו לשלב הזנת המפתח.</li>
                </ol>
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
                    <h2 className="text-lg font-semibold">שלב 2 — הזנת מפתח היישום</h2>
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
                  <h2 className="text-lg font-semibold">שלב 3 — בדיקת החיבור למסד הנתונים</h2>
                  <p className="text-sm text-muted-foreground">
                    לאחר שמירת המפתח נריץ בדיקה יזומה כדי לוודא שניתן להתחבר למסד הנתונים של TutTiud.
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
                  בדיקת החיבור
                </Button>
              </div>
              </section>

            <section className="space-y-3 rounded-lg border border-muted-foreground/30 bg-background/80 p-4">
              <header className="flex items-center justify-between">
                <div className="text-right">
                  <h2 className="text-lg font-semibold">שלב 4 — יצירת מבנה הנתונים</h2>
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
                  <h2 className="text-lg font-semibold">שלב 5 — בדיקות אחרונות</h2>
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
