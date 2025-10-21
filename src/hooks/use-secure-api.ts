import { useCallback } from 'react'

import { useAuth } from '@/app/providers/auth-provider'
import { useOrganization } from '@/app/providers/organization-provider'

type Primitive = string | number | boolean

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, Primitive | null | undefined>
  includeOrgInBody?: boolean
  appendOrgIdToQuery?: boolean
  headers?: Record<string, string>
}

export const useSecureApi = () => {
  const { session } = useAuth()
  const { selectedOrganization } = useOrganization()

  const callApi = useCallback(
    async <TResponse = unknown>(
      path: string,
      options: RequestOptions = {}
    ): Promise<TResponse> => {
      const accessToken = session?.access_token

      if (!accessToken) {
        throw new Error('החיבור לשרת פג. התחברו מחדש ונסו שוב.')
      }

      if (!selectedOrganization) {
        throw new Error('לא נבחר ארגון פעיל. בחרו ארגון ונסו שוב.')
      }

      const method = (options.method ?? 'GET').toUpperCase()
      const url = new URL(path, window.location.origin)

      const params = new URLSearchParams()
      const query = options.query ?? {}
      for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined) continue
        params.set(key, String(value))
      }

      if (method === 'GET' || options.appendOrgIdToQuery) {
        params.set('orgId', selectedOrganization.org_id)
      }

      if (params.toString()) {
        url.search = params.toString()
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers ?? {})
      }

      let body: string | undefined
      if (method !== 'GET') {
        const contentType = headers['Content-Type'] ?? 'application/json'
        headers['Content-Type'] = contentType

        const payload =
          options.includeOrgInBody === false
            ? options.body ?? {}
            : { ...(options.body ?? {}), orgId: selectedOrganization.org_id }

        body = contentType === 'application/json' ? JSON.stringify(payload) : (payload as string)
      }

      const response = await fetch(url.toString(), {
        method,
        headers,
        body
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          (typeof data?.message === 'string' && data.message.trim()) ||
          'בקשה לשרת נכשלה. נסו שוב מאוחר יותר.'
        const error: Error & { status?: number; details?: unknown } = new Error(message)
        error.status = response.status
        error.details = data
        throw error
      }

      return data as TResponse
    },
    [session?.access_token, selectedOrganization]
  )

  return { callApi }
}
