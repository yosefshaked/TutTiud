const { createClient } = require('@supabase/supabase-js')

const getSupabaseAdminConfig = () => {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service configuration is incomplete')
  }

  return { supabaseUrl, serviceRoleKey }
}

const createAdminClient = () => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseAdminConfig()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  })
}

module.exports = {
  getSupabaseAdminConfig,
  createAdminClient
}
