/* eslint-env node */
const { createClient } = require('@supabase/supabase-js')

const { encryptValue } = require('../_shared/encryption')
const { loadControlContext } = require('../_shared/tenant-context')
const { isRecord, sendJson, logEnvironmentStatuses } = require('../_shared/utils')

const buildStoredMetadata = (currentMetadata) => {
  const base = isRecord(currentMetadata) ? { ...currentMetadata } : {}
  const connections = isRecord(base.connections) ? { ...base.connections } : {}
  const credentials = isRecord(base.credentials) ? { ...base.credentials } : {}

  return {
    ...base,
    connections,
    credentials: {
      ...credentials,
      tuttiudAppJwt: 'stored'
    }
  }
}

module.exports = async function (context, req) {
  console.log('[store-tuttiud-app-key] Function triggered', {
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

  logEnvironmentStatuses('store-tuttiud-app-key', [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'APP_ORG_CREDENTIALS_ENCRYPTION_KEY'
  ])

  console.log('[store-tuttiud-app-key] Validating infrastructure environment variables')
  const missingInfrastructureVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    .filter((name) => !process.env[name])

  if (missingInfrastructureVars.length > 0) {
    console.error(
      '[store-tuttiud-app-key] Missing infrastructure configuration',
      missingInfrastructureVars
    )
    sendJson(context, 500, {
      success: false,
      message: `הגדרת השרת חסרה (Missing env: ${missingInfrastructureVars.join(', ')}). פנו לתמיכה לקבלת סיוע.`
    })
    return
  }

  const encryptionSecret = process.env.APP_ORG_CREDENTIALS_ENCRYPTION_KEY

  if (!encryptionSecret) {
    console.error(
      '[store-tuttiud-app-key] Missing encryption configuration',
      { missing: 'APP_ORG_CREDENTIALS_ENCRYPTION_KEY' }
    )
    sendJson(context, 500, {
      success: false,
      message:
        'הגדרת השרת חסרה (Missing env: APP_ORG_CREDENTIALS_ENCRYPTION_KEY). פנו לתמיכה לקבלת סיוע.'
    })
    return
  }

  const orgId = typeof req.body?.orgId === 'string' ? req.body.orgId.trim() : ''
  const appKey = typeof req.body?.appKey === 'string' ? req.body.appKey.trim() : ''
  const tenantSupabaseUrl =
    typeof req.body?.supabaseUrl === 'string' ? req.body.supabaseUrl.trim() : ''
  const currentMetadata = req.body?.currentMetadata ?? null

  console.log('[store-tuttiud-app-key] Incoming payload normalised', {
    orgId,
    hasAppKey: Boolean(appKey),
    hasSupabaseUrl: Boolean(tenantSupabaseUrl)
  })

  if (!orgId || !appKey || !tenantSupabaseUrl) {
    sendJson(context, 400, {
      success: false,
      message: 'חלק מהפרטים חסרים. ודאו שמזהה הארגון, כתובת Supabase והמפתח הוזנו כראוי ונסו שוב.'
    })
    return
  }

  let controlContext
  try {
    console.log('[store-tuttiud-app-key] Loading control context for org', orgId)
    controlContext = await loadControlContext(req, { orgId, requireRole: 'admin' })
  } catch (error) {
    console.error('Caught error:', error)
    console.error('[store-tuttiud-app-key] Control context error', error)
    if (error?.status) {
      sendJson(context, error.status, {
        success: false,
        message: error.message
      })
      return
    }

    sendJson(context, 500, {
      success: false,
      message: 'לא ניתן היה לאמת את ההרשאות לפעולה זו. פנו לתמיכה לקבלת סיוע.'
    })
    return
  }

  const { adminClient } = controlContext

  let encryptedPayload
  try {
    console.log('[store-tuttiud-app-key] Encrypting TutTiud app key')
    encryptedPayload = encryptValue(appKey, encryptionSecret)
  } catch (error) {
    console.error('Caught error:', error)
    console.error('[store-tuttiud-app-key] Encryption failed', error)
    sendJson(context, 500, {
      success: false,
      message: 'הצפנת המפתח נכשלה. פנו לתמיכה לקבלת סיוע.'
    })
    return
  }

  console.log('[store-tuttiud-app-key] Reading existing organization record')
  const { data: existingOrg, error: readOrgError } = await adminClient
    .from('organizations')
    .select('dedicated_key_encrypted')
    .eq('id', orgId)
    .maybeSingle()

  if (readOrgError) {
    console.error('[store-tuttiud-app-key] Failed reading organization', readOrgError)
    sendJson(context, 500, {
      success: false,
      message: 'קריאת פרטי הארגון נכשלה. נסו שוב בעוד מספר רגעים או פנו לתמיכה.'
    })
    return
  }

  if (!existingOrg) {
    console.error('[store-tuttiud-app-key] Organization not found', orgId)
    sendJson(context, 404, {
      success: false,
      message: 'הארגון לא נמצא. בדקו שבחרתם את הארגון הנכון ונסו שוב.'
    })
    return
  }

  console.log('[store-tuttiud-app-key] Storing encrypted key for organization')
  const { error: storeKeyError } = await adminClient
    .from('organizations')
    .update({ dedicated_key_encrypted: encryptedPayload })
    .eq('id', orgId)

  if (storeKeyError) {
    console.error('[store-tuttiud-app-key] Failed storing encrypted key', storeKeyError)
    sendJson(context, 500, {
      success: false,
      message: 'שמירת מפתח היישום נכשלה. נסו שוב מאוחר יותר או פנו לתמיכה.'
    })
    return
  }

  let diagnostics

  try {
    console.log('[store-tuttiud-app-key] Creating tenant client for diagnostics')
    const tenantClient = createClient(tenantSupabaseUrl, appKey, {
      auth: { persistSession: false }
    })

    console.log('[store-tuttiud-app-key] Running tuttiud.setup_assistant_diagnostics')
    const { data, error: diagnosticsError } = await tenantClient
      .schema('tuttiud')
      .rpc('setup_assistant_diagnostics')

    if (diagnosticsError) {
      throw diagnosticsError
    }

    diagnostics = data ?? null
  } catch (error) {
    console.error('Caught error:', error)
    console.error('[store-tuttiud-app-key] Diagnostics failed', error)

    const { error: revertError } = await adminClient
      .from('organizations')
      .update({ dedicated_key_encrypted: existingOrg.dedicated_key_encrypted ?? null })
      .eq('id', orgId)

    if (revertError) {
      console.error(
        '[store-tuttiud-app-key] Failed reverting encrypted key after diagnostics error',
        revertError
      )
    }

    sendJson(context, 400, {
      success: false,
      message:
        'לא ניתן היה לאמת את מפתח היישום מול מסד הנתונים. בדקו שהסקריפט הופעל בהצלחה ושהמפתח מעודכן.',
      details: error?.message ?? error
    })
    return
  }

  const nextMetadata = buildStoredMetadata(currentMetadata)

  console.log('[store-tuttiud-app-key] Updating org_settings metadata with stored key flag')
  const { error: metadataError } = await adminClient
    .from('org_settings')
    .update({ metadata: nextMetadata })
    .eq('org_id', orgId)

  if (metadataError) {
    console.error('[store-tuttiud-app-key] Failed updating metadata', metadataError)
    sendJson(context, 500, {
      success: false,
      message:
        'המפתח אומת אך עדכון המטא־נתונים נכשל. נסו שוב או פנו לתמיכה עם שעת התקלה.'
    })
    return
  }

  console.log('[store-tuttiud-app-key] Successfully stored TutTiud app key')
  sendJson(context, 200, {
    success: true,
    metadata: nextMetadata,
    diagnostics
  })
}
