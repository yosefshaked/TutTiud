import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const AuthConfigurationPage = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>חסרים משתני חיבור ל־Supabase</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>נראה שהיישום לא מצא את ערכי החיבור הנדרשים של Supabase.</p>
          <p>
            <strong>פיתוח מקומי:</strong> ערוך/י את הקובץ <code>.env.local</code> והוסף/י בו את המשתנים
            הנדרשים. ודא/י שהקובץ נשאר מחוץ ל-git.
          </p>
          <p>
            <strong>פריסה ב-Azure Static Web Apps:</strong> היכנס/י אל <em>Azure Portal → Static Web App →
            Configuration → Application settings</em> והוסף/י שם את אותם ערכים (או עדכן/י אותם בקובץ ה-
            workflow ש-Azure יצר).
          </p>
          <ul className="list-disc space-y-1 pr-5">
            <li>
              <code>VITE_SUPABASE_URL</code>
            </li>
            <li>
              <code>VITE_SUPABASE_ANON_KEY</code>
            </li>
          </ul>
          <p>
            לאחר שמירת הערכים הרץ/י Redeploy (או הפעל/י מחדש את שרת הפיתוח) כדי שהמערכת תיטען עם ההגדרות
            החדשות.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
