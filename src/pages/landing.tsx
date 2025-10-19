import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const LandingPage = () => {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/30 p-6">
      <Card className="max-w-2xl text-right">
        <CardHeader>
          <CardTitle>ברוך הבא למערכת TutTiud</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-lg">
          <p>הגדרות הארגון טרם הושלמו. אנא המשך ל־Setup Wizard.</p>
          <p className="text-sm text-muted-foreground">
            לאחר השלמת תהליך ההגדרה ניתן יהיה לגשת למודולים השונים של המערכת.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
