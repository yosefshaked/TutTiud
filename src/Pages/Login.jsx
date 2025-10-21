import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { LogIn, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext.jsx';

export default function Login() {
  const { status, session, signInWithEmail, signInWithOAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthInFlight, setOauthInFlight] = useState(null);
  const location = useLocation();

  const redirectPath = location.state?.from?.pathname || '/Dashboard';
  const redirectMessage = location.state?.message || null;

  if (status === 'ready' && session) {
    return <Navigate to={redirectPath} replace />;
  }

  const handleEmailSignIn = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await signInWithEmail(email.trim(), password);
      toast.success('ברוך הבא! מתחבר למערכת...');
    } catch (error) {
      console.error('Email sign-in failed', error);
      toast.error('התחברות בדוא"ל נכשלה. בדוק את הפרטים ונסה שוב.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuth = async (provider) => {
    setOauthInFlight(provider);
    try {
      await signInWithOAuth(provider);
    } catch (error) {
      console.error('OAuth sign-in failed', error);
      toast.error('התחברות נכשלה. נסה שוב או פנה לתמיכה.');
      setOauthInFlight(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 flex items-center justify-center px-4" dir="rtl">
      <div className="max-w-md w-full bg-white shadow-xl rounded-3xl overflow-hidden border border-slate-100">
        <div className="bg-gradient-to-l from-blue-500 to-indigo-500 p-6 text-right text-white">
          <div className="flex items-center justify-end gap-3">
            <ShieldCheck className="w-10 h-10" />
            <div>
              <p className="text-sm text-blue-100">מערכת ניהול עובדים</p>
              <h1 className="text-2xl font-bold">כניסה לחשבון</h1>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-6">
          {redirectMessage ? (
            <div
              className="bg-blue-50 border border-blue-100 text-blue-900 text-right rounded-2xl px-4 py-3 shadow-sm"
              role="alert"
            >
              {redirectMessage}
            </div>
          ) : null}

          <p className="text-sm text-slate-600 text-right leading-relaxed">
            התחבר כדי להמשיך למערכת. ניתן להשתמש בחשבון גוגל, מיקרוסופט או בדוא"ל וסיסמה שסופקו לך על ידי הארגון.
          </p>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:border-blue-400 hover:shadow-sm transition-all rounded-xl py-3 font-medium text-slate-700"
              disabled={oauthInFlight !== null}
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
              <span>{oauthInFlight === 'google' ? 'מפנה לגוגל...' : 'התחברות עם Google'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleOAuth('azure')}
              className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:border-blue-400 hover:shadow-sm transition-all rounded-xl py-3 font-medium text-slate-700"
              disabled={oauthInFlight !== null}
            >
              <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="Microsoft" className="w-5 h-5" />
              <span>{oauthInFlight === 'azure' ? 'מפנה למיקרוסופט...' : 'התחברות עם Microsoft'}</span>
            </button>
          </div>

          <div className="relative flex items-center gap-3 text-slate-400 text-sm">
            <span className="flex-1 h-px bg-slate-200" aria-hidden="true" />
            <span>או</span>
            <span className="flex-1 h-px bg-slate-200" aria-hidden="true" />
          </div>

          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <label className="block text-right">
              <span className="text-sm font-medium text-slate-600">דוא"ל</span>
              <div className="relative mt-1">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-right shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="name@example.com"
                  autoComplete="email"
                />
                <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </label>

            <label className="block text-right">
              <span className="text-sm font-medium text-slate-600">סיסמה</span>
              <div className="relative mt-1">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-right shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </label>

            <button
              type="submit"
              className="w-full bg-gradient-to-l from-blue-600 to-indigo-500 text-white py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
              disabled={isSubmitting || oauthInFlight !== null}
            >
              <LogIn className="w-5 h-5" />
              <span>{isSubmitting ? 'מתחבר...' : 'כניסה'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
