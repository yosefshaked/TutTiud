import { getAuthClient } from '@/lib/supabase-manager.js';
import { asError } from '@/lib/error-utils.js';

export async function createOrganization(orgName) {
  const trimmedName = typeof orgName === 'string' ? orgName.trim() : '';
  if (!trimmedName) {
    throw new Error('יש להזין שם ארגון.');
  }

  let client;
  try {
    client = getAuthClient();
  } catch (error) {
    const normalizedError = asError(error);
    console.error('[Organizations API] Auth client unavailable while creating organization.', normalizedError);
    throw new Error('לקוח Supabase טרם אותחל. רענן את הדף ונסה שוב ליצור ארגון.');
  }
  const { data, error } = await client.rpc('create_organization', { p_name: trimmedName });
  if (error) {
    throw error;
  }

  if (typeof data === 'string') {
    return data;
  }

  if (data && typeof data.id === 'string') {
    return data.id;
  }

  throw new Error('שרת Supabase לא החזיר מזהה ארגון לאחר היצירה.');
}
