import { Link } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const LandingPage = () => {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/30 p-6">
      <Card className="max-w-2xl text-right">
        <CardHeader>
          <CardTitle>ברוך הבא למערכת TutTiud</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-lg">
          <p>
            לאחר התחברות ובחירת ארגון ניתן להשלים את ההגדרות הראשוניות דרך אשף ההקמה ולהתחיל לנהל תלמידים ותיעודי מפגשים.
          </p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>ריכזנו עבורך את השלבים המרכזיים:</p>
            <ol className="list-decimal space-y-2 pr-5">
              <li>השלימו את אשף ההקמה כדי לאמת את החיבור למסד הנתונים של הארגון.</li>
              <li>עברו ללשונית "התלמידים שלי" כדי לצפות בתלמידים המשויכים אליכם.</li>
              <li>פתחו תיעוד מפגש חדש דרך הכפתור הייעודי כדי לשמור מפגשים חשובים.</li>
            </ol>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-base">
            <Button asChild variant="secondary">
              <Link to="/setup-wizard">פתיחת אשף ההקמה</Link>
            </Button>
            <Button asChild>
              <Link to="/students">לתלמידים המשויכים</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
