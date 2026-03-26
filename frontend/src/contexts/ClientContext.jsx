import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import * as api from '../services/api'

const ClientContext = createContext()

export function useClientContext() {
  return useContext(ClientContext)
}

export function ClientProvider({ children }) {
  const [clients, setClients] = useState([])
  const [selectedClient, setSelectedClientState] = useState(null)
  const [selectedClientHoldings, setSelectedClientHoldings] = useState([])
  const [loading, setLoading] = useState(false)

  const refreshClients = useCallback(async () => {
    try {
      const data = await api.getClients()
      setClients(data)
    } catch (err) {
      // Silently fail — pages can handle their own errors
    }
  }, [])

  useEffect(() => {
    refreshClients()
  }, [refreshClients])

  const selectClient = useCallback(async (id) => {
    if (!id) {
      setSelectedClientState(null)
      setSelectedClientHoldings([])
      return
    }
    setLoading(true)
    try {
      const [client, portfolio] = await Promise.all([
        api.getClient(id),
        api.getPortfolio(id),
      ])
      setSelectedClientState(client)
      setSelectedClientHoldings(portfolio.holdings || [])
    } catch (err) {
      setSelectedClientState(null)
      setSelectedClientHoldings([])
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <ClientContext.Provider value={{
      clients,
      selectedClient,
      selectedClientHoldings,
      loading,
      selectClient,
      refreshClients,
    }}>
      {children}
    </ClientContext.Provider>
  )
}
