import { FormEvent, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { useAuth } from '@/app/providers/auth-provider'

type LocationState = {
  from?: {
    pathname?: string
  }
}

export const AuthLoginPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { signInWithPassword, status, clientAvailable } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const { error: authError } = await signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setIsSubmitting(false)
      return
    }

    const redirectTo = ((location.state as LocationState | null)?.from?.pathname) ?? '/'
    navigate(redirectTo, { replace: true })
  }

  if (!clientAvailable) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>הגדרת Supabase נדרשת</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              כדי להתחבר, יש להגדיר את משתני הסביבה VITE_SUPABASE_URL ו־
              VITE_SUPABASE_ANON_KEY.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>התחברות למערכת TutTiud</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">דוא"ל</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive">שגיאה: {error}</p>
            ) : null}
            <Button className="w-full" disabled={isSubmitting || status === 'loading'} type="submit">
              {isSubmitting ? 'מתחבר...' : 'כניסה'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
