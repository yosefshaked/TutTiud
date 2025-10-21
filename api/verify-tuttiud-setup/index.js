/* eslint-env node */
const { loadTenantContext } = require('../_shared/tenant-context')
const { sendJson } = require('../_shared/utils')

module.exports = async function (context, req) {
  if (req.method !== 'POST') {
    sendJson(context, 405, {
      success: false,
      message: 'Method not allowed'
    })
    return
  }

  const orgId = typeof req.body?.orgId === 'string' ? req.body.orgId.trim() : ''

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

    context.log('verify-tuttiud-setup: unexpected tenant context error', error)
    sendJson(context, 500, {
      success: false,
      message: 'לא ניתן היה לאמת את הרשאות הארגון. נסו שוב מאוחר יותר.'
    })
    return
  }

  const { tenantClient } = tenantContext

  try {
    const { data, error } = await tenantClient
      .schema('tuttiud')
      .rpc('setup_assistant_diagnostics')

    if (error) {
      throw error
    }

    sendJson(context, 200, {
      success: true,
      diagnostics: data ?? null
    })
  } catch (error) {
    context.log('verify-tuttiud-setup: diagnostics failed', error)
    sendJson(context, 400, {
      success: false,
      message:
        'האימות נכשל. ודאו שסקריפט ההתקנה הופעל בהצלחה ושהמפתח השמור עדיין תקף.',
      details: error?.message ?? error
    })
  }
}
