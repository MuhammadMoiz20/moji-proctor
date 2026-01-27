import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAssignments, Assignment } from '../services/api'
import { BookOpen, Activity, Loader2, AlertCircle, Search, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    loadAssignments()
  }, [isAuthenticated, navigate])

  const loadAssignments = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getAssignments()
      setAssignments(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load assignments'
      setError(errorMessage)
      console.error('Error loading assignments:', err)
      
      // If it's an authentication error, redirect to login
      if (errorMessage.includes('log in') || errorMessage.includes('Unauthorized') || errorMessage.includes('403')) {
        setTimeout(() => navigate('/login'), 2000)
      }
    } finally {
      setLoading(false)
    }
  }

  // All hooks must be called before any conditional returns
  const filteredAssignments = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return assignments
    return assignments.filter((assignment) =>
      assignment.assignment_id.toLowerCase().includes(needle) ||
      assignment.course_id.toLowerCase().includes(needle)
    )
  }, [assignments, query])

  const totalSignals = assignments.reduce((sum, assignment) => sum + assignment.signal_count, 0)

  // Conditional returns after all hooks
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-200">
        <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/40 rounded-2xl p-6 text-slate-200">
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-200 font-medium mb-1">Error loading assignments</p>
            <p className="text-red-200/80 text-sm mb-4">{error}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadAssignments}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-400 text-sm font-medium transition-colors"
              >
                Try again
              </button>
              {(error.includes('log in') || error.includes('Unauthorized') || error.includes('403')) && (
                <Link
                  to="/login"
                  className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 text-sm font-medium transition-colors"
                >
                  Go to Login
                </Link>
              )}
              {error.includes('Network error') && (
                <div className="text-xs text-red-200/80 mt-2 w-full">
                  <p>Make sure:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>The server is running on http://localhost:3000</li>
                    <li>You are logged in with an instructor account</li>
                    <li>Your GitHub account is in the INSTRUCTOR_ALLOWLIST</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (assignments.length === 0) {
    return (
      <div className="text-center py-12">
        <BookOpen className="h-12 w-12 text-slate-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">No Assignments</h2>
        <p className="text-slate-400">No assignments with signal data found.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary-300 mb-2">Assignments</p>
          <h1 className="text-3xl font-display font-semibold text-white mb-2">
            Activity Overview
          </h1>
          <p className="text-sm text-slate-400">
            Monitor signal volume, session reach, and student engagement across courses.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search assignments or courses"
              className="w-full rounded-xl border border-slate-800 bg-slate-900/70 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
            />
          </div>
          <button
            onClick={loadAssignments}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-slate-700 hover:text-white transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase text-slate-400">Assignments</p>
          <p className="text-2xl font-display font-semibold text-white mt-2">{assignments.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase text-slate-400">Total Signals</p>
          <p className="text-2xl font-display font-semibold text-white mt-2">
            {totalSignals.toLocaleString()}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase text-slate-400">Active Courses</p>
          <p className="text-2xl font-display font-semibold text-white mt-2">
            {new Set(assignments.map((assignment) => assignment.course_id)).size}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredAssignments.map((assignment) => (
          <Link
            key={assignment.assignment_id}
            to={`/assignments/${assignment.assignment_id}`}
            className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/40 transition-all hover:-translate-y-0.5 hover:border-slate-700 hover:bg-slate-900"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-1">
                  {assignment.assignment_id}
                </h3>
                <p className="text-sm text-slate-400">Course: {assignment.course_id}</p>
              </div>
              <BookOpen className="h-6 w-6 text-primary-300 flex-shrink-0" />
            </div>
            <div className="flex items-center space-x-4 text-sm text-slate-400">
              <div className="flex items-center space-x-2 rounded-full border border-slate-800 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">
                <Activity className="h-3.5 w-3.5" />
                <span>{assignment.signal_count.toLocaleString()} signals</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
