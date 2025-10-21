/* eslint-env node */
const { loadTenantContext } = require('../_shared/tenant-context')
const { sendJson, logEnvironmentStatuses } = require('../_shared/utils')

module.exports = async function (context, req) {
  console.log('[students] Function triggered', {
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

  logEnvironmentStatuses('students', [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'APP_ORG_CREDENTIALS_ENCRYPTION_KEY'
  ])

  const orgId = typeof req.query?.orgId === 'string' ? req.query.orgId.trim() : ''

  console.log('[students] Normalised orgId', orgId)

  let tenantContext
  try {
    console.log('[students] Loading tenant context')
    tenantContext = await loadTenantContext(req, { orgId, requireRole: 'member' })
  } catch (error) {
    console.error('Caught error:', error)
    console.error('[students] Tenant context error', error)
    if (error?.status) {
      sendJson(context, error.status, {
        success: false,
        message: error.message
      })
      return
    }

    sendJson(context, 500, {
      success: false,
      message: 'לא ניתן היה לטעון את פרטי הארגון. נסו שוב או פנו לתמיכה.'
    })
    return
  }

  const { tenantClient, user } = tenantContext

  console.log('[students] Fetching assigned students for instructor', user.id)
  const { data, error } = await tenantClient
    .schema('tuttiud')
    .from('Students')
    .select('id, name, contact_info, assigned_instructor_id, notes, metadata')
    .eq('assigned_instructor_id', user.id)
    .order('name', { ascending: true })

  if (error) {
    console.error('[students] Failed to fetch students', error)
    sendJson(context, 500, {
      success: false,
      message: 'טעינת רשימת התלמידים נכשלה. נסו שוב מאוחר יותר.'
    })
    return
  }

  console.log('[students] Returning student list', { count: Array.isArray(data) ? data.length : 0 })
  const students = (data ?? []).map((student) => ({
    id: student.id,
    name: student.name,
    contactInfo: student.contact_info ?? null,
    assignedInstructorId: student.assigned_instructor_id ?? null,
    notes: student.notes ?? null,
    metadata: student.metadata ?? null
  }))

  sendJson(context, 200, {
    success: true,
    students
  })
}
