import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { useLocalStorage } from '@/hooks/use-local-storage'
import { supabaseClient } from '@/lib/supabase-client'
import type { OrgMembership } from '@/types/control-db'

import { useAuth } from './auth-provider'

type OrganizationStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

type OrganizationContextValue = {
  memberships: OrgMembership[]
  status: OrganizationStatus
  selectedOrganization: OrgMembership | null
  selectOrganization: (orgId: string | null) => void
  error: string | null
  refresh: () => Promise<void>
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(
  undefined
)

const STORAGE_KEY = 'tuttiud.selectedOrganization'

type SupabaseOrgMembershipRow = {
  org_id?: string | null
  organization_name?: string | null
  role?: string | null
}

export const OrganizationProvider = ({
  children
}: {
  children: React.ReactNode
}) => {
  const { user, status: authStatus, clientAvailable } = useAuth()
  const [memberships, setMemberships] = useState<OrgMembership[]>([])
  const [status, setStatus] = useState<OrganizationStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [storedOrgId, setStoredOrgId] = useLocalStorage<string | null>(
    STORAGE_KEY,
    null
  )

  const loadMemberships = useCallback(async () => {
    if (!user || !supabaseClient) {
      setMemberships([])
      setStatus(authStatus === 'authenticated' ? 'empty' : 'idle')
      return
    }

    try {
      setStatus('loading')
      const { data, error: queryError } = await supabaseClient
        .from('org_memberships')
        .select('org_id, organization_name, role')
        .eq('user_id', user.id)

      if (queryError) {
        throw queryError
      }

      const normalized = ((data ?? []) as SupabaseOrgMembershipRow[])
        .map((membership) => {
          const orgId = membership.org_id ?? null

          if (!orgId) {
            return null
          }

          return {
            org_id: orgId,
            organization_name:
              membership.organization_name ?? 'ארגון ללא שם',
            role: (membership.role as OrgMembership['role']) ?? 'member'
          }
        })
        .filter((membership): membership is OrgMembership => Boolean(membership))

      setMemberships(normalized)
      setStatus(normalized.length === 0 ? 'empty' : 'ready')
      setError(null)

      setStoredOrgId((previousOrgId) => {
        if (normalized.length === 0) {
          return null
        }
        if (previousOrgId && normalized.some((m) => m.org_id === previousOrgId)) {
          return previousOrgId
        }
        return normalized[0]?.org_id ?? null
      })
    } catch (loadError) {
      console.error('Failed to load organization memberships', loadError)
      setError('שגיאה בטעינת הארגונים. אנא נסה שוב מאוחר יותר.')
      setStatus('error')
    }
  }, [authStatus, setStoredOrgId, user])

  useEffect(() => {
    if (!clientAvailable) {
      setStatus('idle')
      return
    }
    if (authStatus === 'loading') {
      setStatus('loading')
      return
    }
    void loadMemberships()
  }, [authStatus, clientAvailable, loadMemberships])

  const selectedOrganization = useMemo(() => {
    if (!storedOrgId) return null
    return memberships.find((org) => org.org_id === storedOrgId) ?? null
  }, [memberships, storedOrgId])

  const selectOrganization = useCallback<OrganizationContextValue['selectOrganization']>(
    (orgId) => {
      setStoredOrgId(orgId)
    },
    [setStoredOrgId]
  )

  const value = useMemo<OrganizationContextValue>(
    () => ({
      memberships,
      status,
      selectedOrganization,
      selectOrganization,
      error,
      refresh: loadMemberships
    }),
    [memberships, status, selectedOrganization, selectOrganization, error, loadMemberships]
  )

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  )
}

export const useOrganization = () => {
  const context = useContext(OrganizationContext)
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider')
  }
  return context
}
