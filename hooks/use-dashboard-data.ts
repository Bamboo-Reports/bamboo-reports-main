import { useCallback, useEffect, useState } from "react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Account, Center, Function, Service, Tech, Prospect } from "@/lib/types"

interface UseDashboardDataOptions {
  enabled: boolean
}

interface AllDataResult {
  accounts: unknown[]
  centers: unknown[]
  functions: unknown[]
  services: unknown[]
  tech: unknown[]
  prospects: unknown[]
  error?: string
}

export function useDashboardData({ enabled }: UseDashboardDataOptions) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [centers, setCenters] = useState<Center[]>([])
  const [functions, setFunctions] = useState<Function[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [tech, setTech] = useState<Tech[]>([])
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<string>("")

  const loadData = useCallback(async (forceRefresh?: boolean) => {
    const startedAt = Date.now()
    try {
      setLoading(true)
      setError(null)
      setConnectionStatus("Loading data from database...")
      setAccounts([])
      setCenters([])
      setFunctions([])
      setServices([])
      setTech([])
      setProspects([])

      // Get auth token for API requests
      const supabase = getSupabaseBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) {
        setError("Not authenticated. Please sign in.")
        setConnectionStatus("Authentication required")
        setLoading(false)
        return
      }
      const authHeaders = { Authorization: `Bearer ${accessToken}` }

      // Invalidate server cache if force-refreshing
      if (forceRefresh) {
        await fetch("/api/dashboard", { method: "POST", headers: authHeaders })
      }

      const res = await fetch("/api/dashboard", { headers: authHeaders })
      if (res.status === 401) {
        setError("Session expired. Please sign in again.")
        setConnectionStatus("Authentication failed")
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error(`Failed to load data: ${res.status}`)
      const data = (await res.json()) as AllDataResult

      if (data.error) {
        setError(`Database error: ${data.error}`)
        setConnectionStatus("Data loading failed")
        captureEvent(ANALYTICS_EVENTS.DATA_LOAD_FAILED, {
          failure_reason: "database_error",
          error_message: data.error,
          duration_ms: Date.now() - startedAt,
        })
        return
      }

      const accountsData = Array.isArray(data.accounts) ? data.accounts : []
      const centersData = Array.isArray(data.centers) ? data.centers : []
      const functionsData = Array.isArray(data.functions) ? data.functions : []
      const servicesData = Array.isArray(data.services) ? data.services : []
      const techData = Array.isArray(data.tech) ? data.tech : []
      const prospectsData = Array.isArray(data.prospects) ? data.prospects : []

      if (
        accountsData.length === 0 &&
        centersData.length === 0 &&
        functionsData.length === 0 &&
        servicesData.length === 0 &&
        techData.length === 0 &&
        prospectsData.length === 0
      ) {
        setError("No data found in database tables. Please check if your tables contain data.")
        setConnectionStatus("No data available")
        captureEvent(ANALYTICS_EVENTS.DATA_LOAD_FAILED, {
          failure_reason: "no_data_available",
          duration_ms: Date.now() - startedAt,
        })
        return
      }

      setAccounts(accountsData as Account[])
      setCenters(centersData as Center[])
      setFunctions(functionsData as Function[])
      setServices(servicesData as Service[])
      setTech(techData as Tech[])
      setProspects(prospectsData as Prospect[])

      setConnectionStatus(
        `Successfully loaded: ${accountsData.length} accounts, ${centersData.length} centers, ${functionsData.length} functions, ${servicesData.length} services, ${techData.length} tech, ${prospectsData.length} prospects`
      )
      captureEvent(ANALYTICS_EVENTS.DATA_LOAD_SUCCEEDED, {
        accounts_count: accountsData.length,
        centers_count: centersData.length,
        functions_count: functionsData.length,
        services_count: servicesData.length,
        tech_count: techData.length,
        prospects_count: prospectsData.length,
        duration_ms: Date.now() - startedAt,
      })
    } catch (err) {
      console.error("Error loading data:", err)
      const errorMessage = err instanceof Error ? err.message : "Failed to load data from database"
      setError(errorMessage)
      setConnectionStatus("Database connection failed")
      captureEvent(ANALYTICS_EVENTS.DATA_LOAD_FAILED, {
        failure_reason: "load_data_exception",
        error_message: errorMessage,
        duration_ms: Date.now() - startedAt,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    loadData()
  }, [enabled, loadData])

  return {
    accounts,
    centers,
    functions,
    services,
    tech,
    prospects,
    loading,
    error,
    connectionStatus,
    loadData,
  }
}
