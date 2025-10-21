import { fetchLeavePolicySettings } from '../lib/settings-client.js';

export async function verifyOrgConnection(options, { fetchSettings = fetchLeavePolicySettings } = {}) {
  if (!options || typeof options !== 'object') {
    throw new Error('נדרש להעביר session ומזהה ארגון לבדיקת החיבור.');
  }

  const { value } = await fetchSettings(options);
  return { ok: true, settingsValue: value };
}

export const verifyConnection = verifyOrgConnection;
