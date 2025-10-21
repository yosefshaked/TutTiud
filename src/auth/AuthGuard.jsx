import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
      <div className="flex flex-col items-center gap-4 text-slate-600">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" aria-hidden="true" />
        <p className="text-sm font-medium">טוען...</p>
      </div>
    </div>
  );
}

export default function AuthGuard() {
  const { status: authStatus, session } = useAuth();
  const { status: orgStatus, activeOrgHasConnection } = useOrg();
  const location = useLocation();

  if (authStatus === 'loading') {
    return <LoadingScreen />;
  }

  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location,
          reason: 'auth-required',
          message: 'היי! צריך להיכנס למערכת כדי להמשיך. התחבר ונחזיר אותך בדיוק לאותו מסך.',
        }}
      />
    );
  }

  if (orgStatus === 'loading' || orgStatus === 'idle') {
    return <LoadingScreen />;
  }

  const requiresOrgCreation = orgStatus === 'needs-org';
  const requiresOrgSelection = orgStatus === 'needs-selection';

  if (requiresOrgCreation && location.pathname !== '/select-org') {
    return <Navigate to="/select-org" replace state={{ from: location }} />;
  }

  if (location.pathname === '/select-org') {
    return <Outlet />;
  }

  if (!requiresOrgCreation && !requiresOrgSelection && !activeOrgHasConnection && location.pathname !== '/Settings') {
    return <Navigate to="/Settings" replace />;
  }

  return <Outlet />;
}
