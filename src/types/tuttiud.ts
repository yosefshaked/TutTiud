export type TuttiudStudent = {
  id: string
  name: string
  contactInfo: string | null
  assignedInstructorId: string | null
  notes: string | null
  metadata: Record<string, unknown> | null
}

export type TuttiudSessionRecord = {
  id: string
  date: string
  studentId: string
  instructorId: string | null
  serviceContext: string | null
  content: string | null
  createdAt: string | null
  updatedAt: string | null
  metadata: Record<string, unknown> | null
  studentName: string
}

export type TuttiudBackup = {
  generatedAt: string
  students: Record<string, unknown>[]
  instructors: Record<string, unknown>[]
  sessionRecords: Record<string, unknown>[]
}
