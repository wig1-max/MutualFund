import { useState, useEffect, useRef } from 'react'
import { searchFunds } from '../services/api'

export default function useFundSearch(query) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (abortRef.current) abortRef.current.abort()

    if (!query || query.trim().length < 2) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    timerRef.current = setTimeout(async () => {
      abortRef.current = new AbortController()
      try {
        const data = await searchFunds(query.trim(), { signal: abortRef.current.signal })
        setResults(data)
      } catch (err) {
        if (err.name === 'AbortError') return // expected when superseded by new search
        setError(err.message)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [query])

  return { results, loading, error }
}
