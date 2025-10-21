/* eslint-env node */
const { loadTenantContext } = require('../_shared/tenant-context')
const { sendJson, logEnvironmentStatuses } = require('../_shared/utils')

module.exports = async function (context, req) {
  console.log('[verify-tuttiud-setup] Function triggered', {
    method: req.method,
    hasBody: Boolean(req.body)
  })

  if (req.method !== 'POST') {
    sendJson(context, 405, {
      success: false,
      message: 'Method not allowed'
    })
    return
  }

  logEnvironmentStatuses('verify-tuttiud-setup', [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'APP_ORG_CREDENTIALS_ENCRYPTION_KEY'
  ])

  const orgId = typeof req.body?.orgId === 'string' ? req.body.orgId.trim() : ''

  console.log('[verify-tuttiud-setup] Normalised orgId', orgId)

  let tenantContext
  try {
    console.log('[verify-tuttiud-setup] Loading tenant context')
    tenantContext = await loadTenantContext(req, { orgId, requireRole: 'admin' })
  } catch (error) {
    console.error('Caught error:', error)
    console.error('[verify-tuttiud-setup] Tenant context error', error)
    if (error?.status) {
      sendJson(context, error.status, {
        success: false,
        message: error.message
      })
      return
    }

    sendJson(context, 500, {
      success: false,
      message: 'לא ניתן היה לאמת את הרשאות הארגון. נסו שוב מאוחר יותר.'
    })
    return
  }

  const { tenantClient } = tenantContext

  try {
    console.log('[verify-tuttiud-setup] Running tuttiud.setup_assistant_diagnostics')
    const { data, error } = await tenantClient
      .schema('tuttiud')
      .rpc('setup_assistant_diagnostics')

    if (error) {
      throw error
    }

    console.log('[verify-tuttiud-setup] Diagnostics completed successfully')
    sendJson(context, 200, {
      success: true,
      diagnostics: data ?? null
    })
  } catch (error) {
    console.error('Caught error:', error)
    console.error('[verify-tuttiud-setup] Diagnostics failed', error)
    sendJson(context, 400, {
      success: false,
      message:
        'האימות נכשל. ודאו שסקריפט ההתקנה הופעל בהצלחה ושהמפתח השמור עדיין תקף.',
      details: error?.message ?? error
    })
  }
}
