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
  const [selectedClientAssets, setSelectedClientAssets] = useState([])
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
      setSelectedClientAssets([])
      return
    }
    setLoading(true)
    try {
      const [client, portfolio, assetsData] = await Promise.all([
        api.getClient(id),
        api.getPortfolio(id),
        api.getClientAssets(id),
      ])
      setSelectedClientState(client)
      setSelectedClientHoldings(portfolio.holdings || [])
      setSelectedClientAssets(assetsData.assets || [])
    } catch (err) {
      setSelectedClientState(null)
      setSelectedClientHoldings([])
      setSelectedClientAssets([])
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <ClientContext.Provider value={{
      clients,
      selectedClient,
      selectedClientHoldings,
      selectedClientAssets,
      loading,
      selectClient,
      refreshClients,
    }}>
      {children}
    </ClientContext.Provider>
  )
}
