import { Link, NavLink, Outlet } from 'react-router-dom'
import { useMemo } from 'react'

import { Button } from '@/components/ui/button'

import { useAuth } from '@/app/providers/auth-provider'
import { useOrganization } from '@/app/providers/organization-provider'
import { cn } from '@/lib/utils'

export const AppShell = () => {
  const { signOut, user } = useAuth()
  const { selectedOrganization } = useOrganization()

  const navigation = useMemo(() => {
    const items: { to: string; label: string }[] = [
      { to: '/', label: 'עמוד הבית' },
      { to: '/students', label: 'התלמידים שלי' },
      { to: '/session-records/new', label: 'תיעוד מפגש חדש' }
    ]

    if (selectedOrganization?.role === 'admin' || selectedOrganization?.role === 'owner') {
      items.push({ to: '/admin/backup', label: 'גיבוי נתונים' })
    }

    return items
  }, [selectedOrganization?.role])

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="container flex flex-col gap-4 py-4 text-right md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:gap-6">
            <Link className="text-xl font-semibold" to="/">
              TutTiud
            </Link>
            <nav className="flex flex-wrap items-center gap-2">
              {navigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex flex-col items-end gap-2 text-sm md:flex-row md:items-center md:gap-4">
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
