import type { Account, Alias, Center, Function as FunctionRow, Prospect, Service, Tech } from "@/lib/types"

// The dashboard is server-backed (#249): every dataset is paged and aggregated
// by the API and the client never holds the warehouse arrays. Components that
// still accept the arrays receive these stable empty lists.
export const NO_ACCOUNTS: Account[] = []
export const NO_CENTERS: Center[] = []
export const NO_FUNCTIONS: FunctionRow[] = []
export const NO_SERVICES: Service[] = []
export const NO_TECH: Tech[] = []
export const NO_PROSPECTS: Prospect[] = []
export const NO_ALIASES: Alias[] = []
