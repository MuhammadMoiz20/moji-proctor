import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getStudentTimeline, getStudentReport, Signal, StudentReport } from '../services/api'
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Calendar,
  Activity,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  FileCheck,
  Copy,
  Check,
  Download,
  Search,
  ArrowUpDown,
  Timer,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0s'
  }
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  const parts = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (hours === 0 && minutes === 0) parts.push(`${remainingSeconds}s`)
  return parts.join(' ')
}

export default function StudentDetailPage() {
  const { assignmentId, studentId } = useParams<{
    assignmentId: string
    studentId: string
  }>()
  const [signals, setSignals] = useState<Signal[]>([])
  const [report, setReport] = useState<StudentReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (assignmentId && studentId) {
      loadData()
    }
  }, [assignmentId, studentId])

  const loadData = async () => {
    if (!assignmentId || !studentId) return

    try {
      setLoading(true)
      setError(null)
      const [timelineData, reportData] = await Promise.all([
        getStudentTimeline(assignmentId, studentId, {
          limit: 1000,
        }),
        getStudentReport(assignmentId, studentId),
      ])
      setSignals(timelineData)
      setReport(reportData)
    } catch (err) {
      setError('Failed to load student data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (!studentId) return
    navigator.clipboard.writeText(studentId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExport = () => {
    const payload = {
      generated_at: new Date().toISOString(),
      assignment_id: assignmentId,
      device_id: studentId,
      report,
      signals,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `student-report-${studentId || 'unknown'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const signalTypes = useMemo(() => {
    return Array.from(new Set(signals.map((s) => s.type))).sort()
  }, [signals])

  const timelineSummary = useMemo(() => {
    const sessions = new Set<string>()
    const counts: Record<string, number> = {}
    const burstBySeverity = { low: 0, medium: 0, high: 0 }
    let focusedFromTicks = 0
    let activeFromTicks = 0
    let focusedFromSessionEnd = 0
    let activeFromSessionEnd = 0
    let firstTimestamp: number | null = null
    let lastTimestamp: number | null = null

    for (const signal of signals) {
      sessions.add(signal.session_id)
      counts[signal.type] = (counts[signal.type] || 0) + 1

      const ts = Date.parse(signal.ts)
      if (!Number.isNaN(ts)) {
        if (firstTimestamp === null || ts < firstTimestamp) firstTimestamp = ts
        if (lastTimestamp === null || ts > lastTimestamp) lastTimestamp = ts
      }

      if (signal.type === 'TIME_TICK' && signal.payload && typeof signal.payload === 'object') {
        const payload = signal.payload as {
          focused_delta_seconds?: number
          active_delta_seconds?: number
        }
        if (typeof payload.focused_delta_seconds === 'number') {
          focusedFromTicks += payload.focused_delta_seconds
        }
        if (typeof payload.active_delta_seconds === 'number') {
          activeFromTicks += payload.active_delta_seconds
        }
      }

      if (signal.type === 'SESSION_END' && signal.payload && typeof signal.payload === 'object') {
        const payload = signal.payload as {
          focused_seconds?: number
          active_seconds?: number
        }
        if (typeof payload.focused_seconds === 'number') {
          focusedFromSessionEnd += payload.focused_seconds
        }
        if (typeof payload.active_seconds === 'number') {
          activeFromSessionEnd += payload.active_seconds
        }
      }

      if (signal.type === 'BURST_FLAG' && signal.payload && typeof signal.payload === 'object') {
        const payload = signal.payload as { severity?: 'low' | 'medium' | 'high' }
        if (payload.severity && burstBySeverity[payload.severity] !== undefined) {
          burstBySeverity[payload.severity] += 1
        }
      }
    }

    const focusedSeconds = focusedFromSessionEnd > 0 ? focusedFromSessionEnd : focusedFromTicks
    const activeSeconds = activeFromSessionEnd > 0 ? activeFromSessionEnd : activeFromTicks

    return {
      sessions: sessions.size,
      counts,
      burstBySeverity,
      focusedSeconds,
      activeSeconds,
      firstTimestamp,
      lastTimestamp,
    }
  }, [signals])

  const resolvedFocusedSeconds = Math.max(
    report?.time.total_focused_seconds ?? 0,
    timelineSummary.focusedSeconds
  )
  const resolvedActiveSeconds = Math.max(
    report?.time.total_active_seconds ?? 0,
    timelineSummary.activeSeconds
  )
  const resolvedSessionCount = Math.max(
    report?.time.session_count ?? 0,
    timelineSummary.sessions
  )
  const focusRatio = resolvedFocusedSeconds > 0
    ? Math.round((resolvedActiveSeconds / resolvedFocusedSeconds) * 100)
    : 0

  const signalTypeTotals = useMemo(() => {
    return Object.entries(timelineSummary.counts).sort((a, b) => b[1] - a[1])
  }, [timelineSummary])

  const filteredSignals = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    const result = signals.filter((signal) => {
      if (filterType && signal.type !== filterType) {
        return false
      }
      if (!needle) return true
      const payloadText = signal.payload ? JSON.stringify(signal.payload).toLowerCase() : ''
      return (
        signal.type.toLowerCase().includes(needle) ||
        signal.session_id.toLowerCase().includes(needle) ||
        payloadText.includes(needle)
      )
    })
    return result.sort((a, b) =>
      sortOrder === 'desc' ? b.ts.localeCompare(a.ts) : a.ts.localeCompare(b.ts)
    )
  }, [signals, filterType, searchQuery, sortOrder])

  const getSignalTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      SESSION_START: 'bg-sky-500/15 text-sky-200 border border-sky-500/30',
      SESSION_END: 'bg-violet-500/15 text-violet-200 border border-violet-500/30',
      TIME_TICK: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
      BURST_FLAG: 'bg-red-500/15 text-red-200 border border-red-500/30',
      CHECKPOINT_CREATED: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
      UNVERIFIED_CHANGES: 'bg-orange-500/15 text-orange-200 border border-orange-500/30',
      INTEGRITY_COMPROMISED: 'bg-rose-500/15 text-rose-200 border border-rose-500/30',
    }
    return colors[type] || 'bg-slate-800 text-slate-200 border border-slate-700'
  }

  const reportHasTime =
    (report?.time.total_focused_seconds ?? 0) > 0 ||
    (report?.time.total_active_seconds ?? 0) > 0
  const timelineHasTime =
    timelineSummary.focusedSeconds > 0 || timelineSummary.activeSeconds > 0
  const usingTimelineFallback = !reportHasTime && timelineHasTime
  const integrityPassed = report?.integrity.passed
  const firstSeenIso =
    report?.time.first_session_start ??
    (timelineSummary.firstTimestamp ? new Date(timelineSummary.firstTimestamp).toISOString() : null)
  const lastSeenIso =
    report?.time.last_session_end ??
    (timelineSummary.lastTimestamp ? new Date(timelineSummary.lastTimestamp).toISOString() : null)

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
        to={`/assignments/${assignmentId}`}
        className="inline-flex items-center space-x-2 text-slate-400 hover:text-white mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Assignment</span>
      </Link>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary-300 mb-2">Student Report</p>
          <h1 className="text-3xl font-display font-semibold text-white mb-2">
            Device {studentId}
          </h1>
          <p className="text-sm text-slate-400">
            Assignment {assignmentId} · {signals.length.toLocaleString()} total events
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-slate-700 hover:text-white transition-colors"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy Device ID'}
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-primary-500/30 hover:bg-primary-400 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export JSON
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400 mb-2">
            <span>Integrity</span>
            {integrityPassed === undefined ? (
              <AlertCircle className="h-5 w-5 text-slate-400" />
            ) : integrityPassed ? (
              <CheckCircle className="h-5 w-5 text-emerald-400" />
            ) : (
              <XCircle className="h-5 w-5 text-red-400" />
            )}
          </div>
          <p
            className={`text-2xl font-display font-semibold ${
              integrityPassed === undefined
                ? 'text-slate-300'
                : integrityPassed
                  ? 'text-emerald-300'
                  : 'text-red-300'
            }`}
          >
            {integrityPassed === undefined ? 'Unknown' : integrityPassed ? 'Passed' : 'Flagged'}
          </p>
          {report && report.integrity.issues.length > 0 && (
            <div className="mt-3 text-xs text-red-200/80 space-y-1">
              {report.integrity.issues.map((issue, idx) => (
                <div key={idx}>{issue.description}</div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400 mb-2">
            <span>Sessions</span>
            <Activity className="h-5 w-5 text-primary-300" />
          </div>
          <p className="text-2xl font-display font-semibold text-white">{resolvedSessionCount}</p>
          <p className="text-xs text-slate-400 mt-2">
            First seen {firstSeenIso ? format(parseISO(firstSeenIso), 'MMM d, yyyy') : '—'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400 mb-2">
            <span>Focused Time</span>
            <Clock className="h-5 w-5 text-primary-300" />
          </div>
          <p className="text-2xl font-display font-semibold text-white">{formatTime(resolvedFocusedSeconds)}</p>
          <p className="text-xs text-slate-400 mt-2">
            Active ratio {focusRatio > 0 ? `${focusRatio}%` : '—'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400 mb-2">
            <span>Active Time</span>
            <Timer className="h-5 w-5 text-primary-300" />
          </div>
          <p className="text-2xl font-display font-semibold text-white">{formatTime(resolvedActiveSeconds)}</p>
          <p className="text-xs text-slate-400 mt-2">
            Last seen {lastSeenIso ? format(parseISO(lastSeenIso), 'MMM d, yyyy') : '—'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Burst Activity</h2>
            <Zap className="h-5 w-5 text-primary-300" />
          </div>
          <div className="text-3xl font-display font-semibold text-white">
            {report?.bursts.total_count ?? 0}
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs text-slate-300">
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-slate-500">Low</p>
              <p className="text-lg font-semibold text-emerald-300">
                {report?.bursts.by_severity.low ?? timelineSummary.burstBySeverity.low}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-slate-500">Medium</p>
              <p className="text-lg font-semibold text-amber-300">
                {report?.bursts.by_severity.medium ?? timelineSummary.burstBySeverity.medium}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-slate-500">High</p>
              <p className="text-lg font-semibold text-red-300">
                {report?.bursts.by_severity.high ?? timelineSummary.burstBySeverity.high}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Checkpoints</h2>
            <FileCheck className="h-5 w-5 text-primary-300" />
          </div>
          <div className="text-3xl font-display font-semibold text-white">
            {report?.checkpoints.count ?? 0}
          </div>
          <p className="text-xs text-slate-400">
            Last checkpoint {report?.checkpoints.latest_checkpoint_id ?? 'Not recorded'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Unverified Changes</h2>
            <span className="text-xl">😲</span>
          </div>
          <div className="text-3xl font-display font-semibold text-white">
            {report?.unverified_changes ?? 0}
          </div>
          <p className="text-xs text-slate-400">
            Gaps without telemetry or missing checkpoints.
          </p>
        </div>
      </div>

      {usingTimelineFallback && (
        <div className="mb-8 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-100 text-sm">
          Timeline events include focused/active deltas, but the server report did not contain session totals.
          Showing totals derived from TIME_TICK events for accuracy.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-2 text-slate-300">
              <Filter className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wide">Filters</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search type, session, payload"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
              >
                <option value="">All Types</option>
                {signalTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-700 hover:text-white transition-colors"
              >
                <ArrowUpDown className="h-4 w-4" />
                {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
              </button>
              {filterType && (
                <button
                  onClick={() => setFilterType('')}
                  className="text-xs font-semibold text-primary-300 hover:text-primary-200"
                >
                  Clear type
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Signal Mix</h3>
              {signalTypeTotals.length === 0 ? (
                <p className="text-xs text-slate-400">No signal data available.</p>
              ) : (
                <div className="space-y-3">
                  {signalTypeTotals.map(([type, count]) => {
                    const percent = signals.length > 0 ? (count / signals.length) * 100 : 0
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-300">
                          <span>{type}</span>
                          <span>{count}</span>
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
              )}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Coverage</h3>
              <div className="space-y-2 text-xs text-slate-400">
                <p>
                  Sessions observed: <span className="text-white">{timelineSummary.sessions}</span>
                </p>
                <p>
                  Focused time (timeline): <span className="text-white">{formatTime(timelineSummary.focusedSeconds)}</span>
                </p>
                <p>
                  Active time (timeline): <span className="text-white">{formatTime(timelineSummary.activeSeconds)}</span>
                </p>
                <p>
                  Reported sessions: <span className="text-white">{report?.time.session_count ?? 0}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Timeline Snapshot</h2>
          <div className="space-y-3 text-xs text-slate-400">
            <div>
              <p className="uppercase tracking-wide text-slate-500">First event</p>
              <p className="text-sm text-white">
                {firstSeenIso ? format(parseISO(firstSeenIso), 'PPpp') : '—'}
              </p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-slate-500">Last event</p>
              <p className="text-sm text-white">
                {lastSeenIso ? format(parseISO(lastSeenIso), 'PPpp') : '—'}
              </p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-slate-500">Filtered events</p>
              <p className="text-sm text-white">{filteredSignals.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="px-6 py-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Activity Timeline</h2>
            <span className="text-xs text-slate-400">
              {filteredSignals.length} {filteredSignals.length === 1 ? 'event' : 'events'}
            </span>
          </div>
        </div>
        <div className="divide-y divide-slate-800">
          {filteredSignals.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-400">
              No signals found for this student
            </div>
          ) : (
            filteredSignals.map((signal) => (
              <div key={signal.event_id} className="px-6 py-4 hover:bg-slate-900 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getSignalTypeColor(
                          signal.type
                        )}`}
                      >
                        {signal.type}
                      </span>
                      <span className="text-xs text-slate-500">
                        Session: {signal.session_id.substring(0, 8)}...
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-slate-400 mb-2">
                      <Calendar className="h-4 w-4" />
                      <span>{format(parseISO(signal.ts), 'PPpp')}</span>
                    </div>
                    {signal.payload && typeof signal.payload === 'object' ? (
                      <div className="mt-2">
                        <details className="text-sm">
                          <summary className="cursor-pointer text-slate-400 hover:text-white">
                            View payload
                          </summary>
                          <pre className="mt-2 p-3 bg-slate-950 rounded text-xs overflow-x-auto border border-slate-800">
                            {JSON.stringify(signal.payload, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
