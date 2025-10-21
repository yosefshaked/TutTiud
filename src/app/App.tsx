import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './providers/auth-provider'
import { OrganizationProvider } from './providers/organization-provider'
import { AppShell } from './components/app-shell'
import { RequireAuth } from './guards/require-auth'
import { RequireOrganization } from './guards/require-organization'
import { AuthConfigurationPage } from '@/pages/auth-configuration'
import { AuthLoginPage } from '@/pages/auth-login'
import { LandingPage } from '@/pages/landing'
import { NotFoundPage } from '@/pages/not-found'
import { OrganizationSelectorPage } from '@/pages/organization-selector'
import { SessionRecordCreatePage } from '@/pages/session-record-create'
import { SetupWizardPage } from '@/pages/setup-wizard'
import { StudentsPage } from '@/pages/students'
import { BackupPage } from '@/pages/backup'

export const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OrganizationProvider>
          <Routes>
            <Route path="/auth/login" element={<AuthLoginPage />} />
            <Route path="/auth/configuration" element={<AuthConfigurationPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/auth/select-organization" element={<OrganizationSelectorPage />} />
              <Route element={<RequireOrganization />}>
                <Route element={<AppShell />}>
                  <Route index element={<LandingPage />} />
                  <Route path="setup-wizard" element={<SetupWizardPage />} />
                  <Route path="students" element={<StudentsPage />} />
                  <Route path="session-records/new" element={<SessionRecordCreatePage />} />
                  <Route path="admin/backup" element={<BackupPage />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </OrganizationProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
