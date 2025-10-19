import { type Session, type User, type SignInWithPasswordCredentials } from '@supabase/supabase-js'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'

import { supabaseClient } from '@/lib/supabase-client'

type AuthLikeError = {
  message: string
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

type AuthContextValue = {
  user: User | null
  session: Session | null
  status: AuthStatus
  signInWithPassword: (
    credentials: SignInWithPasswordCredentials
  ) => Promise<{ error: AuthLikeError | null }>
  signOut: () => Promise<{ error: AuthLikeError | null }>
  clientAvailable: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    if (!supabaseClient) {
      setStatus('unauthenticated')
      return
    }

    let isMounted = true

    supabaseClient.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return
        setSession(data.session)
        setUser(data.session?.user ?? null)
        setStatus(data.session?.user ? 'authenticated' : 'unauthenticated')
      })
      .catch((error) => {
        console.error('Failed to load Supabase session', error)
        if (!isMounted) return
        setStatus('unauthenticated')
      })

    const { data: authListener } = supabaseClient.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
        setStatus(nextSession?.user ? 'authenticated' : 'unauthenticated')
      }
    )

    return () => {
      isMounted = false
      authListener?.subscription.unsubscribe()
    }
  }, [])

  const signInWithPassword = useCallback<AuthContextValue['signInWithPassword']>(
    async (credentials) => {
      if (!supabaseClient) {
        console.warn('Supabase client is not configured')
        return { error: { message: 'Missing Supabase configuration' } }
      }

      const { error } = await supabaseClient.auth.signInWithPassword(credentials)
      if (error) {
        console.error('Failed to sign in', error)
        return { error: { message: error.message } }
      }
      return { error: null }
    },
    []
  )

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    if (!supabaseClient) {
      console.warn('Supabase client is not configured')
      return { error: { message: 'Missing Supabase configuration' } }
    }

    const { error } = await supabaseClient.auth.signOut()
    if (error) {
      console.error('Failed to sign out', error)
      return { error: { message: error.message } }
    }
    return { error: null }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    status,
    signInWithPassword,
    signOut,
    clientAvailable: Boolean(supabaseClient)
  }), [user, session, status, signInWithPassword, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
