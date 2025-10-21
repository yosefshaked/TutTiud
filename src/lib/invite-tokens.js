export const INVITATION_TOKEN_KEYS = ['invitation_token', 'invitationToken', 'invite_token', 'inviteToken'];

function selectToken(params) {
  let tokenKey = null;
  let tokenValue = '';

  for (const key of INVITATION_TOKEN_KEYS) {
    if (!params.has(key)) {
      continue;
    }
    const candidate = params.get(key) ?? '';
    if (candidate) {
      tokenKey = key;
      tokenValue = candidate;
      break;
    }
    if (!tokenKey) {
      tokenKey = key;
      tokenValue = '';
    }
  }

  return {
    tokenKey,
    tokenValue: typeof tokenValue === 'string' ? tokenValue.trim() : '',
  };
}

export function extractRegistrationTokens(search) {
  const params = new URLSearchParams(search);
  const tokenHash = params.get('token_hash') ?? params.get('tokenHash') ?? '';
  const { tokenKey, tokenValue } = selectToken(params);
  return {
    tokenHash: typeof tokenHash === 'string' ? tokenHash.trim() : '',
    invitationTokenKey: tokenKey,
    invitationTokenValue: tokenValue,
  };
}

export function extractInvitationToken(search) {
  const params = new URLSearchParams(search);
  const { tokenKey, tokenValue } = selectToken(params);
  return {
    invitationTokenKey: tokenKey,
    invitationTokenValue: tokenValue,
  };
}

export function buildInvitationSearch(invitationTokenValue, invitationTokenKey) {
  const params = new URLSearchParams();
  if (invitationTokenValue) {
    params.set(invitationTokenKey ?? 'invitation_token', invitationTokenValue);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}
