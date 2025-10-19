import { Link, Outlet } from 'react-router-dom'

import { Button } from '@/components/ui/button'

import { useAuth } from '@/app/providers/auth-provider'
import { useOrganization } from '@/app/providers/organization-provider'

export const AppShell = () => {
  const { signOut, user } = useAuth()
  const { selectedOrganization } = useOrganization()

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between gap-4 py-4">
          <Link className="text-xl font-semibold" to="/">
            TutTiud
          </Link>
          <div className="flex items-center gap-4 text-sm">
            {selectedOrganization ? (
              <div className="text-right">
                <p className="font-semibold">{selectedOrganization.organization_name}</p>
                <p className="text-muted-foreground">תפקיד: {selectedOrganization.role}</p>
              </div>
            ) : null}
            {user ? (
              <div className="text-right">
                <p className="font-semibold">{user.email}</p>
                <p className="text-muted-foreground">מזהה: {user.id}</p>
              </div>
            ) : null}
            <Button
              onClick={() => {
                void signOut()
              }}
              variant="secondary"
              type="button"
            >
              התנתק
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
