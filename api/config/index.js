function jsonResponse(context, status, payload, extraHeaders = {}) {
  context.res = {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  };
}

function maskForLog(value) {
  if (!value) return '';
  const stringValue = String(value);
  if (stringValue.length <= 6) return '••••';
  return `${stringValue.slice(0, 2)}••••${stringValue.slice(-2)}`;
}

export default async function (context) {
  const env = context.env ?? globalThis.process?.env ?? {};

  try {
    const supabaseUrl = env.APP_SUPABASE_URL;
    const anonKey = env.APP_SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
      context.log.error('Supabase URL is missing.');
      jsonResponse(context, 500, { error: 'server_misconfigured' });
      return;
    }

    if (!anonKey) {
      context.log.error('Supabase anon key is missing for base config.');
      jsonResponse(context, 500, { error: 'server_misconfigured' });
      return;
    }

    context.log.info('Issued base app config.', {
      supabaseUrl: maskForLog(supabaseUrl),
      anonKey: maskForLog(anonKey),
    });

    jsonResponse(
      context,
      200,
      { supabase_url: supabaseUrl, anon_key: anonKey },
      { 'X-Config-Scope': 'app' },
    );
  } catch (error) {
    context.log.error('Unhandled configuration error.', {
      message: error?.message,
    });
    jsonResponse(context, 500, { error: 'server_error' });
  }
}
