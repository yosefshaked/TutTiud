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
    tenantContext = await loadTenantContext(req, { orgId, requireRole: 'member' })
  } catch (error) {
    if (error?.status) {
      sendJson(context, error.status, {
        success: false,
        message: error.message
      })
      return
    }

    context.log('students: unexpected tenant context error', error)
    sendJson(context, 500, {
      success: false,
      message: 'לא ניתן היה לטעון את פרטי הארגון. נסו שוב או פנו לתמיכה.'
    })
    return
  }

  const { tenantClient, user } = tenantContext

  const { data, error } = await tenantClient
    .schema('tuttiud')
    .from('Students')
    .select('id, name, contact_info, assigned_instructor_id, notes, metadata')
    .eq('assigned_instructor_id', user.id)
    .order('name', { ascending: true })

  if (error) {
    context.log('students: failed to fetch students', error)
    sendJson(context, 500, {
      success: false,
      message: 'טעינת רשימת התלמידים נכשלה. נסו שוב מאוחר יותר.'
    })
    return
  }

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
