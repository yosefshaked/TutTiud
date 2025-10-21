import { supabaseClient } from './supabase-client'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export type TuttiudConnectionStatus = 'connected' | (string & {}) | null

export type OrganizationConnectionsMetadata = {
  tuttiud: TuttiudConnectionStatus
  [key: string]: unknown
}

export type OrganizationSetupMetadata = {
  connections: OrganizationConnectionsMetadata
  raw: Record<string, unknown>
}

export type OrganizationSetupSettings = {
  org_id: string | null
  supabase_project_url: string | null
  supabase_anon_public: string | null
  last_synced_at: string | null
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
}

const errorForMissingClient: SetupWizardError = {
  message: 'Supabase client is not configured. אנא ודא שהוגדרו משתני הסביבה המתאימים.'
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
      (error as { code?: string | number }).code === 'PGRST116'
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

type OrgSettingsRow = {
  org_id?: string | null
  supabase_project_url?: string | null
  supabase_anon_public?: string | null
  last_synced_at?: string | null
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
      raw: {}
    }
  }

  const connectionsSource = isRecord(metadata.connections)
    ? (metadata.connections as Record<string, unknown>)
    : {}

  const tuttiudValue = connectionsSource.tuttiud
  const normalizedTuttiud: TuttiudConnectionStatus =
    typeof tuttiudValue === 'string' ? (tuttiudValue as TuttiudConnectionStatus) : null

  const normalizedConnections: OrganizationConnectionsMetadata = {
    ...connectionsSource,
    tuttiud: normalizedTuttiud
  }

  return {
    connections: normalizedConnections,
    raw: {
      ...metadata,
      connections: {
        ...connectionsSource,
        tuttiud: normalizedTuttiud
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
      .select(
        'org_id, supabase_project_url, supabase_anon_public, last_synced_at, metadata'
      )
      .eq('org_id', orgId)
      .maybeSingle()

    if (response.error) {
      throw {
        message: 'טעינת הגדרות הארגון נכשלה. אנא נסה שוב מאוחר יותר.',
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
      supabase_project_url: payload.supabase_project_url ?? null,
      supabase_anon_public: payload.supabase_anon_public ?? null,
      last_synced_at: payload.last_synced_at ?? null,
      metadata: normaliseMetadata(payload.metadata)
    }
  })

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
      }
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

export const initializeSetupForOrganization = async (
  orgId: string
): Promise<{ initialized: boolean; message?: string }> =>
  withClient(async (client) => {
    try {
      const { data, error } = await client.rpc('setup_assistant_initialize', {
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
            'פונקציית setup_assistant_initialize אינה זמינה ב-Supabase. אנא פרוס את הפונקציה ונסה שוב.',
          cause: error
        } satisfies SetupWizardError
      }

      throw {
        message: 'התחברות ל-Supabase נכשלה. אנא בדוק את ההרשאות ונסה שוב.',
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
            'פונקציית setup_assistant_schema_status אינה זמינה. יש לפרוס אותה או לעדכן את סביבת Supabase.',
          cause: error
        } satisfies SetupWizardError
      }

      throw {
        message: 'בדיקת סכימת tuttiud נכשלה.',
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
            'פונקציית setup_assistant_run_bootstrap אינה זמינה. אנא פרוס את סקריפט ההקמה ונסה שוב.',
          cause: error
        } satisfies SetupWizardError
      }

      throw {
        message: 'יצירת סכימת tuttiud נכשלה.',
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
      if (!raw) {
        return {
          status: 'ok',
          summary: 'האבחון הסתיים ללא הערות.',
          issues: [],
          sqlSnippets: [],
          raw
        }
      }

      const status =
        typeof raw.status === 'string' && ['ok', 'warning', 'error'].includes(raw.status)
          ? (raw.status as SetupDiagnostics['status'])
          : 'warning'

      const summary =
        typeof raw.summary === 'string'
          ? raw.summary
          : status === 'ok'
          ? 'הכל תקין. ניתן להמשיך.'
          : 'זוהו פריטים המצריכים תשומת לב.'

      const issues: DiagnosticsIssue[] = [
        ...mapDiagnosticsIssues(raw.missing_tables, 'table'),
        ...mapDiagnosticsIssues(raw.missing_policies, 'policy'),
        ...mapDiagnosticsIssues(raw.permission_issues, 'permission'),
        ...mapDiagnosticsIssues(raw.other_issues, 'other')
      ]

      const sqlSnippets = normaliseSqlSnippets(raw.suggested_sql ?? raw.sql)

      return {
        status,
        summary,
        issues,
        sqlSnippets,
        raw
      }
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
