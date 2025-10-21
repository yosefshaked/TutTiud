import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSecureApi } from '@/hooks/use-secure-api'
import type { TuttiudBackup } from '@/types/tuttiud'

type BackupState = 'idle' | 'loading' | 'success' | 'error'

export const BackupPage = () => {
  const { callApi } = useSecureApi()
  const [status, setStatus] = useState<BackupState>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const handleBackup = useCallback(async () => {
    setStatus('loading')
    setMessage(null)

    try {
      const response = await callApi<{ backup?: TuttiudBackup }>('/api/backup')
      const backup = response.backup

      if (!backup) {
        throw new Error('הגיבוי הושלם ללא נתונים להורדה.')
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `tuttiud-backup-${backup.generatedAt ?? new Date().toISOString()}.json`
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setStatus('success')
      setMessage('קובץ הגיבוי הופק בהצלחה והורד למחשבכם.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'יצירת הגיבוי נכשלה.'
      setStatus('error')
      setMessage(message)
    }
  }, [callApi])

  return (
    <div className="container py-8 text-right">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">גיבוי נתוני הארגון</h1>
          <p className="text-muted-foreground">
            הכלי מאפשר להפיק עותק מלא של נתוני התלמידים, המדריכים ותיעודי המפגשים לשמירה עצמאית.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>הנחיות והורדת גיבוי</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal space-y-2 pr-5 text-sm">
              <li>וודאו שאתם מנהלי מערכת או בעלי הארגון לפני ביצוע הגיבוי.</li>
              <li>לחצו על הכפתור כדי להפיק קובץ JSON המכיל את טבלאות היסוד של המערכת.</li>
              <li>שמרו את הקובץ במקום מאובטח והגן עליו בהתאם למדיניות הפרטיות של הארגון.</li>
            </ol>

            {message ? (
              <div
                className={`rounded-md border px-4 py-3 text-sm ${
                  status === 'error'
                    ? 'border-destructive/60 bg-destructive/10 text-destructive'
                    : 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700'
                }`}
              >
                {message}
              </div>
            ) : null}

            <Button onClick={() => void handleBackup()} disabled={status === 'loading'}>
              {status === 'loading' ? 'מפיק את הגיבוי...' : 'הורדת גיבוי עדכני'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
