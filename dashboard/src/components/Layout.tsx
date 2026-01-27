import { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LogOut, Home, User } from 'lucide-react'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-body">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 right-0 h-72 w-72 rounded-full bg-primary-500/10 blur-3xl" />
        <div className="absolute top-1/3 -left-24 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>
      <nav className="relative z-10 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center space-x-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500/15 border border-primary-500/30">
                  <Home className="h-5 w-5 text-primary-300" />
                </div>
                <div className="leading-tight">
                  <span className="block text-lg font-semibold font-display tracking-wide text-slate-100">
                    Moji Proctor
                  </span>
                  <span className="text-xs text-slate-400">Instructor Dashboard</span>
                </div>
              </Link>
            </div>
            <div className="flex items-center space-x-3">
              {user && (
                <div className="hidden sm:flex items-center space-x-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>{user.name || user.login}</span>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200 hover:border-slate-700 hover:text-white transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="relative z-10 max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-10">
        {children}
      </main>
    </div>
  )
}
