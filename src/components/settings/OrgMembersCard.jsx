import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, MailPlus, Trash2, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/org/OrgContext.jsx';
import { useAuth } from '@/auth/AuthContext.jsx';
import { createInvitation, listPendingInvitations, revokeInvitation as revokeInvitationRequest } from '@/api/invitations.js';

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return isoString;
  }
}

export default function OrgMembersCard() {
  const { activeOrg, members, removeMember } = useOrg();
  const { user, session } = useAuth();
  const [email, setEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [isInvitesLoading, setIsInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState(null);
  const [revokingId, setRevokingId] = useState(null);
  const activeOrgId = activeOrg?.id || null;
  const role = activeOrg?.membership?.role || '';
  const canManageOrgMembers = useMemo(() => {
    if (typeof role !== 'string') {
      return false;
    }
    const normalizedRole = role.toLowerCase();
    return normalizedRole === 'admin' || normalizedRole === 'owner';
  }, [role]);

  const refreshInvitations = useCallback(
    async ({ signal, suppressToast } = {}) => {
      if (!canManageOrgMembers || !activeOrgId) {
        setPendingInvites([]);
        setInvitesError(null);
        return;
      }
      if (!session) {
        setInvitesError('נדרש חיבור כדי לטעון הזמנות.');
        return;
      }

      setIsInvitesLoading(true);
      setInvitesError(null);
      try {
        const invitations = await listPendingInvitations(activeOrgId, { session, signal });
        if (!signal?.aborted) {
          setPendingInvites(invitations);
        }
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }
        const message = error?.message || 'טעינת ההזמנות נכשלה. נסה שוב.';
        if (!signal?.aborted) {
          setInvitesError(message);
          if (!suppressToast) {
            toast.error(message);
          }
        }
      } finally {
        if (!signal?.aborted) {
          setIsInvitesLoading(false);
        }
      }
    },
    [activeOrgId, canManageOrgMembers, session],
  );

  useEffect(() => {
    const controller = new AbortController();
    refreshInvitations({ signal: controller.signal, suppressToast: true });
    return () => {
      controller.abort();
    };
  }, [refreshInvitations]);

  const handleInvite = async (event) => {
    event.preventDefault();
    if (!canManageOrgMembers || !email.trim()) return;
    if (!session) {
      toast.error('נדרש חיבור לחשבון כדי לשלוח הזמנה.');
      return;
    }

    setIsInviting(true);
    try {
      await createInvitation(activeOrgId, email.trim(), { session });
      toast.success('ההזמנה נשלחה בהצלחה.');
      setEmail('');
      await refreshInvitations({ suppressToast: true });
    } catch (error) {
      console.error('Failed to send invitation', error);
      toast.error(error?.message || 'שליחת ההזמנה נכשלה. ודא שהכתובת תקינה ונסה שוב.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevoke = async (inviteId) => {
    if (!inviteId || !session) {
      toast.error('לא ניתן לבטל הזמנה ללא התחברות.');
      return;
    }
    setRevokingId(inviteId);
    try {
      await revokeInvitationRequest(inviteId, { session });
      toast.success('ההזמנה בוטלה.');
      await refreshInvitations({ suppressToast: true });
    } catch (error) {
      console.error('Failed to revoke invite', error);
      toast.error(error?.message || 'לא ניתן לבטל את ההזמנה. נסה שוב.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRemoveMember = async (membershipId) => {
    try {
      await removeMember(membershipId);
      toast.success('החבר הוסר מהארגון.');
    } catch (error) {
      console.error('Failed to remove member', error);
      toast.error('הסרת החבר נכשלה.');
    }
  };

  if (!activeOrg) {
    return null;
  }

  return (
    <Card className="border-0 shadow-xl bg-white/90" dir="rtl">
      <CardHeader className="border-b border-slate-200">
        <CardTitle className="text-xl font-semibold text-slate-900">חברי ארגון</CardTitle>
        <p className="text-sm text-slate-600 mt-2">
          כל המשתמשים בארגון חולקים את אותו חיבור Supabase. מנהלים יכולים להזמין ולנהל חברים נוספים.
        </p>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">חברים פעילים</h3>
          <div className="space-y-3">
            {(members || []).map((member) => {
              const isCurrentUser = member.user_id === user?.id;
              return (
                <div
                  key={member.id || member.user_id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-slate-200 rounded-xl px-4 py-3"
                >
                  <div className="text-right space-y-1">
                    <p className="text-sm font-medium text-slate-900">
                      {member.name || member.email || 'משתמש ללא שם'}
                    </p>
                    <p className="text-xs text-slate-500" dir="ltr">
                      {member.email || member.user_id}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>הצטרף: {formatDate(member.joined_at)}</span>
                      {member.role ? (
                        <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50">
                          {member.role === 'admin' ? 'מנהל' : 'חבר'}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {canManageOrgMembers && !isCurrentUser ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 gap-2"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      <UserMinus className="w-4 h-4" />
                      הסר מהארגון
                    </Button>
                  ) : null}
                </div>
              );
            })}
            {!members?.length ? (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2" role="status">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                <span>עדיין לא נוספו חברים נוספים לארגון.</span>
              </div>
            ) : null}
          </div>
        </section>

        {canManageOrgMembers ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">הזמן חבר חדש</h3>
            <form className="flex flex-col md:flex-row gap-3" onSubmit={handleInvite}>
              <div className="flex-1">
                <label htmlFor="invite-email" className="sr-only">אימייל להזמנה</label>
                <Input
                  id="invite-email"
                  type="email"
                  dir="ltr"
                  className="w-full"
                  placeholder="manager@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="gap-2" disabled={isInviting}>
                {isInviting ? 'שולח...' : (
                  <>
                    <MailPlus className="w-4 h-4" />
                    שלח הזמנה
                  </>
                )}
              </Button>
            </form>
          </section>
        ) : null}

        {canManageOrgMembers ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">הזמנות ממתינות</h3>
            <div className="space-y-3">
              {isInvitesLoading ? (
                <p className="text-xs text-slate-500" role="status">טוען הזמנות...</p>
              ) : invitesError ? (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2" role="alert">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                  <span>{invitesError}</span>
                </div>
              ) : pendingInvites?.length ? (
                pendingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-slate-200 rounded-xl px-4 py-3"
                  >
                    <div className="text-right space-y-1">
                      <p className="text-sm font-medium text-slate-900" dir="ltr">{invite.email}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>נשלח: {formatDate(invite.createdAt || invite.created_at)}</span>
                        <Badge variant="outline" className="text-slate-600 border-slate-200 bg-slate-50">
                          {invite.status === 'pending' ? 'ממתין' : invite.status}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-slate-600 hover:bg-slate-100 gap-2"
                      onClick={() => handleRevoke(invite.id)}
                      disabled={revokingId === invite.id}
                    >
                      <Trash2 className="w-4 h-4" />
                      {revokingId === invite.id ? 'מבטל...' : 'בטל הזמנה'}
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">אין הזמנות ממתינות.</p>
              )}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
