import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { useSecureApi } from '@/hooks/use-secure-api'
import type { TuttiudStudent } from '@/types/tuttiud'

type StudentsState = {
  status: 'idle' | 'loading' | 'error' | 'success'
  students: TuttiudStudent[]
  error: string | null
}

const initialState: StudentsState = {
  status: 'idle',
  students: [],
  error: null
}

export const StudentsPage = () => {
  const { callApi } = useSecureApi()
  const [state, setState] = useState<StudentsState>(initialState)

  const loadStudents = useCallback(async () => {
    setState((previous) => ({ ...previous, status: 'loading', error: null }))
    try {
      const response = await callApi<{ success?: boolean; students?: TuttiudStudent[] }>(
        '/api/students'
      )
      setState({
        status: 'success',
        students: response.students ?? [],
        error: null
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'טעינת הנתונים נכשלה.'
      setState({ status: 'error', students: [], error: message })
    }
  }, [callApi])

  useEffect(() => {
    void loadStudents()
  }, [loadStudents])

  const { status, students, error } = state

  return (
    <div className="container space-y-6 py-8 text-right">
      <header className="flex flex-col items-start justify-between gap-4 text-right md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold">תלמידים משויכים</h1>
          <p className="mt-1 text-muted-foreground">
            כאן תמצאו את התלמידים המשויכים אליכם לצורך תיעוד מפגשים וניהול שוטף.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 md:justify-start">
          <Button variant="secondary" onClick={() => void loadStudents()} type="button">
            רענון הרשימה
          </Button>
          <Button asChild>
            <Link to="/session-records/new">יצירת תיעוד מפגש</Link>
          </Button>
        </div>
      </header>

      {status === 'loading' ? (
        <div className="rounded-lg border bg-card p-6 text-lg">טוען את רשימת התלמידים...</div>
      ) : null}

      {status === 'error' ? (
        <div className="rounded-lg border border-destructive/60 bg-destructive/10 p-4 text-destructive">
          <p className="font-semibold">שגיאה בטעינת התלמידים</p>
          <p className="text-sm">{error}</p>
        </div>
      ) : null}

      {status === 'success' && students.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-6">
          <p className="font-semibold">אין תלמידים משויכים אליך כרגע.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            אם ציפית לראות תלמידים משויכים, פנו למנהל המערכת כדי לוודא שהשיוך בוצע.
          </p>
        </div>
      ) : null}

      {status === 'success' && students.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {students.map((student) => (
            <Card key={student.id} className="h-full">
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">{student.name}</CardTitle>
                <CardDescription className="text-right">
                  {student.contactInfo ? `פרטי קשר: ${student.contactInfo}` : 'לא נמסרו פרטי קשר'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold">מזהה תלמיד:</span> {student.id}
                </p>
                {student.notes ? (
                  <p>
                    <span className="font-semibold">הערות:</span> {student.notes}
                  </p>
                ) : (
                  <p className="text-muted-foreground">אין הערות שמורות.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  )
}
