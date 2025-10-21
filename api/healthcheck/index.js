/* eslint-env node */

export default async function (context) {
  context.res = {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({ ok: true }),
  };
}
