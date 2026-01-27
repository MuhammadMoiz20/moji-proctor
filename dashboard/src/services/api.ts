import { fetchWithAuth } from '../utils/api'

export interface Assignment {
  assignment_id: string
  course_id: string
  signal_count: number
}

export interface Student {
  device_id: string
  user: {
    login: string
    name?: string
    email?: string
  } | null
  first_seen: string
  last_seen: string
  signal_count: number
  session_count: number
}

export interface Signal {
  event_id: string
  ts: string
  session_id: string
  type: string
  payload: unknown
}

export interface AssignmentSummary {
  assignment_id: string
  total_signals: number
  unique_students: number
  unique_sessions: number
  signals_by_type: Array<{
    type: string
    count: number
  }>
  time_range: {
    earliest: string | null
    latest: string | null
  }
}

export interface StudentReport {
  assignment_id: string
  device_id: string
  integrity: {
    passed: boolean
    issues: Array<{ type: string; description: string }>
  }
  time: {
    total_focused_seconds: number
    total_active_seconds: number
    session_count: number
    first_session_start: string | null
    last_session_end: string | null
  }
  bursts: {
    total_count: number
    by_severity: {
      low: number
      medium: number
      high: number
    }
  }
  checkpoints: {
    count: number
    latest_checkpoint_id: string | null
  }
  unverified_changes: number
}

export async function getAssignments(): Promise<Assignment[]> {
  try {
    const response = await fetchWithAuth('/api/instructor/assignments')
    if (!response.ok) {
      let errorMessage = `Failed to fetch assignments: ${response.status} ${response.statusText}`
      try {
        const errorData = await response.json()
        if (errorData.error) {
          errorMessage = errorData.error
        }
      } catch {
        // If response is not JSON, use the status text
      }
      throw new Error(errorMessage)
    }
    const data = await response.json()
    if (!data || !Array.isArray(data.assignments)) {
      throw new Error('Invalid response format from server')
    }
    return data.assignments || []
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Cannot connect to server. Make sure the server is running on http://localhost:3000')
    }
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Unknown error occurred while fetching assignments')
  }
}

export async function getAssignmentStudents(assignmentId: string): Promise<Student[]> {
  const response = await fetchWithAuth(`/api/instructor/assignments/${assignmentId}/students`)
  if (!response.ok) {
    throw new Error(`Failed to fetch students: ${response.statusText}`)
  }
  const data = await response.json()
  return data.students
}

export async function getAssignmentSummary(assignmentId: string): Promise<AssignmentSummary> {
  const response = await fetchWithAuth(`/api/instructor/assignments/${assignmentId}/summary`)
  if (!response.ok) {
    throw new Error(`Failed to fetch summary: ${response.statusText}`)
  }
  return response.json()
}

export async function getStudentTimeline(
  assignmentId: string,
  studentId: string,
  options?: { type?: string; limit?: number }
): Promise<Signal[]> {
  const params = new URLSearchParams()
  if (options?.type) params.append('type', options.type)
  if (options?.limit) params.append('limit', options.limit.toString())

  const url = `/api/instructor/assignments/${assignmentId}/students/${studentId}/timeline${
    params.toString() ? `?${params.toString()}` : ''
  }`
  const response = await fetchWithAuth(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch timeline: ${response.statusText}`)
  }
  const data = await response.json()
  return data.signals
}

export async function getStudentReport(
  assignmentId: string,
  studentId: string
): Promise<StudentReport> {
  const response = await fetchWithAuth(`/api/instructor/assignments/${assignmentId}/students/${studentId}/report`)
  if (!response.ok) {
    throw new Error(`Failed to fetch student report: ${response.statusText}`)
  }
  return response.json()
}
