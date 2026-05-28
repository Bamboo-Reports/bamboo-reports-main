import { getSqlOrThrow, fetchWithRetry } from "@/lib/db/connection"
import { createLogger } from "@/lib/logger"

const logger = createLogger("actions/saved-filters")

// ============================================
// TYPESCRIPT INTERFACES
// ============================================

export interface FilterSet {
  id?: number
  name: string
  filters: {
    accounts?: string[]
    centers?: string[]
    functions?: string[]
    services?: string[]
  }
  created_at?: string
  updated_at?: string
}

// ============================================
// SAVED FILTERS FUNCTIONS
// ============================================

export async function saveFilterSet(
  name: string,
  filters: unknown
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const sqlClient = getSqlOrThrow()

    logger.info("save_filter_set_started", { name })
    const result = (await fetchWithRetry(
      () => sqlClient`
        INSERT INTO saved_filters (name, filters)
        VALUES (${name}, ${JSON.stringify(filters)})
        RETURNING id, name, created_at
      `
    )) as unknown[]
    logger.info("save_filter_set_succeeded", { result: result[0] })

    return { success: true, data: result[0] }
  } catch (error) {
    logger.error("save_filter_set_failed", { error })
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function getSavedFilters(): Promise<FilterSet[]> {
  try {
    const sqlClient = getSqlOrThrow()

    logger.info("get_saved_filters_started")
    const savedFilters = (await fetchWithRetry(
      () => sqlClient`
        SELECT id, name, filters, created_at, updated_at 
        FROM saved_filters 
        ORDER BY created_at DESC
      `
    )) as FilterSet[]
    logger.info("get_saved_filters_succeeded", { count: savedFilters.length })

    return savedFilters
  } catch (error) {
    logger.error("get_saved_filters_failed", { error })
    return []
  }
}

export async function deleteSavedFilter(
  id: number
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const sqlClient = getSqlOrThrow()

    logger.info("delete_saved_filter_started", { id })
    const result = (await fetchWithRetry(
      () => sqlClient`
        DELETE FROM saved_filters 
        WHERE id = ${id}
        RETURNING id, name
      `
    )) as unknown[]
    logger.info("delete_saved_filter_succeeded", { result: result[0] })

    return { success: true, data: result[0] }
  } catch (error) {
    logger.error("delete_saved_filter_failed", { error })
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function updateSavedFilter(
  id: number,
  name: string,
  filters: unknown
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const sqlClient = getSqlOrThrow()

    logger.info("update_saved_filter_started", { id, name })
    const result = (await fetchWithRetry(
      () => sqlClient`
        UPDATE saved_filters 
        SET name = ${name}, filters = ${JSON.stringify(filters)}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING id, name, updated_at
      `
    )) as unknown[]
    logger.info("update_saved_filter_succeeded", { result: result[0] })

    return { success: true, data: result[0] }
  } catch (error) {
    logger.error("update_saved_filter_failed", { error })
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// ============================================
// LEGACY COMPATIBILITY FUNCTIONS
// ============================================

export async function loadFilterSets(): Promise<{ success: boolean; data?: FilterSet[]; error?: string }> {
  try {
    const filters = await getSavedFilters()
    return { success: true, data: filters }
  } catch (error) {
    logger.error("load_filter_sets_failed", { error })
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function deleteFilterSet(id: number): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const result = await deleteSavedFilter(id)
    return result
  } catch (error) {
    logger.error("delete_filter_set_failed", { error })
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}
