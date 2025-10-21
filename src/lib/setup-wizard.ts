import { supabaseClient } from './supabase-client'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export type TuttiudConnectionStatus = 'connected' | (string & {}) | null

export type OrganizationConnectionsMetadata = {
  tuttiud: TuttiudConnectionStatus
  [key: string]: unknown
}

export type OrganizationCredentialsMetadata = {
  tuttiudAppJwt: string | null
  [key: string]: unknown
}

export type OrganizationSetupMetadata = {
  connections: OrganizationConnectionsMetadata
  credentials: OrganizationCredentialsMetadata
  raw: Record<string, unknown>
}

export type OrganizationSetupSettings = {
  org_id: string | null
  supabase_url: string | null
  anon_key: string | null
  updated_at: string | null
  metadata: OrganizationSetupMetadata
}

export type SetupStepStatus = 'idle' | 'loading' | 'success' | 'error'

export type SchemaCheckResult = {
  exists: boolean
  lastBootstrappedAt: string | null
}

export type DiagnosticsIssue = {
  type: 'table' | 'policy' | 'permission' | 'other'
  description: string
}

export type DiagnosticsSqlSnippet = {
  title: string
  sql: string
}

export type SetupDiagnostics = {
  status: 'ok' | 'warning' | 'error'
  summary: string
  issues: DiagnosticsIssue[]
  sqlSnippets: DiagnosticsSqlSnippet[]
  raw: unknown
}

export type SetupWizardError = {
  message: string
  cause?: unknown
  kind?: 'missing-function' | 'unauthorized' | 'unknown'
}

export type SetupStatus = {
  hasDedicatedKey: boolean
}

const errorForMissingClient: SetupWizardError = {
  message: 'לא הצלחנו להתחבר ל-Supabase. רעננו את הדפדפן או צרו קשר עם התמיכה.'
}

const withClient = <T,>(
  fn: (client: NonNullable<typeof supabaseClient>) => Promise<T>
): Promise<T> => {
  if (!supabaseClient) {
    return Promise.reject(errorForMissingClient)
  }
  return fn(supabaseClient)
}

const isPostgrestMissingFunction = (error: unknown) =>
  Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      ['PGRST116', 'PGRST202'].includes(String((error as { code?: string | number }).code))
  )

const mapDiagnosticsIssues = (rawIssues: unknown, type: DiagnosticsIssue['type']) => {
  if (!Array.isArray(rawIssues)) return []
  return rawIssues
    .map((entry) => {
      if (!entry) return null
      if (typeof entry === 'string') {
        return { type, description: entry }
      }
      if (typeof entry === 'object' && 'description' in entry) {
        const description = String((entry as { description: unknown }).description)
        return { type, description }
      }
      if (typeof entry === 'object' && 'name' in entry) {
        const description = String((entry as { name: unknown }).name)
        return { type, description }
      }
      return { type, description: JSON.stringify(entry) }
    })
    .filter((issue): issue is DiagnosticsIssue => Boolean(issue))
}

const normaliseSqlSnippets = (sql: unknown): DiagnosticsSqlSnippet[] => {
  if (!sql) return []
  if (typeof sql === 'string') {
    return [{ title: 'פקודת SQL מוצעת', sql }]
  }
  if (Array.isArray(sql)) {
    return sql
      .map((entry, index) => {
        if (!entry) return null
        if (typeof entry === 'string') {
          return { title: `פקודת SQL ${index + 1}`, sql: entry }
        }
        if (typeof entry === 'object' && 'sql' in entry) {
          const title =
            typeof (entry as { title?: unknown }).title === 'string'
              ? ((entry as { title?: string }).title ?? 'פקודת SQL')
              : `פקודת SQL ${index + 1}`
          return { title, sql: String((entry as { sql: unknown }).sql) }
        }
        return { title: `פקודת SQL ${index + 1}`, sql: JSON.stringify(entry) }
      })
      .filter((snippet): snippet is DiagnosticsSqlSnippet => Boolean(snippet))
  }
  if (typeof sql === 'object' && 'sql' in (sql as Record<string, unknown>)) {
    return [
      {
        title:
          typeof (sql as { title?: unknown }).title === 'string'
            ? ((sql as { title?: string }).title ?? 'פקודת SQL מוצעת')
            : 'פקודת SQL מוצעת',
        sql: String((sql as { sql: unknown }).sql)
      }
    ]
  }
  return []
}

