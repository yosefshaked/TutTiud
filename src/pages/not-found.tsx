import { Link } from 'react-router-dom'

export const NotFoundPage = () => (
  <div className="flex min-h-screen flex-col items-center justify-center space-y-4 bg-muted/40 p-6 text-center">
    <h1 className="text-3xl font-bold">הדף לא נמצא</h1>
    <p className="text-muted-foreground">
      הדף שביקשת אינו קיים או הועבר למיקום אחר.
    </p>
    <Link className="text-primary underline" to="/">
      חזרה לדף הבית
    </Link>
  </div>
)
