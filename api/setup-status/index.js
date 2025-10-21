/* eslint-env node */
const { loadControlContext } = require('../_shared/tenant-context')
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

  let controlContext
  try {
    controlContext = await loadControlContext(req, { orgId, requireRole: 'admin' })
  } catch (error) {
    if (error?.status) {
      sendJson(context, error.status, {
        success: false,
        message: error.message
      })
      return
    }

    context.log('setup-status: unexpected control context error', error)
    sendJson(context, 500, {
      success: false,
      message: 'לא ניתן היה לוודא את סטטוס הארגון. נסו שוב או פנו לתמיכה.'
    })
    return
  }

  const { adminClient } = controlContext

  const { data: organization, error: organizationError } = await adminClient
    .from('organizations')
    .select('dedicated_key_encrypted')
    .eq('id', orgId)
    .maybeSingle()

  if (organizationError) {
    context.log('setup-status: failed reading organization record', organizationError)
    sendJson(context, 500, {
      success: false,
      message: 'טעינת פרטי הארגון נכשלה. נסו שוב מאוחר יותר או פנו לתמיכה.'
    })
    return
  }

  if (!organization) {
    sendJson(context, 404, {
      success: false,
      message: 'הארגון לא נמצא. ודאו שבחרתם את הארגון הנכון ונסו שוב.'
    })
    return
  }

  sendJson(context, 200, {
    success: true,
    hasDedicatedKey: Boolean(organization.dedicated_key_encrypted)
  })
}
