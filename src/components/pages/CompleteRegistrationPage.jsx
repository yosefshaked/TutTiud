import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { buildInvitationSearch, extractRegistrationTokens } from '@/lib/invite-tokens.js';

export default function CompleteRegistrationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { authClient } = useSupabase();

  const { tokenHash, invitationTokenKey, invitationTokenValue } = useMemo(
    () => extractRegistrationTokens(location.search),
    [location.search],
  );

  const [status, setStatus] = useState('waiting-client');
  const [verifyError, setVerifyError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ password: '', confirmPassword: '' });
  const [submissionError, setSubmissionError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authClient) {
      setStatus('waiting-client');
      return;
    }

    if (!tokenHash) {
      setVerifyError('קישור ההזמנה שחצת אינו מכיל אסימון אימות תקין. בקש הזמנה חדשה ממנהל הארגון.');
      setStatus('error');
      return;
    }

    let isActive = true;
    setVerifyError('');
    setStatus('verifying');

    authClient.auth
      .verifyOtp({ token_hash: tokenHash, type: 'invite' })
      .then(({ error }) => {
        if (!isActive) {
          return;
        }
        if (error) {
          throw error;
        }
        setStatus('ready');
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }
        console.error('Failed to verify invitation token', error);
        const message =
          error?.message === 'Token has been expired or revoked'
            ? 'ההזמנה הזו פג תוקף או בוטלה. בקש מהארגון לשלוח קישור חדש.'
            : 'אימות קישור ההזמנה נכשל. נסה לרענן את הדף או בקש שנשלח לך קישור חדש.';
        setVerifyError(message);
        setStatus('error');
      });

    return () => {
      isActive = false;
    };
  }, [authClient, tokenHash]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!authClient) {
      setSubmissionError('לקוח האימות עדיין נטען. נסה שוב בעוד מספר שניות.');
      return;
    }

    const nextFieldErrors = { password: '', confirmPassword: '' };
    let hasError = false;

    if (!password) {
      nextFieldErrors.password = 'יש להגדיר סיסמה חדשה.';
      hasError = true;
    }

    if (!confirmPassword) {
      nextFieldErrors.confirmPassword = 'יש לאשר את הסיסמה החדשה.';
      hasError = true;
    } else if (password && confirmPassword !== password) {
      nextFieldErrors.confirmPassword = 'הסיסמאות אינן תואמות.';
      hasError = true;
    }

    setFieldErrors(nextFieldErrors);

    if (hasError) {
      return;
    }

    setSubmissionError('');
    setIsSubmitting(true);

    try {
      const { error } = await authClient.auth.updateUser({ password });
      if (error) {
        throw error;
      }

      const search = buildInvitationSearch(invitationTokenValue, invitationTokenKey);
      navigate(`/accept-invite${search}`, { replace: true });
    } catch (error) {
      console.error('Failed to set password during registration completion', error);
      setSubmissionError('שמירת הסיסמה נכשלה. נסה שוב או פנה לתמיכה.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderContent = () => {
    if (status === 'waiting-client' || status === 'verifying') {
      return (
        <div className="p-8 space-y-6 text-right">
          <div className="flex items-center justify-end gap-3 text-blue-600">
            <div className="w-10 h-10 rounded-full border-2 border-blue-200 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-blue-400">בודקים את הקישור</p>
              <p className="text-lg font-semibold text-blue-900">מאמתים את ההזמנה שלך...</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            אנו מאמתים את הקישור המאובטח שהגיע אליך במייל ומכינים עבורך חיבור לחשבון הארגוני. פעולה זו אורכת מספר שניות.
          </p>
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className="p-8 space-y-6 text-right">
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3" role="alert">
            {verifyError}
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            אם הבעיה נמשכת, בקש ממנהל הארגון לשלוח מחדש את ההזמנה או פנה לתמיכה בכתובת support@example.com.
          </p>
        </div>
      );
    }

    return (
      <form onSubmit={handleSubmit} className="p-8 space-y-6 text-right" noValidate>
        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium text-slate-600">
            סיסמה חדשה
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-right shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />
          {fieldErrors.password ? (
            <p className="text-xs text-red-600" role="alert">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-600">
            אימות סיסמה
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-right shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />
          {fieldErrors.confirmPassword ? (
            <p className="text-xs text-red-600" role="alert">
              {fieldErrors.confirmPassword}
            </p>
          ) : null}
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          הסיסמה החדשה תגן על הגישה שלך למידע הארגוני. מומלץ להשתמש בסיסמה ייחודית באורך של 8 תווים לפחות הכוללת אותיות, מספרים וסימנים.
        </p>

        {submissionError ? (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3" role="alert">
            {submissionError}
          </div>
        ) : null}

        <button
          type="submit"
          className="w-full bg-gradient-to-l from-blue-600 to-indigo-500 text-white py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          disabled={isSubmitting}
        >
          <LockKeyhole className="w-5 h-5" />
          <span>{isSubmitting ? 'שומרת סיסמה...' : 'שמור סיסמה והמשך'}</span>
        </button>
      </form>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 flex items-center justify-center px-4 py-12" dir="rtl">
      <div className="max-w-md w-full bg-white shadow-xl rounded-3xl overflow-hidden border border-slate-100">
        <div className="bg-gradient-to-l from-blue-500 to-indigo-500 p-6 text-right text-white">
          <div className="flex items-center justify-end gap-3">
            <ShieldCheck className="w-10 h-10" />
            <div>
              <p className="text-sm text-blue-100">מערכת ניהול עובדים</p>
              <h1 className="text-2xl font-bold">השלמת הרשמה מאובטחת</h1>
              <p className="text-sm text-blue-100 mt-1">צעד אחרון לפני הצטרפות לארגון</p>
            </div>
          </div>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}
