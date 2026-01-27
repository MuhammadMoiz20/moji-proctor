import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getAssignmentStudents,
  getAssignmentSummary,
  Student,
  AssignmentSummary,
} from '../services/api'
import {
  Users,
  Activity,
  Clock,
  TrendingUp,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Search,
  RefreshCw,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

export default function AssignmentDetailPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const [students, setStudents] = useState<Student[]>([])
  const [summary, setSummary] = useState<AssignmentSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<'signals' | 'sessions' | 'last_seen'>('signals')

  useEffect(() => {
    if (assignmentId) {
      loadData()
    }
  }, [assignmentId])

  const loadData = async () => {
    if (!assignmentId) return

    try {
      setLoading(true)
      setError(null)
      const [studentsData, summaryData] = await Promise.all([
        getAssignmentStudents(assignmentId),
        getAssignmentSummary(assignmentId),
      ])
      setStudents(studentsData)
      setSummary(summaryData)
    } catch (err) {
      setError('Failed to load assignment data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // All hooks must be called before any conditional returns
  const filteredStudents = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const match = (student: Student) => {
      if (!needle) return true
      return (
        student.device_id.toLowerCase().includes(needle) ||
        student.user?.login?.toLowerCase().includes(needle) ||
        student.user?.name?.toLowerCase().includes(needle) ||
        student.user?.email?.toLowerCase().includes(needle)
      )
    }

    const sorted = [...students].filter(match)
    sorted.sort((a, b) => {
      if (sortKey === 'sessions') {
        return b.session_count - a.session_count
      }
      if (sortKey === 'last_seen') {
        return parseISO(b.last_seen).getTime() - parseISO(a.last_seen).getTime()
      }
      return b.signal_count - a.signal_count
    })
    return sorted
  }, [students, query, sortKey])

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
      <div className="bg-red-500/10 border border-red-500/40 rounded-2xl p-4 text-slate-200">
        <div className="flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <p className="text-red-200">{error}</p>
        </div>
        <button
          onClick={loadData}
          className="mt-2 text-sm text-red-200 hover:text-white underline"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div>
      <Link
        to="/"
        className="inline-flex items-center space-x-2 text-slate-400 hover:text-white mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Assignments</span>
      </Link>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary-300 mb-2">Assignment</p>
          <h1 className="text-3xl font-display font-semibold text-white mb-2">
            {assignmentId}
          </h1>
          {summary && (
            <p className="text-sm text-slate-400">
              Course: {summary.assignment_id.split('/')[0] || 'N/A'}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search students"
              className="w-full rounded-xl border border-slate-800 bg-slate-900/70 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
            />
          </div>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
            className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
          >
            <option value="signals">Sort by signals</option>
            <option value="sessions">Sort by sessions</option>
            <option value="last_seen">Sort by last seen</option>
          </select>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-slate-700 hover:text-white transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between mb-2 text-slate-400">
              <span className="text-xs uppercase tracking-wide">Total Signals</span>
              <Activity className="h-5 w-5 text-primary-300" />
            </div>
            <p className="text-3xl font-display font-semibold text-white">
              {summary.total_signals.toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between mb-2 text-slate-400">
              <span className="text-xs uppercase tracking-wide">Students</span>
              <Users className="h-5 w-5 text-primary-300" />
            </div>
            <p className="text-3xl font-display font-semibold text-white">
              {summary.unique_students}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between mb-2 text-slate-400">
              <span className="text-xs uppercase tracking-wide">Sessions</span>
              <Clock className="h-5 w-5 text-primary-300" />
            </div>
            <p className="text-3xl font-display font-semibold text-white">
              {summary.unique_sessions}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between mb-2 text-slate-400">
              <span className="text-xs uppercase tracking-wide">Signal Types</span>
              <TrendingUp className="h-5 w-5 text-primary-300" />
            </div>
            <p className="text-3xl font-display font-semibold text-white">
              {summary.signals_by_type.length}
            </p>
          </div>
        </div>
      )}

      {summary && summary.signals_by_type.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Signals by Type</h2>
          <div className="space-y-3">
            {summary.signals_by_type.map((item) => {
              const percent = summary.total_signals > 0 ? (item.count / summary.total_signals) * 100 : 0
              return (
                <div key={item.type} className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-medium">{item.type}</span>
                    <span>{item.count.toLocaleString()}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800">
                    <div
                      className="h-2 rounded-full bg-primary-400"
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {summary && summary.time_range.earliest && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Time Range</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-slate-400">Earliest</span>
              <p className="text-sm font-medium text-white">
                {format(parseISO(summary.time_range.earliest!), 'PPpp')}
              </p>
            </div>
            <div>
              <span className="text-sm text-slate-400">Latest</span>
              <p className="text-sm font-medium text-white">
                {format(parseISO(summary.time_range.latest!), 'PPpp')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="px-6 py-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Students</h2>
            <span className="text-xs text-slate-400">
              {filteredStudents.length} {filteredStudents.length === 1 ? 'student' : 'students'}
            </span>
          </div>
        </div>
        <div className="divide-y divide-slate-800">
          {filteredStudents.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-400">
              No students found for this assignment
            </div>
          ) : (
            filteredStudents.map((student) => (
              <Link
                key={student.device_id}
                to={`/assignments/${assignmentId}/students/${student.device_id}`}
                className="block px-6 py-4 hover:bg-slate-900 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-primary-500/15 flex items-center justify-center border border-primary-500/30">
                          <Users className="h-5 w-5 text-primary-300" />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {student.user?.name || student.user?.login || 'Unknown User'}
                        </p>
                        {student.user?.email && (
                          <p className="text-sm text-slate-400">{student.user.email}</p>
                        )}
                        {student.user?.login && (
                          <p className="text-xs text-slate-500">@{student.user.login}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
                    <div className="rounded-full border border-slate-800 px-3 py-1 text-xs uppercase tracking-wide">
                      <span className="font-semibold text-white">{student.signal_count}</span> signals
                    </div>
                    <div className="rounded-full border border-slate-800 px-3 py-1 text-xs uppercase tracking-wide">
                      <span className="font-semibold text-white">{student.session_count}</span> sessions
                    </div>
                    <div className="text-xs text-slate-500">
                      Last seen: {format(parseISO(student.last_seen), 'MMM d, yyyy')}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
