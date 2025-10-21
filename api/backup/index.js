/* eslint-env node */
const { loadTenantContext } = require('../_shared/tenant-context')
const { sendJson } = require('../_shared/utils')

module.exports = async function (context, req) {
  if (req.method !== 'GET') {
    sendJson(context, 405, {
      success: false,
      message: 'Method not allowed'
    })
    return
  }

  const orgId = typeof req.query?.orgId === 'string' ? req.query.orgId.trim() : ''

  let tenantContext
  try {
    tenantContext = await loadTenantContext(req, { orgId, requireRole: 'admin' })
  } catch (error) {
    if (error?.status) {
      sendJson(context, error.status, {
        success: false,
        message: error.message
      })
      return
    }

    context.log('backup: unexpected tenant context error', error)
    sendJson(context, 500, {
      success: false,
      message: 'לא ניתן היה לאמת את ההרשאות לביצוע הגיבוי. נסו שוב מאוחר יותר.'
    })
    return
  }

  const { tenantClient } = tenantContext

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
    context.log('backup: failed to collect data', {
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
