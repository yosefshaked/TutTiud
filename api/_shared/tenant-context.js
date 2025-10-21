const { createClient } = require('@supabase/supabase-js')

const { decryptValue } = require('./encryption')
const { createAdminClient } = require('./supabase')
const { createHttpError } = require('./utils')

const ROLE_HIERARCHY = {
  member: 0,
  admin: 1,
  owner: 2
}

const normaliseRole = (role) => {
  if (!role) return 'member'
  const lower = String(role).toLowerCase()
  return lower === 'owner' || lower === 'admin' ? lower : 'member'
}

const getBearerToken = (req) => {
  const header = req.headers?.authorization || req.headers?.Authorization
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1].trim() : null
}

const ensureRole = (currentRole, required) => {
  const currentRank = ROLE_HIERARCHY[normaliseRole(currentRole)] ?? 0
  const requiredRank = ROLE_HIERARCHY[required] ?? 0
  return currentRank >= requiredRank
}

const loadControlContext = async (req, { orgId, requireRole = 'member' }) => {
  if (!orgId) {
    throw createHttpError(400, 'מזהה הארגון חסר. רעננו את העמוד ונסו שוב.')
  }

  let adminClient
  try {
    adminClient = createAdminClient()
  } catch (error) {
    throw createHttpError(500, 'הגדרת השרת אינה מלאה. פנו לתמיכה לקבלת סיוע.', error?.message)
  }

  const token = getBearerToken(req)
  if (!token) {
    throw createHttpError(401, 'פג תוקף ההתחברות. התחברו מחדש ונסו שוב.')
  }

  const { data: authData, error: authError } = await adminClient.auth.getUser(token)
  if (authError || !authData?.user) {
    throw createHttpError(401, 'לא הצלחנו לאמת את זהות המשתמש. התחברו מחדש ונסו שוב.', authError)
  }

  const user = authData.user

  const { data: membership, error: membershipError } = await adminClient
    .from('org_memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError) {
    throw createHttpError(500, 'בדיקת ההרשאות נכשלה. נסו שוב מאוחר יותר או פנו לתמיכה.', membershipError)
  }

  if (!membership) {
    throw createHttpError(403, 'אין לכם הרשאה לפעול בארגון זה. פנו למנהל המערכת לקבלת גישה.')
  }

  const role = normaliseRole(membership.role)

  if (!ensureRole(role, requireRole)) {
    throw createHttpError(403, 'פעולה זו זמינה רק למנהלים או לבעלי המערכת בארגון.')
  }

  return { adminClient, user, role }
}

const loadTenantContext = async (req, { orgId, requireRole = 'member' }) => {
  const encryptionSecret = process.env.APP_ORG_CREDENTIALS_ENCRYPTION_KEY

  if (!encryptionSecret) {
    throw createHttpError(500, 'הגדרת ההצפנה בשרת חסרה. פנו לתמיכה לקבלת סיוע.')
  }

  const { adminClient, user, role } = await loadControlContext(req, { orgId, requireRole })

  const { data: settings, error: settingsError } = await adminClient
    .from('org_settings')
    .select('supabase_url')
    .eq('org_id', orgId)
    .maybeSingle()

  if (settingsError) {
    throw createHttpError(500, 'טעינת הגדרות הארגון נכשלה. נסו שוב מאוחר יותר.', settingsError)
  }

  if (!settings?.supabase_url) {
    throw createHttpError(409, 'כתובת Supabase של הארגון חסרה. השלימו את אשף ההקמה ונסו שוב.')
  }

  const { data: organization, error: organizationError } = await adminClient
    .from('organizations')
    .select('dedicated_key_encrypted')
    .eq('id', orgId)
    .maybeSingle()

  if (organizationError) {
    throw createHttpError(500, 'טעינת מפתח היישום נכשלה. נסו שוב מאוחר יותר.', organizationError)
  }

  if (!organization?.dedicated_key_encrypted) {
    throw createHttpError(
      409,
      'מפתח היישום של TutTiud אינו שמור. השלימו את תהליך ההגדרה באשף ולאחר מכן נסו שוב.'
    )
  }

  let decryptedKey
  try {
    decryptedKey = decryptValue(organization.dedicated_key_encrypted, encryptionSecret)
  } catch (error) {
    throw createHttpError(500, 'פענוח מפתח היישום נכשל. פנו לתמיכה עם פרטי התקלה.', error?.message)
  }

  const tenantClient = createClient(settings.supabase_url, decryptedKey, {
    auth: { persistSession: false }
  })

  return {
    adminClient,
    tenantClient,
    user,
    role,
    supabaseUrl: settings.supabase_url
  }
}

module.exports = {
  loadControlContext,
  loadTenantContext
}
