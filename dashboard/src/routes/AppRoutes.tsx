import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoginPage from '../pages/LoginPage'
import AssignmentsPage from '../pages/AssignmentsPage'
import AssignmentDetailPage from '../pages/AssignmentDetailPage'
import StudentDetailPage from '../pages/StudentDetailPage'
import Layout from '../components/Layout'

function AppRoutes() {
  const { isAuthenticated, isInitializing } = useAuth()

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-200">
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-5 py-4 shadow-lg">
          <span className="h-2 w-2 rounded-full bg-primary-400 animate-pulse" />
          <span className="text-sm tracking-wide">Warming up secure session…</span>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" replace />} />
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Layout>
              <AssignmentsPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/assignments/:assignmentId"
        element={
          isAuthenticated ? (
            <Layout>
              <AssignmentDetailPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/assignments/:assignmentId/students/:studentId"
        element={
          isAuthenticated ? (
            <Layout>
              <StudentDetailPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  )
}

export default AppRoutes
