"use client"

import { useCallback, useMemo } from "react"
import { RiCloseLine } from "@remixicon/react"
import { EnhancedMultiSelect } from "@/components/enhanced-multi-select"
import { useAccountLists } from "@/contexts/account-lists-context"
import type { AccountList } from "@/lib/accounts/account-lists"
import type { FilterValue } from "@/lib/types"

interface AccountListPickerProps {
  /** Selected lists (value = list id). */
  selected: FilterValue[]
  /** Exact names currently on the filter, so a filter carrying names without a known list still shows. */
  accountNameCount: number
  onChange: (selection: FilterValue[], lists: AccountList[]) => void
  onClearNames: () => void
}

/**
 * Sidebar picker for uploaded account lists. Renders through the shared
 * EnhancedMultiSelect (same chips, include/exclude buttons and search as the
 * other filters); options are list names, mapped back to list ids on change.
 */
export function AccountListPicker({ selected, accountNameCount, onChange, onClearNames }: AccountListPickerProps) {
  const { lists } = useAccountLists()

  // Display name per list. Duplicate names get the count appended so they stay distinct.
  const { options, nameById, idByName } = useMemo(() => {
    const nameCounts = new Map<string, number>()
    for (const l of lists) nameCounts.set(l.name, (nameCounts.get(l.name) ?? 0) + 1)
    const nameById = new Map<string, string>()
    const idByName = new Map<string, string>()
    const options: Array<{ value: string; count?: number }> = []
    for (const l of lists) {
      let label = (nameCounts.get(l.name) ?? 0) > 1 ? `${l.name} (${l.accounts.length})` : l.name
      while (idByName.has(label)) label = `${label} `
      nameById.set(l.id, label)
      idByName.set(label, l.id)
      options.push({ value: label, count: l.accounts.length })
    }
    return { options, nameById, idByName }
  }, [lists])

  const selectedByName = useMemo(
    () =>
      selected
        .map((entry) => {
          const label = nameById.get(entry.value)
          return label ? { value: label, mode: entry.mode } : null
        })
        .filter((v): v is FilterValue => v !== null),
    [selected, nameById]
  )
  const unknownSelected = useMemo(() => selected.filter((s) => !nameById.has(s.value)), [selected, nameById])

  const handleChange = useCallback(
    (next: FilterValue[]) => {
      const mapped = next
        .map((entry) => {
          const id = idByName.get(entry.value)
          return id ? { value: id, mode: entry.mode } : null
        })
        .filter((v): v is FilterValue => v !== null)
      // Keep references to lists this user cannot see (shared saved filters).
      onChange([...mapped, ...unknownSelected], lists)
    },
    [idByName, unknownSelected, onChange, lists]
  )

  return (
    <div className="space-y-2">
      <EnhancedMultiSelect
        options={options}
        selected={selectedByName}
        onChange={handleChange}
        placeholder={lists.length === 0 ? "No account lists uploaded yet" : "Select account lists..."}
        trackingKey="accountListValues"
      />
      {selected.length === 0 && accountNameCount > 0 && (
        <button
          type="button"
          onClick={onClearNames}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          title="This filter carries account names from a list that is not in your lists"
        >
          {accountNameCount} accounts from a shared list
          <RiCloseLine className="h-3 w-3" />
        </button>
      )}
      {unknownSelected.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {unknownSelected.length} list{unknownSelected.length === 1 ? " is" : "s are"} not in your lists; their {accountNameCount} accounts still apply.
        </p>
      )}
    </div>
  )
}
