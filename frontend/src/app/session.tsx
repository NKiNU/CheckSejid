import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import * as api from '@/features/identity/api.ts'

type Status = 'loading' | 'in' | 'out'
type Session = { status: Status; user: api.User | null; signIn(u: api.User): void; signOut(): Promise<void> }

const Ctx = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.User | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    // refresh() dedupes concurrent calls, so StrictMode's double effect is safe.
    api
      .refresh()
      .then(async (ok) => (ok ? api.me() : null))
      .catch(() => null)
      .then((u) => {
        setUser(u)
        setStatus(u ? 'in' : 'out')
      })
  }, [])

  const signIn = (u: api.User) => {
    setUser(u)
    setStatus('in')
  }
  const signOut = async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
      setStatus('out')
    }
  }

  return <Ctx.Provider value={{ status, user, signIn, signOut }}>{children}</Ctx.Provider>
}

export function useSession(): Session {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSession outside SessionProvider')
  return s
}
