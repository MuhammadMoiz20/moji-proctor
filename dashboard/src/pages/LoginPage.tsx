import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Github, Copy, Check, ShieldCheck, Activity, Zap } from 'lucide-react'

export default function LoginPage() {
  const [deviceCode, setDeviceCode] = useState<string | null>(null)
  const [userCode, setUserCode] = useState<string | null>(null)
  const [verificationUri, setVerificationUri] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [copied, setCopied] = useState(false)
  const { login, isAuthenticated, isInitializing } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isInitializing && isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, isInitializing, navigate])

  const startDeviceFlow = async () => {
    try {
      const response = await fetch('/api/auth/device/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        throw new Error('Failed to start device flow')
      }

      const data = await response.json()
      setDeviceCode(data.device_code)
      setUserCode(data.user_code)
      setVerificationUri(data.verification_uri)
      setIsPolling(true)

      // Start polling
      pollForAuth(data.device_code, data.interval || 5)
    } catch (error) {
      console.error('Device flow error:', error)
      alert('Failed to start authentication. Please try again.')
    }
  }

  const pollForAuth = async (code: string, interval: number) => {
    const poll = async () => {
      try {
        const response = await fetch('/api/auth/device/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_code: code }),
        })

        if (response.status === 202) {
          // Still pending, continue polling
          setTimeout(poll, interval * 1000)
          return
        }

        if (!response.ok) {
          throw new Error('Authentication failed')
        }

        const data = await response.json()
        login(data.access_token, data.refresh_token, data.user)
        setIsPolling(false)
        navigate('/')
      } catch (error) {
        console.error('Polling error:', error)
        setIsPolling(false)
      }
    }

    setTimeout(poll, interval * 1000)
  }

  const copyToClipboard = () => {
    if (userCode) {
      navigator.clipboard.writeText(userCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-16 right-12 h-72 w-72 rounded-full bg-primary-500/15 blur-3xl" />
        <div className="absolute bottom-10 left-10 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>
      <div className="relative z-10 grid w-full max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-8 shadow-xl">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-primary-300">Secure Access</p>
            <h1 className="mt-3 text-3xl font-display font-semibold text-white">
              Moji Proctor Instructor Console
            </h1>
            <p className="mt-3 text-sm text-slate-300">
              Monitor integrity, session health, and engagement signals in one professional view.
            </p>
          </div>
          <div className="space-y-4 text-sm text-slate-300">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-lg bg-primary-500/15 p-2 text-primary-200">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-slate-100 font-medium">Integrity defense</p>
                <p className="text-xs text-slate-400">Surface compromised sessions, missing checkpoints, and unverified work.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-lg bg-emerald-500/15 p-2 text-emerald-200">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <p className="text-slate-100 font-medium">Real-time coverage</p>
                <p className="text-xs text-slate-400">Track focused and active time with continuous telemetry insights.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-lg bg-amber-500/15 p-2 text-amber-200">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <p className="text-slate-100 font-medium">Burst detection</p>
                <p className="text-xs text-slate-400">Highlight rapid edit bursts and high velocity code changes.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-primary-200">
              <Github className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-display font-semibold text-white">Authenticate with GitHub</h2>
            <p className="mt-2 text-xs text-slate-400">
              Device flow keeps your account secure without sharing credentials.
            </p>
          </div>

          {!deviceCode ? (
            <div className="space-y-5">
              <p className="text-sm text-slate-300 text-center">
                Sign in to unlock instructor insights and student telemetry reports.
              </p>
              <button
                onClick={startDeviceFlow}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 hover:bg-primary-400 transition-colors"
              >
                <Github className="h-5 w-5" />
                <span>Start GitHub Device Flow</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/70 p-6">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Verification Code</span>
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-1 text-primary-300 hover:text-primary-200"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="mt-4 text-center text-3xl font-mono font-semibold tracking-[0.3em] text-white">
                  {userCode?.match(/.{1,3}/g)?.join('-')}
                </div>
              </div>

              <div className="space-y-3">
                <a
                  href={verificationUri || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-xl bg-emerald-500 px-6 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition-colors"
                >
                  Open GitHub Authorization
                </a>
                {isPolling && (
                  <p className="text-xs text-slate-400 text-center">
                    Waiting for authorization…
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
