import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import Layout from './Layout.jsx';
import Dashboard from './Pages/Dashboard.jsx';
import Employees from './Pages/Employees.jsx';
import TimeEntry from './Pages/TimeEntry.jsx';
import Reports from './Pages/Reports.jsx';
import ReportsErrorBoundary from './components/reports/ReportsErrorBoundary.js';
import Services from './Pages/Services.jsx';
import Settings from './Pages/Settings.jsx';
import { RuntimeConfigProvider } from './runtime/RuntimeConfigContext.jsx';
import { SupabaseProvider } from './context/SupabaseContext.jsx';
import { isAuthClientInitialized } from './lib/supabase-manager.js';
import Diagnostics from './runtime/Diagnostics.jsx';
import Login from './Pages/Login.jsx';
import CompleteRegistrationPage from './components/pages/CompleteRegistrationPage.jsx';
import AcceptInvitePage from './components/pages/AcceptInvitePage.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import AuthGuard from './auth/AuthGuard.jsx';
import { OrgProvider } from './org/OrgContext.jsx';
import OrgSelection from './Pages/OrgSelection.jsx';

function App({ config = null }) {
  console.log('[DEBUG 4] App component rendering.');
  return (
    <RuntimeConfigProvider config={config}>
      <SupabaseProvider>
        <AuthProvider>
          <OrgProvider>
            <HashRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/complete-registration" element={<CompleteRegistrationPage />} />
                <Route path="/accept-invite" element={<AcceptInvitePage />} />
                <Route element={<AuthGuard />}>
                  <Route path="/select-org" element={<OrgSelection />} />
                  <Route element={<Layout />}>
                    {/* ניתוב אוטומטי מהעמוד הראשי לדשבורד */}
                    <Route path="/" element={<Navigate to="/Dashboard" replace />} />

                    {/* הגדרת כל העמודים */}
                    <Route path="/Dashboard" element={<Dashboard />} />
                    <Route path="/Employees" element={<Employees />} />
                    <Route path="/TimeEntry" element={<TimeEntry />} />
                    <Route path="/Adjustments" element={<Navigate to="/TimeEntry?tab=adjustments" replace />} />
                    <Route path="/Reports" element={<ReportsErrorBoundary><Reports /></ReportsErrorBoundary>} />
                    <Route path="/Services" element={<Services />} />
                    <Route path="/Settings" element={<Settings />} />
                    <Route path="/diagnostics" element={<Diagnostics />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/Dashboard" replace />} />
              </Routes>
            </HashRouter>
          </OrgProvider>
        </AuthProvider>
      </SupabaseProvider>
    </RuntimeConfigProvider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function renderApp(config = null) {
  console.log('[DEBUG 1] Bootstrap: startApp() called.');
  if (!isAuthClientInitialized()) {
    throw new Error(
      'renderApp was invoked before initializeAuthClient completed. Ensure bootstrap initializes Supabase first.'
    );
  }

  console.log('[DEBUG 2] Bootstrap: Config fetched. Initializing auth client...');

  const root = ReactDOM.createRoot(document.getElementById('root'));

  console.log('[DEBUG 3] Bootstrap: Auth client initialized. Rendering App...');

  root.render(
    <React.StrictMode>
      <App config={config} />
    </React.StrictMode>,
  );
}

export default App;
