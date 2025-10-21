/* eslint-env node */
const nodeCrypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const deriveEncryptionKey = (secret) => {
  if (!secret) {
    throw new Error('Missing encryption secret')
  }

  try {
    const decoded = Buffer.from(secret, 'base64')
    if (decoded.length === 32) {
      return decoded
    }
  } catch {
    // Ignore and fall back to hash derivation
  }

  return nodeCrypto.createHash('sha256').update(secret).digest()
}

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

const respond = (context, status, body) => {
  context.res = {
    status,
    headers: {
      'Content-Type': 'application/json'
    },
    body
  }
}

module.exports = async function (context, req) {
  if (req.method !== 'POST') {
    respond(context, 405, {
      success: false,
      message: 'Method not allowed'
    })
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const encryptionSecret = process.env.APP_ORG_CREDENTIALS_ENCRYPTION_KEY

  if (!supabaseUrl || !serviceRoleKey || !encryptionSecret) {
    context.log('store-tuttiud-app-key: missing environment configuration')
    respond(context, 500, {
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
    respond(context, 400, {
      success: false,
      message: 'חלק מהפרטים חסרים. ודאו שמזהה הארגון, כתובת Supabase והמפתח הוזנו כראוי ונסו שוב.'
    })
    return
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  })

  const encryptionKey = deriveEncryptionKey(encryptionSecret)
  const iv = nodeCrypto.randomBytes(12)
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', encryptionKey, iv)
  const encrypted = Buffer.concat([cipher.update(appKey, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const encryptedPayload = Buffer.concat([iv, authTag, encrypted]).toString('base64')

  const { data: existingOrg, error: readOrgError } = await adminClient
    .from('organizations')
    .select('dedicated_key_encrypted')
    .eq('id', orgId)
    .maybeSingle()

  if (readOrgError) {
    context.log('store-tuttiud-app-key: failed reading organization', readOrgError)
    respond(context, 500, {
      success: false,
      message: 'קריאת פרטי הארגון נכשלה. נסו שוב בעוד מספר רגעים או פנו לתמיכה.'
    })
    return
  }

  if (!existingOrg) {
    respond(context, 404, {
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
    respond(context, 500, {
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

    respond(context, 400, {
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
    respond(context, 500, {
      success: false,
      message:
        'המפתח אומת אך עדכון המטא־נתונים נכשל. נסו שוב או פנו לתמיכה עם שעת התקלה.'
    })
    return
  }

  respond(context, 200, {
    success: true,
    metadata: nextMetadata,
    diagnostics
  })
}
