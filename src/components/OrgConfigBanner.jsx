import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useOrg } from '@/org/OrgContext.jsx';

export default function OrgConfigBanner() {
  const { activeOrg, activeOrgHasConnection } = useOrg();

  if (!activeOrg) {
    return null;
  }

  const missingConnection = !activeOrgHasConnection;
  const pendingSetup = !activeOrg.setup_completed;

  if (!missingConnection && !pendingSetup) {
    return null;
  }

  const message = missingConnection
    ? 'כדי להתחיל להשתמש במערכת יש להוסיף את כתובת ה-URL והמפתח הציבורי של Supabase בארגון הנוכחי.'
    : 'נדרש להשלים את אשף ההגדרות ולוודא שהטבלאות והמדיניות קיימות בפרויקט ה-Supabase שלכם.';

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2 flex items-center gap-3 text-amber-800 text-sm mt-4 mr-6 ml-6" role="status">
      <AlertTriangle className="w-4 h-4" aria-hidden="true" />
      <p className="font-medium">{message}</p>
    </div>
  );
}
