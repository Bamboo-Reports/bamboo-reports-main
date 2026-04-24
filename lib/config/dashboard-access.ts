import type { ExportDatasetKey } from "@/lib/utils/export-helpers"

export type DashboardSection = "accounts" | "centers" | "prospects"
export type DashboardAccessState = "enabled" | "disabled"
export type DashboardDataset = ExportDatasetKey

type DashboardAccessConfig = {
  sections: Record<DashboardSection, DashboardAccessState>
  limits: {
    prospectsPerAccount: number | null
  }
}

/**
 * Deployment-level capability config.
 *
 * Toggle sections here per deployment/customer without changing the main UI.
 * Example for an Accounts + Prospects only deployment:
 *   centers: "disabled"
 */
export const DASHBOARD_ACCESS_CONFIG: DashboardAccessConfig = {
  sections: {
    accounts: "enabled",
    centers: "enabled",
    prospects: "enabled",
  },
  limits: {
    prospectsPerAccount: 2,
  },
}

const SECTION_LABELS: Record<DashboardSection, string> = {
  accounts: "Accounts",
  centers: "Centers",
  prospects: "Prospects",
}

const DATASET_LABELS: Record<DashboardDataset, string> = {
  accounts: "Accounts",
  centers: "Centers",
  services: "Services",
  prospects: "Prospects",
}

export function isSectionEnabled(section: DashboardSection): boolean {
  return DASHBOARD_ACCESS_CONFIG.sections[section] === "enabled"
}

export function isSectionDisabled(section: DashboardSection): boolean {
  return !isSectionEnabled(section)
}

export function getEnabledSections(): DashboardSection[] {
  return (Object.keys(DASHBOARD_ACCESS_CONFIG.sections) as DashboardSection[]).filter(isSectionEnabled)
}

export function getAccessibleDefaultSection(): DashboardSection {
  return getEnabledSections()[0] ?? "accounts"
}

export function isDatasetEnabled(dataset: DashboardDataset): boolean {
  switch (dataset) {
    case "services":
      return isSectionEnabled("centers")
    case "accounts":
    case "centers":
    case "prospects":
      return isSectionEnabled(dataset)
  }
}

export function getProspectsPerAccountLimit(): number | null {
  const limit = DASHBOARD_ACCESS_CONFIG.limits.prospectsPerAccount

  if (limit === null) {
    return null
  }

  if (!Number.isFinite(limit)) {
    return null
  }

  return Math.max(0, Math.floor(limit))
}

export function canAccessAccountsMapView(): boolean {
  return isSectionEnabled("centers")
}

export function getSectionUnavailableMessage(section: DashboardSection): string {
  return `${SECTION_LABELS[section]} is Not Procured.`
}

export function getDatasetUnavailableMessage(dataset: DashboardDataset): string {
  return `${DATASET_LABELS[dataset]} export is Not Procured.`
}

export function assertSectionEnabled(section: DashboardSection): void {
  if (!isSectionEnabled(section)) {
    throw new Error(getSectionUnavailableMessage(section))
  }
}

export function assertDatasetEnabled(dataset: DashboardDataset): void {
  if (!isDatasetEnabled(dataset)) {
    throw new Error(getDatasetUnavailableMessage(dataset))
  }
}
