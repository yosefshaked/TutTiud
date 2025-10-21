import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Building2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/org/OrgContext.jsx';
import { mapSupabaseError } from '@/org/errors.js';

function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
      <div className="flex flex-col items-center gap-4 text-slate-600">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" aria-hidden="true" />
        <p className="text-sm font-medium">טוען ארגונים...</p>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <Card className="max-w-2xl w-full">
      <CardHeader className="space-y-2 text-right">
        <CardTitle className="text-2xl font-bold text-slate-900">ברוך הבא!</CardTitle>
        <p className="text-slate-600 text-sm">
          עדיין אין ארגון המשויך לחשבון שלך. צור ארגון חדש או בקש ממנהל להזמין אותך.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={onCreate} className="w-full" size="lg">
          <Building2 className="w-4 h-4 ml-2" />
          צור ארגון חדש
        </Button>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3 text-sm text-blue-900" role="status">
          <AlertCircle className="w-4 h-4 mt-0.5" aria-hidden="true" />
          <p>
            לאחר יצירת הארגון ניתן יהיה להגדיר את חיבור ה-Supabase ולצרף מנהלים נוספים מתוך מסך ההגדרות.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function InviteList({ invites, onAccept }) {
  if (!invites.length) return null;
  return (
    <Card className="w-full max-w-3xl">
      <CardHeader className="text-right">
        <CardTitle className="text-lg font-semibold text-slate-900">הזמנות ממתינות</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {invites.map((invite) => (
          <div key={invite.id} className="border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-right">
              <p className="font-medium text-slate-900">{invite.organization?.name || 'ארגון ללא שם'}</p>
              <p className="text-sm text-slate-500">{invite.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50">מוזמן</Badge>
              <Button onClick={() => onAccept(invite.id)} className="gap-2" size="sm">
                <Users className="w-4 h-4" />
                הצטרף
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OrganizationList({ organizations, onSelect }) {
  if (!organizations.length) return null;
  return (
    <Card className="w-full max-w-3xl">
      <CardHeader className="text-right">
        <CardTitle className="text-lg font-semibold text-slate-900">בחר ארגון</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {organizations.map((organization) => (
          <button
            key={organization.id}
            type="button"
            onClick={() => onSelect(organization.id)}
            className="w-full border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition rounded-xl p-4 text-right"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{organization.name}</p>
                {organization.membership?.role === 'admin' ? (
                  <p className="text-xs text-blue-600 mt-1">מנהל ארגון</p>
                ) : (
                  <p className="text-xs text-slate-500 mt-1">חבר צוות</p>
                )}
              </div>
              {organization.has_connection ? (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                  חיבור פעיל
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
                  נדרש חיבור Supabase
                </Badge>
              )}
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function CreateOrgDialog({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('יש להזין שם ארגון.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onCreate({ name: trimmedName });
      setName('');
      onClose();
    } catch (submitError) {
      console.error('Failed to create organization', submitError);
      const message = mapSupabaseError(submitError);
      toast.error(message);
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg" dir="rtl">
        <div className="px-6 py-5 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">יצירת ארגון חדש</h2>
          <p className="text-sm text-slate-500 mt-1">
            ניתן להגדיר את חיבור ה-Supabase וההגדרות הנוספות לאחר הכניסה למערכת.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="space-y-2 text-right">
            <Label htmlFor="org-name">שם הארגון</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="למשל: מרכז הספורט העירוני"
              autoFocus
            />
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              ביטול
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()} className="gap-2">
              {isSubmitting ? 'יוצר...' : 'צור ארגון'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OrgSelection() {
  const { organizations, incomingInvites, status, selectOrg, createOrganization, acceptInvite } = useOrg();
  const navigate = useNavigate();
  const location = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const hasOrganizations = organizations.length > 0;
  const hasInvites = incomingInvites.length > 0;
  const returnTo = useMemo(() => {
    return location.state?.from?.pathname || '/Dashboard';
  }, [location.state]);

  const handleSelect = async (orgId) => {
    try {
      await selectOrg(orgId);
      navigate(returnTo, { replace: true });
    } catch (error) {
      console.error('Failed to select organization', error);
      toast.error('בחירת הארגון נכשלה. נסה שוב.');
    }
  };

  const handleAcceptInvite = async (inviteId) => {
    try {
      await acceptInvite(inviteId);
      navigate(returnTo, { replace: true });
    } catch (error) {
      console.error('Failed to accept invite', error);
      toast.error('לא ניתן להצטרף לארגון. נסה שוב או בקש הזמנה חדשה.');
    }
  };

  const handleCreate = async ({ name }) => {
    await createOrganization({ name });
    navigate(returnTo, { replace: true });
  };

  if (status === 'loading' || status === 'idle') {
    return <LoadingState />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4 py-10" dir="rtl">
      <div className="flex flex-col items-center gap-6 w-full">
        <InviteList invites={incomingInvites} onAccept={handleAcceptInvite} />
        <OrganizationList organizations={organizations} onSelect={handleSelect} />
        {!hasOrganizations && !hasInvites ? (
          <EmptyState onCreate={() => setIsCreateOpen(true)} />
        ) : (
          <Button variant="outline" onClick={() => setIsCreateOpen(true)} className="gap-2">
            <Building2 className="w-4 h-4" />
            צור ארגון חדש
          </Button>
        )}
      </div>
      <CreateOrgDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
