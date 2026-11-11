import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError, type Account, type User } from './api'
import { useI18n, type Lang } from './i18n'

type Me = { user: User; accounts: Account[]; ig_ready: boolean }
type AuthCtx = {
  me: Me | null
  loading: boolean
  refresh: () => Promise<void>
  setMe: (m: Me | null) => void
  account: Account | null
  setAccountId: (id: number) => void
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLang } = useI18n()
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [accountId, setAccountIdState] = useState<number | null>(() => {
    try { return Number(localStorage.getItem('cf_account')) || null } catch { return null }
  })

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<Me>('/api/me')
      setMe(data)
      if (data.user.lang) setLang(data.user.lang as Lang)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null)
    } finally {
      setLoading(false)
    }
  }, [setLang])

  useEffect(() => { refresh() }, [refresh])

  const setAccountId = useCallback((id: number) => {
    setAccountIdState(id)
    try { localStorage.setItem('cf_account', String(id)) } catch { /* ignore */ }
  }, [])

  const account = useMemo(() => {
    if (!me?.accounts.length) return null
    return me.accounts.find(a => a.id === accountId) ?? me.accounts[0]
  }, [me, accountId])

  return <Ctx.Provider value={{ me, loading, refresh, setMe, account, setAccountId }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
