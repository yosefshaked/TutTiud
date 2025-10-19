import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/app/providers/auth-provider'

export const RequireAuth = () => {
  const location = useLocation()
  const { status, clientAvailable } = useAuth()

  if (!clientAvailable) {
    return <Navigate to="/auth/configuration" replace />
  }

  if (status === 'loading') {
    return <div className="flex h-full items-center justify-center text-lg">טוען...</div>
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/auth/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
