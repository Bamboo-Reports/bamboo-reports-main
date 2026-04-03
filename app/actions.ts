/**
 * This file is now a central export point for server actions.
 * The implementation has been split into modular files in:
 * - lib/db/connection.ts
 * - app/actions/data.ts
 * - app/actions/saved-filters.ts
 * - app/actions/system.ts
 */
export { 
  getAccounts, 
  getCenters, 
  getFunctions, 
  getServices, 
  getTech, 
  getProspects, 
  getAllData, 
  getFilteredAccounts,
  loadData,
  exportToExcel,
} from "@/app/actions/data"
export { 
  saveFilterSet, 
  getSavedFilters, 
  deleteSavedFilter, 
  updateSavedFilter, 
  loadFilterSets, 
  deleteFilterSet,
  type FilterSet
} from "@/app/actions/saved-filters"
export { 
  testConnection, 
  getDatabaseStatus 
} from "@/app/actions/system"
export {
  getAccountFinancialInfo,
} from "@/app/actions/financial"
export {
  getUnreadCount,
  getUnreadSummaries,
  getUnreadRecordSummaries,
  markAllAsRead,
  type NotificationSummary,
  type RecordUpdateSummary,
  type NotificationCountResponse,
  type NotificationSummaryListResponse,
  type RecordUpdateSummaryListResponse,
  type NotificationMarkResponse,
} from "@/app/actions/notifications"
