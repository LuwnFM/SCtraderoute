import { useCallback, useEffect, useRef, useState } from 'react'
import { loadTradeSnapshot, type TradeSnapshot } from '@/lib/data'

export function useTradeData() {
  const [data, setData] = useState<TradeSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async (bust = false) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    bust ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const snapshot = await loadTradeSnapshot({ bust, signal: ctrl.signal })
      setData(snapshot)
    } catch (err) {
      if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : 'Не удалось загрузить торговые данные')
    } finally {
      if (!ctrl.signal.aborted) { setLoading(false); setRefreshing(false) }
    }
  }, [])

  useEffect(() => {
    void load(false)
    return () => abortRef.current?.abort()
  }, [load])

  return { data, loading, refreshing, error, refresh: () => load(true) }
}
