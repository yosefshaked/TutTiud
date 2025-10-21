/* eslint-env node */

export default async function (context) {
  const timestamp = new Date().toISOString();

  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({
      ok: true,
      timestamp,
    }),
  };
}
