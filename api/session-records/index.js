/* eslint-env node */
const { loadTenantContext } = require('../_shared/tenant-context')
const { sendJson } = require('../_shared/utils')

const normaliseString = (value) => (typeof value === 'string' ? value.trim() : '')

module.exports = async function (context, req) {
  if (req.method !== 'POST') {
    sendJson(context, 405, {
      success: false,
      message: 'Method not allowed'
    })
    return
  }

  const orgId = normaliseString(req.body?.orgId)
  const studentId = normaliseString(req.body?.studentId)
  const sessionDate = normaliseString(req.body?.date)
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
  const serviceContext =
    typeof req.body?.serviceContext === 'string' ? req.body.serviceContext.trim() : ''

  if (!studentId || !sessionDate) {
    sendJson(context, 400, {
      success: false,
      message: 'נדרש לבחור תלמיד ולהזין תאריך תקין לפני יצירת התיעוד.'
    })
    return
  }

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

    context.log('session-records: unexpected tenant context error', error)
    sendJson(context, 500, {
      success: false,
      message: 'לא ניתן היה לאמת את ההרשאות לפעולה זו. נסו שוב או פנו לתמיכה.'
    })
    return
  }

  const { tenantClient, user } = tenantContext

  const { data: student, error: studentError } = await tenantClient
    .schema('tuttiud')
    .from('Students')
    .select('id, assigned_instructor_id, name')
    .eq('id', studentId)
    .maybeSingle()

  if (studentError) {
    context.log('session-records: failed to load student', studentError)
    sendJson(context, 500, {
      success: false,
      message: 'טעינת פרטי התלמיד נכשלה. נסו שוב מאוחר יותר.'
    })
    return
  }

  if (!student) {
    sendJson(context, 404, {
      success: false,
      message: 'התלמיד שנבחר לא נמצא במסד הנתונים.'
    })
    return
  }

  if ((student.assigned_instructor_id ?? null) !== user.id) {
    sendJson(context, 403, {
      success: false,
      message: 'אינכם משויכים לתלמיד זה ולכן לא ניתן לתעד עבורו מפגש.'
    })
    return
  }

  const { data: inserted, error: insertError } = await tenantClient
    .schema('tuttiud')
    .from('SessionRecords')
    .insert({
      student_id: studentId,
      instructor_id: user.id,
      date: sessionDate,
      content: content || null,
      service_context: serviceContext || null
    })
    .select('id, date, student_id, instructor_id, service_context, content, created_at, updated_at, metadata')
    .maybeSingle()

  if (insertError) {
    context.log('session-records: insert failed', insertError)
    sendJson(context, 500, {
      success: false,
      message: 'שמירת התיעוד נכשלה. נסו שוב מאוחר יותר.'
    })
    return
  }

  sendJson(context, 200, {
    success: true,
    record: inserted
      ? {
          id: inserted.id,
          date: inserted.date,
          studentId: inserted.student_id,
          instructorId: inserted.instructor_id,
          serviceContext: inserted.service_context ?? null,
          content: inserted.content ?? null,
          createdAt: inserted.created_at ?? null,
          updatedAt: inserted.updated_at ?? null,
          metadata: inserted.metadata ?? null,
          studentName: student.name
        }
      : null
  })
}
