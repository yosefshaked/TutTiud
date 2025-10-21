/* eslint-env node */
const { createClient } = require('@supabase/supabase-js')

const { encryptValue } = require('../_shared/encryption')
const { loadControlContext } = require('../_shared/tenant-context')
const { isRecord, sendJson } = require('../_shared/utils')

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
  if (req.method !== 'POST') {
    sendJson(context, 405, {
      success: false,
      message: 'Method not allowed'
    })
    return
  }

  const encryptionSecret = process.env.APP_ORG_CREDENTIALS_ENCRYPTION_KEY

  if (!encryptionSecret) {
    context.log('store-tuttiud-app-key: missing encryption configuration')
    sendJson(context, 500, {
      success: false,
      message: 'הגדרת השרת אינה מלאה. פנו לתמיכה לקבלת סיוע.'
    })
    return
  }

  const orgId = typeof req.body?.orgId === 'string' ? req.body.orgId.trim() : ''
  const appKey = typeof req.body?.appKey === 'string' ? req.body.appKey.trim() : ''
  const tenantSupabaseUrl =
    typeof req.body?.supabaseUrl === 'string' ? req.body.supabaseUrl.trim() : ''
  const currentMetadata = req.body?.currentMetadata ?? null

  if (!orgId || !appKey || !tenantSupabaseUrl) {
    sendJson(context, 400, {
      success: false,
      message: 'חלק מהפרטים חסרים. ודאו שמזהה הארגון, כתובת Supabase והמפתח הוזנו כראוי ונסו שוב.'
    })
    return
  }

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

    context.log('store-tuttiud-app-key: unexpected authentication error', error)
    sendJson(context, 500, {
      success: false,
      message: 'לא ניתן היה לאמת את ההרשאות לפעולה זו. פנו לתמיכה לקבלת סיוע.'
    })
    return
  }

  const { adminClient } = controlContext

  let encryptedPayload
  try {
    encryptedPayload = encryptValue(appKey, encryptionSecret)
  } catch (error) {
    context.log('store-tuttiud-app-key: encryption failed', error)
    sendJson(context, 500, {
      success: false,
      message: 'הצפנת המפתח נכשלה. פנו לתמיכה לקבלת סיוע.'
    })
    return
  }

  const { data: existingOrg, error: readOrgError } = await adminClient
    .from('organizations')
    .select('dedicated_key_encrypted')
    .eq('id', orgId)
    .maybeSingle()

  if (readOrgError) {
    context.log('store-tuttiud-app-key: failed reading organization', readOrgError)
    sendJson(context, 500, {
      success: false,
      message: 'קריאת פרטי הארגון נכשלה. נסו שוב בעוד מספר רגעים או פנו לתמיכה.'
    })
    return
  }

  if (!existingOrg) {
    sendJson(context, 404, {
      success: false,
      message: 'הארגון לא נמצא. בדקו שבחרתם את הארגון הנכון ונסו שוב.'
    })
    return
  }

  const { error: storeKeyError } = await adminClient
    .from('organizations')
    .update({ dedicated_key_encrypted: encryptedPayload })
    .eq('id', orgId)

  if (storeKeyError) {
    context.log('store-tuttiud-app-key: failed storing encrypted key', storeKeyError)
    sendJson(context, 500, {
      success: false,
      message: 'שמירת מפתח היישום נכשלה. נסו שוב מאוחר יותר או פנו לתמיכה.'
    })
    return
  }

  let diagnostics

  try {
    const tenantClient = createClient(tenantSupabaseUrl, appKey, {
      auth: { persistSession: false }
    })

    const { data, error: diagnosticsError } = await tenantClient
      .schema('tuttiud')
      .rpc('setup_assistant_diagnostics')

    if (diagnosticsError) {
      throw diagnosticsError
    }

    diagnostics = data ?? null
  } catch (error) {
    context.log('store-tuttiud-app-key: diagnostics failed', error)

    const { error: revertError } = await adminClient
      .from('organizations')
      .update({ dedicated_key_encrypted: existingOrg.dedicated_key_encrypted ?? null })
      .eq('id', orgId)

    if (revertError) {
      context.log('store-tuttiud-app-key: failed reverting encrypted key after diagnostics error', revertError)
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

  const { error: metadataError } = await adminClient
    .from('org_settings')
    .update({ metadata: nextMetadata })
    .eq('org_id', orgId)

  if (metadataError) {
    context.log('store-tuttiud-app-key: failed updating metadata', metadataError)
    sendJson(context, 500, {
      success: false,
      message:
        'המפתח אומת אך עדכון המטא־נתונים נכשל. נסו שוב או פנו לתמיכה עם שעת התקלה.'
    })
    return
  }

  sendJson(context, 200, {
    success: true,
    metadata: nextMetadata,
    diagnostics
  })
}
