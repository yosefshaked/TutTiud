import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { useAuth } from '@/app/providers/auth-provider'
import { useOrganization } from '@/app/providers/organization-provider'
import { cn } from '@/lib/utils'

export const OrganizationSelectorPage = () => {
  const navigate = useNavigate()
  const { status: authStatus } = useAuth()
  const {
    memberships,
    selectedOrganization,
    selectOrganization,
    status,
    error,
    refresh
  } = useOrganization()

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      navigate('/auth/login', { replace: true })
    }
  }, [authStatus, navigate])

  useEffect(() => {
    if (status === 'ready' && selectedOrganization) {
      navigate('/', { replace: true })
    }
  }, [navigate, selectedOrganization, status])

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
            <Button disabled={!selectedOrganization} onClick={() => navigate('/')} type="button">
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