const normaliseDiagnosticsPayload = (raw: unknown): SetupDiagnostics => {
  if (!raw) {
    return {
      status: 'ok',
      summary: 'האבחון הסתיים ללא הערות.',
      issues: [],
      sqlSnippets: [],
      raw
    }
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      status: 'warning',
      summary: 'התקבלה תשובת אבחון בלתי צפויה. בדקו את סקריפט ההתקנה ונסו שוב.',
      issues: [],
      sqlSnippets: [],
      raw
    }
  }

  const typedRaw = raw as Record<string, unknown>

  const statusValue = typedRaw.status
  const status: SetupDiagnostics['status'] =
    typeof statusValue === 'string' && ['ok', 'warning', 'error'].includes(statusValue)
      ? (statusValue as SetupDiagnostics['status'])
      : 'warning'

  const summaryValue = typedRaw.summary
  const summary =
    typeof summaryValue === 'string'
      ? summaryValue
      : status === 'ok'
      ? 'הכל תקין. ניתן להמשיך.'
      : 'זוהו פריטים המצריכים תשומת לב.'

  const issues: DiagnosticsIssue[] = [
    ...mapDiagnosticsIssues(typedRaw.missing_tables, 'table'),
    ...mapDiagnosticsIssues(typedRaw.missing_policies, 'policy'),
    ...mapDiagnosticsIssues(typedRaw.permission_issues, 'permission'),
    ...mapDiagnosticsIssues(typedRaw.other_issues, 'other')
  ]

  const sqlSnippets = normaliseSqlSnippets(typedRaw.suggested_sql ?? typedRaw.sql)

  return {
    status,
    summary,
    issues,
    sqlSnippets,
    raw
  }
}

type OrgSettingsRow = {
  org_id?: string | null
  supabase_url?: string | null
  anon_key?: string | null
  updated_at?: string | null
  metadata?: Record<string, unknown> | null
}

const normaliseMetadata = (
  metadata: OrgSettingsRow['metadata']
): OrganizationSetupMetadata => {
  if (!isRecord(metadata)) {
    return {
      connections: {
        tuttiud: null
      },
      credentials: {
        tuttiudAppJwt: null
      },
      raw: {}
    }
  }

  const connectionsSource = isRecord(metadata.connections)
    ? (metadata.connections as Record<string, unknown>)
    : {}

  const credentialsSource = isRecord(metadata.credentials)
    ? (metadata.credentials as Record<string, unknown>)
    : {}

  const tuttiudValue = connectionsSource.tuttiud
  const normalizedTuttiud: TuttiudConnectionStatus =
    typeof tuttiudValue === 'string' ? (tuttiudValue as TuttiudConnectionStatus) : null

  const normalizedConnections: OrganizationConnectionsMetadata = {
    ...connectionsSource,
    tuttiud: normalizedTuttiud
  }

  const tuttiudAppJwtValue = credentialsSource.tuttiudAppJwt
  const normalizedTuttiudAppJwt =
    typeof tuttiudAppJwtValue === 'string' && tuttiudAppJwtValue.trim().length > 0
      ? tuttiudAppJwtValue
      : null

  const normalizedCredentials: OrganizationCredentialsMetadata = {
    ...credentialsSource,
    tuttiudAppJwt: normalizedTuttiudAppJwt
  }

  return {
    connections: normalizedConnections,
    credentials: normalizedCredentials,
    raw: {
      ...metadata,
      connections: {
        ...connectionsSource,
        tuttiud: normalizedTuttiud
      },
      credentials: {
        ...credentialsSource,
        tuttiudAppJwt: normalizedTuttiudAppJwt
      }
    }
  }
}

export const fetchOrganizationSetupSettings = async (
  orgId: string
): Promise<OrganizationSetupSettings | null> =>
  withClient(async (client) => {
    const response = await client
      .from('org_settings')
      .select('org_id, supabase_url, anon_key, updated_at, metadata')
      .eq('org_id', orgId)
      .maybeSingle()

    if (response.error) {
      throw {
        message: 'לא הצלחנו לטעון את הגדרות החיבור. נסו שוב בעוד רגע.',
        cause: response.error
      } satisfies SetupWizardError
    }

    if (!response.data) {
      return null
    }

    const payload = response.data as OrgSettingsRow
    const normalizedOrgId =
      typeof payload.org_id === 'string' ? payload.org_id : null

    return {
      org_id: normalizedOrgId,
      supabase_url: payload.supabase_url ?? null,
      anon_key: payload.anon_key ?? null,
      updated_at: payload.updated_at ?? null,
      metadata: normaliseMetadata(payload.metadata)
    }
  })

