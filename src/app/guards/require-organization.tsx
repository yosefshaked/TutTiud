import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useOrganization } from '@/app/providers/organization-provider'

export const RequireOrganization = () => {
  const { status, selectedOrganization } = useOrganization()
  const location = useLocation()

  if (status === 'loading') {
    return <div className="flex h-full items-center justify-center text-lg">טוען ארגונים...</div>
  }

  if (status === 'error' || status === 'empty' || !selectedOrganization) {
    return <Navigate to="/auth/select-organization" replace state={{ from: location }} />
  }

  return <Outlet />
}
