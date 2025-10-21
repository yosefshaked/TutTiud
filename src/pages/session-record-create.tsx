import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useSecureApi } from '@/hooks/use-secure-api'
import type { TuttiudSessionRecord, TuttiudStudent } from '@/types/tuttiud'

type FormStatus = 'idle' | 'submitting' | 'success' | 'error'

type StudentsStatus = 'loading' | 'ready' | 'empty' | 'error'

const initialFormState = {
  studentId: '',
  date: '',
  serviceContext: '',
  content: ''
}

export const SessionRecordCreatePage = () => {
  const { callApi } = useSecureApi()
  const [students, setStudents] = useState<TuttiudStudent[]>([])
  const [studentsStatus, setStudentsStatus] = useState<StudentsStatus>('loading')
  const [formValues, setFormValues] = useState(initialFormState)
  const [formStatus, setFormStatus] = useState<FormStatus>('idle')
  const [formMessage, setFormMessage] = useState<string | null>(null)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    setFormValues((previous) => ({ ...previous, date: today }))
  }, [today])

  const loadStudents = useCallback(async () => {
    setStudentsStatus('loading')
    setFormStatus('idle')
    setFormMessage(null)
    try {
      const response = await callApi<{ students?: TuttiudStudent[] }>('/api/students')
      const list = response.students ?? []
      setStudents(list)
      setStudentsStatus(list.length === 0 ? 'empty' : 'ready')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'טעינת רשימת התלמידים נכשלה.'
      setStudents([])
      setStudentsStatus('error')
      setFormStatus('error')
      setFormMessage(message)
    }
  }, [callApi])

  useEffect(() => {
    void loadStudents()
  }, [loadStudents])

  const updateField = useCallback(<Key extends keyof typeof initialFormState>(key: Key, value: string) => {
    setFormValues((previous) => ({ ...previous, [key]: value }))
  }, [])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (!formValues.studentId) {
        setFormStatus('error')
        setFormMessage('בחרו תלמיד מהרשימה לפני יצירת התיעוד.')
        return
      }

      if (!formValues.date) {
        setFormStatus('error')
        setFormMessage('בחרו תאריך למפגש לפני השמירה.')
        return
      }

      setFormStatus('submitting')
      setFormMessage(null)

      try {
        const response = await callApi<{
          success?: boolean
          record?: TuttiudSessionRecord | null
        }>('/api/session-records', {
          method: 'POST',
          body: {
            studentId: formValues.studentId,
            date: formValues.date,
            content: formValues.content,
            serviceContext: formValues.serviceContext
          }
        })

        if (!response?.record) {
          throw new Error('שמירת התיעוד הסתיימה ללא תגובה תקינה מהשרת.')
        }

        setFormStatus('success')
        setFormMessage(`התיעוד למפגש עם ${response.record.studentName} נשמר בהצלחה.`)
        setFormValues((previous) => ({
          ...previous,
          serviceContext: '',
          content: ''
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'שמירת התיעוד נכשלה.'
        setFormStatus('error')
        setFormMessage(message)
      }
    },
    [callApi, formValues.content, formValues.date, formValues.serviceContext, formValues.studentId]
  )

  return (
    <div className="container py-8 text-right">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">יצירת תיעוד מפגש חדש</h1>
          <p className="text-muted-foreground">
            מלאו את פרטי המפגש ושמרו אותם במסד הנתונים של הארגון.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>פרטי המפגש</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="student">בחירת תלמיד</Label>
                <select
                  id="student"
                  name="student"
                  value={formValues.studentId}
                  onChange={(event) => updateField('studentId', event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={studentsStatus !== 'ready'}
                  required
                >
                  <option value="">בחרו תלמיד משויך</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
                {studentsStatus === 'loading' ? (
                  <p className="text-sm text-muted-foreground">טוען תלמידים משויכים...</p>
                ) : null}
                {studentsStatus === 'empty' ? (
                  <p className="text-sm text-muted-foreground">
                    לא נמצאו תלמידים משויכים. פנו למנהל המערכת כדי לשייך תלמידים אליכם.
                  </p>
                ) : null}
                {studentsStatus === 'error' ? (
                  <p className="text-sm text-destructive">לא ניתן לטעון את רשימת התלמידים כעת.</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">תאריך המפגש</Label>
                <input
                  id="date"
                  name="date"
                  type="date"
                  dir="ltr"
                  value={formValues.date}
                  onChange={(event) => updateField('date', event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="serviceContext">הקשר המפגש (לא חובה)</Label>
                <input
                  id="serviceContext"
                  name="serviceContext"
                  type="text"
                  value={formValues.serviceContext}
                  onChange={(event) => updateField('serviceContext', event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="לדוגמה: פגישת מעקב חודשית"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">סיכום ותוכן המפגש</Label>
                <textarea
                  id="content"
                  name="content"
                  value={formValues.content}
                  onChange={(event) => updateField('content', event.target.value)}
                  className="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="תארו את עיקרי המפגש, משימות המשך ותובנות חשובות"
                />
              </div>

              {formMessage ? (
                <div
                  className={`rounded-md border px-4 py-3 text-sm ${
                    formStatus === 'error'
                      ? 'border-destructive/60 bg-destructive/10 text-destructive'
                      : 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700'
                  }`}
                >
                  {formMessage}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="submit" disabled={formStatus === 'submitting' || studentsStatus !== 'ready'}>
                  {formStatus === 'submitting' ? 'שומר...' : 'שמירת התיעוד'}
                </Button>
                <Button type="button" variant="ghost" asChild>
                  <Link to="/students">חזרה לרשימת התלמידים</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
