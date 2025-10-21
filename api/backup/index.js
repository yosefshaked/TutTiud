/* eslint-env node */
const { loadTenantContext } = require('../_shared/tenant-context')
const { sendJson, logEnvironmentStatuses } = require('../_shared/utils')

module.exports = async function (context, req) {
  console.log('[backup] Function triggered', {
    method: req.method,
    orgId: typeof req.query?.orgId === 'string' ? req.query.orgId : req.query?.orgId ?? null
  })

  if (req.method !== 'GET') {
    sendJson(context, 405, {
      success: false,
      message: 'Method not allowed'
    })
    return
  }

  logEnvironmentStatuses('backup', [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'APP_ORG_CREDENTIALS_ENCRYPTION_KEY'
  ])

  const orgId = typeof req.query?.orgId === 'string' ? req.query.orgId.trim() : ''

  console.log('[backup] Normalised orgId', orgId)

  let tenantContext
  try {
    console.log('[backup] Loading tenant context')
    tenantContext = await loadTenantContext(req, { orgId, requireRole: 'admin' })
  } catch (error) {
    console.error('Caught error:', error)
    console.error('[backup] Tenant context error', error)
    if (error?.status) {
      sendJson(context, error.status, {
        success: false,
        message: error.message
      })
      return
    }

    sendJson(context, 500, {
      success: false,
      message: 'לא ניתן היה לאמת את ההרשאות לביצוע הגיבוי. נסו שוב מאוחר יותר.'
    })
    return
  }

  const { tenantClient } = tenantContext

  console.log('[backup] Fetching data for backup payload')
  const [studentsResult, instructorsResult, sessionsResult] = await Promise.all([
    tenantClient
      .schema('tuttiud')
      .from('Students')
      .select('*'),
    tenantClient
      .schema('tuttiud')
      .from('Instructors')
      .select('*'),
    tenantClient
      .schema('tuttiud')
      .from('SessionRecords')
      .select('*')
  ])

  if (studentsResult.error || instructorsResult.error || sessionsResult.error) {
    console.error('[backup] Failed to collect backup data', {
      studentsError: studentsResult.error,
      instructorsError: instructorsResult.error,
      sessionsError: sessionsResult.error
    })
    sendJson(context, 500, {
      success: false,
      message: 'איסוף המידע לגיבוי נכשל. נסו שוב מאוחר יותר או פנו לתמיכה.'
    })
    return
  }

  console.log('[backup] Backup payload prepared successfully', {
    students: studentsResult.data?.length ?? 0,
    instructors: instructorsResult.data?.length ?? 0,
    sessionRecords: sessionsResult.data?.length ?? 0
  })
  sendJson(context, 200, {
    success: true,
    backup: {
      generatedAt: new Date().toISOString(),
      students: studentsResult.data ?? [],
      instructors: instructorsResult.data ?? [],
      sessionRecords: sessionsResult.data ?? []
    }
  })
}
