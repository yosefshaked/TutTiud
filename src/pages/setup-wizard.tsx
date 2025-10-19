import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const SetupWizardPage = () => {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/30 p-6">
      <Card className="max-w-3xl text-right">
        <CardHeader>
          <CardTitle>Setup Wizard (בקרוב)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>
            אנו עובדים על אשף ההגדרות שילווה אותך בשלבים הראשונים של הקמת הארגון.
          </p>
          <p>
            בינתיים ניתן להמשיך לתעד פגישות או לחזור לעמוד הראשי.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => navigate(-1)}>
              חזרה
            </Button>
            <Button type="button" onClick={() => navigate('/')}>מעבר לעמוד הראשי</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
