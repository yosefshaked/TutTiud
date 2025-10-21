export type CurrentUserProfile = {
  id: string
  email: string | null
  raw_user_meta_data: Record<string, unknown> | null
}

type FetchCurrentUserOptions = {
  signal?: AbortSignal
  accessToken?: string | null
}

function ensureJsonResponse(response: Response, body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const error = new Error('התשובה מ- /api/users/me אינה בפורמט JSON תקין.') as Error & { status?: number }
    error.status = response.status
    throw error
  }
}

function extractErrorMessage(body: unknown) {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'message' in body) {
    const message = (body as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }
  return 'אירעה שגיאה בעת טעינת פרטי המשתמש.'
}

function buildHeaders(options: FetchCurrentUserOptions) {
  const headers: Record<string, string> = {
    accept: 'application/json',
  }

  if (typeof options.accessToken === 'string' && options.accessToken.trim()) {
    const trimmed = options.accessToken.trim()
    const bearer = trimmed.startsWith('Bearer ')
      ? trimmed
      : `Bearer ${trimmed}`
    headers.authorization = bearer
    headers.Authorization = bearer
    headers['x-supabase-authorization'] = bearer
    headers['X-Supabase-Authorization'] = bearer
  }

  return headers
}

export async function fetchCurrentUser(options: FetchCurrentUserOptions = {}): Promise<CurrentUserProfile> {
  const response = await fetch('/api/users/me', {
    method: 'GET',
    headers: buildHeaders(options),
    signal: options.signal,
    cache: 'no-store',
  })

  const contentType = response.headers.get('content-type') || ''
  let parsedBody: unknown = null

  if (contentType.includes('application/json')) {
    parsedBody = await response.json()
  } else {
    await response.text()
    const error = new Error('השרת החזיר תשובה שאינה בפורמט JSON מ- /api/users/me.') as Error & { status?: number }
    error.status = response.status
    throw error
  }

  ensureJsonResponse(response, parsedBody)

  if (!response.ok) {
    const error = new Error(extractErrorMessage(parsedBody)) as Error & {
      status?: number
      body?: unknown
    }
    error.status = response.status
    error.body = parsedBody
    throw error
  }

  const body = parsedBody as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : null

  if (!id) {
    const error = new Error('התשובה מ- /api/users/me חסרה מזהה משתמש תקין.') as Error & { status?: number }
    error.status = response.status
    throw error
  }

  const email = typeof body.email === 'string' ? body.email : null
  const rawMetadata = body.raw_user_meta_data
  const metadata = rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
    ? (rawMetadata as Record<string, unknown>)
    : null

  return {
    id,
    email,
    raw_user_meta_data: metadata,
  }
}
