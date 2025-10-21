import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOrg } from '@/org/OrgContext.jsx';

export default function OrgSelectionBanner() {
  const { status, organizations } = useOrg();

  if (status !== 'needs-selection') {
    return null;
  }

  const hasOrganizations = organizations.length > 0;
  const message = hasOrganizations
    ? 'בחר ארגון פעיל כדי להמשיך לעבוד במערכת.'
    : 'אין ארגונים זמינים עבורך כרגע. צור ארגון חדש או בקש הזמנה ממנהל.';

  return (
    <div
      className="bg-sky-50 border border-sky-200 rounded-2xl px-4 py-2 flex items-center gap-3 text-sky-800 text-sm mt-4 mr-6 ml-6"
      role="alert"
      dir="rtl"
    >
      <AlertTriangle className="w-4 h-4" aria-hidden="true" />
      <p className="font-medium flex-1">{message}</p>
      <Link
        to="/select-org"
        className="text-xs font-semibold text-sky-900 bg-sky-100 hover:bg-sky-200 transition-colors rounded-xl px-3 py-1"
      >
        בחירת ארגון
      </Link>
    </div>
  );
}
