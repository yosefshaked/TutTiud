/* eslint-env node */
const { loadControlContext } = require('../_shared/tenant-context')
const { sendJson, logEnvironmentStatuses } = require('../_shared/utils')

module.exports = async function (context, req) {
  console.log('[setup-status] Function triggered', {
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

  logEnvironmentStatuses('setup-status', [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'APP_ORG_CREDENTIALS_ENCRYPTION_KEY'
  ])

  const orgId = typeof req.query?.orgId === 'string' ? req.query.orgId.trim() : ''

  console.log('[setup-status] Normalised orgId', orgId)

  console.log('[setup-status] Loading control context')

  let controlContext
  try {
    controlContext = await loadControlContext(req, { orgId, requireRole: 'admin' })
  } catch (error) {
    console.error('Caught error:', error)
    console.error('[setup-status] Control context failed', error)
    if (error?.status) {
      sendJson(context, error.status, {
        success: false,
        message: error.message
      })
      return
    }

    sendJson(context, 500, {
      success: false,
      message: 'לא ניתן היה לוודא את סטטוס הארגון. נסו שוב או פנו לתמיכה.'
    })
    return
  }

  const { adminClient } = controlContext

  console.log('[setup-status] Querying organization record')
  const { data: organization, error: organizationError } = await adminClient
    .from('organizations')
    .select('dedicated_key_encrypted')
    .eq('id', orgId)
    .maybeSingle()

  if (organizationError) {
    console.error('[setup-status] Organization query failed', organizationError)
    sendJson(context, 500, {
      success: false,
      message: 'טעינת פרטי הארגון נכשלה. נסו שוב מאוחר יותר או פנו לתמיכה.'
    })
    return
  }

  if (!organization) {
    console.error('[setup-status] Organization not found for orgId', orgId)
    sendJson(context, 404, {
      success: false,
      message: 'הארגון לא נמצא. ודאו שבחרתם את הארגון הנכון ונסו שוב.'
    })
    return
  }

  console.log('[setup-status] Returning organization status', {
    hasDedicatedKey: Boolean(organization.dedicated_key_encrypted)
  })

  sendJson(context, 200, {
    success: true,
    hasDedicatedKey: Boolean(organization.dedicated_key_encrypted)
  })
}
