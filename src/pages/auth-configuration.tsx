import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const AuthConfigurationPage = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>הגדרת התחברות חסרה</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            נראה כי פרטי החיבור ל־Supabase אינם מוגדרים. כדי להפעיל את המערכת יש לעדכן את
            הקבצים <code>.env.local</code> או <code>.env</code> עם המפתחות הבאים:
          </p>
          <ul className="list-disc space-y-1 pr-5">
            <li>
              <code>VITE_SUPABASE_URL</code> – כתובת הפרויקט הראשי.
            </li>
            <li>
              <code>VITE_SUPABASE_ANON_KEY</code> – מפתח אנונימי לקריאה בלבד.
            </li>
          </ul>
          <p>
            לאחר העדכון יש להפעיל מחדש את סביבת הפיתוח. ללא הגדרות אלו ניתן לגלוש בממשק אך לא
            לבצע פעולות הדורשות התחברות.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