export const fetchSetupStatus = async (
  orgId: string,
  options?: { accessToken?: string | null }
): Promise<SetupStatus> => {
  if (!orgId) {
    throw {
      message: 'מזהה הארגון חסר. רעננו את העמוד ונסו שוב.'
    } satisfies SetupWizardError
  }

  const accessToken = options?.accessToken?.trim() ?? ''

  if (!accessToken) {
    throw {
      message: 'תוקף ההתחברות פג. התחברו מחדש ונסו שוב.'
    } satisfies SetupWizardError
  }

  try {
    const response = await fetch(`/api/setup-status?orgId=${encodeURIComponent(orgId)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    const data = (await response.json().catch(() => null)) as
      | { success?: boolean; hasDedicatedKey?: boolean; message?: string }
      | null

    if (!response.ok || !data?.success) {
      throw {
        message:
          data?.message ?? 'טעינת סטטוס ההגדרה נכשלה. נסו שוב בעוד מספר רגעים.',
        cause: data
      } satisfies SetupWizardError
    }

    return {
      hasDedicatedKey: Boolean(data.hasDedicatedKey)
    }
  } catch (error) {
    if ((error as SetupWizardError)?.message) {
      throw error
    }

    throw {
      message: 'לא ניתן היה לקבל את סטטוס ההגדרה מהשרת. ודאו שהחיבור תקין ונסו שוב.',
      cause: error
    } satisfies SetupWizardError
  }
}

export const updateTuttiudConnectionStatus = async (
  orgId: string,
  status: Exclude<TuttiudConnectionStatus, null>,
  options?: { currentMetadata?: Record<string, unknown> | null }
): Promise<OrganizationSetupMetadata> =>
  withClient(async (client) => {
    const current = normaliseMetadata(options?.currentMetadata ?? null)
    const existingConnections = isRecord(current.raw.connections)
      ? (current.raw.connections as Record<string, unknown>)
      : {}

    const nextRaw: Record<string, unknown> = {
      ...current.raw,
      connections: {
        ...existingConnections,
        tuttiud: status
      },
      credentials: isRecord(current.raw.credentials)
        ? (current.raw.credentials as Record<string, unknown>)
        : {}
    }

    const { error } = await client
      .from('org_settings')
      .update({ metadata: nextRaw })
      .eq('org_id', orgId)

    if (error) {
      throw {
        message: 'עדכון סטטוס החיבור של TutTiud נכשל. אנא נסה שוב מאוחר יותר.',
        cause: error
      } satisfies SetupWizardError
    }

    return normaliseMetadata(nextRaw)
  })

export const saveTuttiudAppKey = async (
  orgId: string,
  appKey: string,
  options?: {
    currentMetadata?: Record<string, unknown> | null
    supabaseUrl?: string | null
    accessToken?: string | null
  }
): Promise<OrganizationSetupMetadata> => {
  if (!orgId) {
    throw {
      message: 'זיהוי הארגון חסר. רעננו את העמוד ונסו שוב.'
    } satisfies SetupWizardError
  }

  const payload = {
    orgId,
    appKey,
    supabaseUrl: options?.supabaseUrl ?? null,
    currentMetadata: options?.currentMetadata ?? null
  }

  const authToken = options?.accessToken?.trim() ?? ''

  if (!authToken) {
    throw {
      message: 'תוקף ההתחברות פג. התחברו מחדש ונסו לשמור את מפתח היישום.'
    } satisfies SetupWizardError
  }

  try {
    const response = await fetch('/api/store-tuttiud-app-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify(payload)
    })

    const data = (await response.json().catch(() => null)) as
      | { success?: boolean; message?: string; metadata?: Record<string, unknown> | null }
      | null

    if (!response.ok || !data?.success) {
      throw {
        message:
          data?.message ??
          'שמירת המפתח נכשלה. בדקו את פרטי החיבור או נסו מחדש לאחר הרצת סקריפט ההכנה.',
        cause: data
      } satisfies SetupWizardError
    }

    return normaliseMetadata(data.metadata ?? null)
  } catch (error) {
    if ((error as SetupWizardError)?.message) {
      throw error
    }

    throw {
      message: 'לא הצלחנו לתקשר עם שרת האימות. ודאו שהחיבור תקין ונסו שוב.',
      cause: error
    } satisfies SetupWizardError
  }
}

export const verifyStoredTuttiudSetup = async (
  orgId: string,
  options?: { accessToken?: string | null }
): Promise<{ diagnostics: SetupDiagnostics }> => {
  if (!orgId) {
    throw {
      message: 'מזהה הארגון חסר. רעננו את העמוד ונסו שוב.'
    } satisfies SetupWizardError
  }

  const accessToken = options?.accessToken?.trim() ?? ''

  if (!accessToken) {
    throw {
      message: 'תוקף ההתחברות פג. התחברו מחדש ונסו שוב.'
    } satisfies SetupWizardError
  }

  try {
    const response = await fetch('/api/verify-tuttiud-setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ orgId })
    })

    const data = (await response.json().catch(() => null)) as
      | { success?: boolean; message?: string; diagnostics?: unknown; details?: unknown }
      | null

    if (!response.ok || !data?.success) {
      throw {
        message:
          data?.message ?? 'האימות עם המפתח השמור נכשל. בדקו את סקריפט ההתקנה ונסו שוב.',
        cause: data?.details ?? data
      } satisfies SetupWizardError
    }

    return {
      diagnostics: normaliseDiagnosticsPayload(data.diagnostics ?? null)
    }
  } catch (error) {
    if ((error as SetupWizardError)?.message) {
      throw error
    }

    throw {
      message: 'לא הצלחנו להריץ את האימות מול מסד הנתונים. ודאו שהחיבור תקין ונסו שוב.',
      cause: error
    } satisfies SetupWizardError
  }
}

export const initializeSetupForOrganization = async (
  orgId: string
): Promise<{ initialized: boolean; message?: string }> =>
  withClient(async (client) => {
    try {
      const { data, error } = await client
        .schema('tuttiud')
        .rpc('setup_assistant_initialize', {
          org_id: orgId
        })

      if (error) {
        throw error
      }

      const payload = (data ?? {}) as { initialized?: boolean; message?: string } | null

      const initialized = Boolean(payload?.initialized ?? data)
      const message = payload?.message ?? undefined

      return { initialized, message }
    } catch (error) {
      if (isPostgrestMissingFunction(error)) {
        throw {
          message:
            'תהליך ההתחלה של TutTiud לא הותקן בסכימת tuttiud של Supabase. אנא פרסו את ההרחבות הנדרשות ונסו שוב.',
          cause: error,
          kind: 'missing-function'
        } satisfies SetupWizardError
      }

      throw {
        message: 'לא הצלחנו להתחבר למסד הנתונים. בדקו את פרטי ההתחברות ונסו שוב.',
        cause: error
      } satisfies SetupWizardError
    }
  })

export const checkSchemaStatus = async (
  orgId: string
): Promise<SchemaCheckResult> =>
  withClient(async (client) => {
    try {
      const { data, error } = await client.rpc('setup_assistant_schema_status', {
        org_id: orgId
      })

      if (error) {
        throw error
      }

      const payload = data as
        | { exists?: boolean; last_bootstrapped_at?: string | null }
        | null

      return {
        exists: Boolean(payload?.exists),
        lastBootstrappedAt: payload?.last_bootstrapped_at ?? null
      }
    } catch (error) {
      if (isPostgrestMissingFunction(error)) {
        throw {
          message:
            'בדיקות מבנה הנתונים של TutTiud לא הותקנו ב-Supabase. אנא עדכנו את סביבת Supabase ונסו שוב.',
          cause: error
        } satisfies SetupWizardError
      }

      throw {
        message: 'לא הצלחנו לבדוק את מבנה הנתונים של TutTiud. נסו שוב בעוד רגע.',
        cause: error
      } satisfies SetupWizardError
    }
  })

export const runSchemaBootstrap = async (
  orgId: string
): Promise<{ executed: boolean; message?: string }> =>
  withClient(async (client) => {
    try {
      const { data, error } = await client.rpc('setup_assistant_run_bootstrap', {
        org_id: orgId
      })

      if (error) {
        throw error
      }

      const payload = (data ?? {}) as { executed?: boolean; message?: string } | null

      const executed = Boolean(payload?.executed ?? data)
      const message = payload?.message ?? undefined

      return { executed, message }
    } catch (error) {
      if (isPostgrestMissingFunction(error)) {
        throw {
          message:
            'תהליך ההקמה של TutTiud לא הותקן ב-Supabase. אנא פרסו את סקריפט ההקמה ונסו שוב.',
          cause: error
        } satisfies SetupWizardError
      }

      throw {
        message: 'לא הצלחנו ליצור את מבנה הנתונים של TutTiud. בדקו את ההרשאות במסד הנתונים ונסו שוב.',
        cause: error
      } satisfies SetupWizardError
    }
  })

export const runDiagnostics = async (
  orgId: string
): Promise<SetupDiagnostics | null> =>
  withClient(async (client) => {
    try {
      const { data, error } = await client.rpc('setup_assistant_diagnostics', {
        org_id: orgId
      })

      if (error) {
        throw error
      }

      const raw = data as Record<string, unknown> | null

      return normaliseDiagnosticsPayload(raw)
    } catch (error) {
      if (isPostgrestMissingFunction(error)) {
        return {
          status: 'warning',
          summary:
            'פונקציית setup_assistant_diagnostics אינה זמינה. האבחון דולג, מומלץ להוסיף את הפונקציה.',
          issues: [],
          sqlSnippets: [],
          raw: { missingFunction: true }
        }
      }

      throw {
        message: 'הרצת אבחון הסכמה נכשלה.',
        cause: error
      } satisfies SetupWizardError
    }
  })
