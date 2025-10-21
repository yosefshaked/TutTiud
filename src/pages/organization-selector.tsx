import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { useAuth } from '@/app/providers/auth-provider'
import { useOrganization } from '@/app/providers/organization-provider'
import { cn } from '@/lib/utils'
import { fetchOrganizationSetupSettings } from '@/lib/setup-wizard'

type SelectorLocationState = {
  from?: Location
}

export const OrganizationSelectorPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { status: authStatus } = useAuth()
  const {
    memberships,
    selectedOrganization,
    selectOrganization,
    status,
    error,
    refresh
  } = useOrganization()
  const [isCheckingSetup, setIsCheckingSetup] = useState(false)
  const [setupCheckError, setSetupCheckError] = useState<string | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const fallbackDestination = useMemo(() => {
    const fromLocation = (location.state as SelectorLocationState | null)?.from
    if (!fromLocation) {
      return '/'
    }
    const pathname = fromLocation.pathname ?? '/'
    const search = fromLocation.search ?? ''
    const hash = fromLocation.hash ?? ''
    return `${pathname}${search}${hash}`
  }, [location.state])

  const goToNextRoute = useCallback(
    async (replace: boolean) => {
      if (!selectedOrganization) {
        return
      }

      if (isMountedRef.current) {
        setIsCheckingSetup(true)
        setSetupCheckError(null)
      }

      try {
        const settings = await fetchOrganizationSetupSettings(selectedOrganization.org_id)
        const tuttiudStatus = settings?.metadata.connections.tuttiud ?? null
        const destination =
          tuttiudStatus === 'connected' ? fallbackDestination : '/setup-wizard'

        navigate(destination, { replace })
      } catch (routingError) {
        console.error('Failed to evaluate organization setup status', routingError)
        if (isMountedRef.current) {
          setSetupCheckError('שגיאה בבדיקת סטטוס ההגדרות. מועבר לאשף ההקמה כברירת מחדל.')
        }
        navigate('/setup-wizard', { replace })
      } finally {
        if (isMountedRef.current) {
          setIsCheckingSetup(false)
        }
      }
    },
    [fallbackDestination, navigate, selectedOrganization]
  )

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      navigate('/auth/login', { replace: true })
    }
  }, [authStatus, navigate])

  useEffect(() => {
    if (status === 'ready' && selectedOrganization) {
      void goToNextRoute(true)
    }
  }, [goToNextRoute, selectedOrganization, status])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-lg">
        טוען את הארגונים שלך...
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>בחירת ארגון פעיל</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {setupCheckError ? (
            <p className="text-sm text-destructive">{setupCheckError}</p>
          ) : null}
          {isCheckingSetup ? (
            <p className="text-sm text-muted-foreground">בודק את סטטוס הגדרות הארגון…</p>
          ) : null}
          {status === 'empty' ? (
            <p className="text-sm text-muted-foreground">
              לא נמצאו ארגונים משויכים למשתמש זה. אנא פנה למנהל המערכת.
            </p>
          ) : null}
          <div className="grid gap-3">
            {memberships.map((membership) => {
              const isActive =
                membership.org_id === selectedOrganization?.org_id
              return (
                <button
                  key={membership.org_id}
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border p-4 text-right transition hover:border-primary',
                    isActive ? 'border-primary bg-primary/10' : 'border-border bg-card'
                  )}
                  onClick={() => selectOrganization(membership.org_id)}
                >
                  <div className="space-y-1">
                    <p className="text-base font-semibold">{membership.organization_name}</p>
                    <p className="text-sm text-muted-foreground">תפקיד: {membership.role}</p>
                  </div>
                  {isActive ? (
                    <span className="text-sm text-primary">נבחר</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">בחר</span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between">
            <Button onClick={() => navigate(-1)} variant="secondary" type="button">
              חזרה
            </Button>
            <Button
              disabled={!selectedOrganization || isCheckingSetup}
              onClick={() => void goToNextRoute(false)}
              type="button"
            >
              המשך ללוח הבקרה
            </Button>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => refresh()} type="button">
              רענן ארגונים
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
