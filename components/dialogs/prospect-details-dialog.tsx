"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Check, Copy, Linkedin, Mail, SlidersHorizontal, SquareArrowOutUpRight } from "lucide-react"
import { formatProspectLocation } from "@/lib/utils/helpers"
import type { Prospect } from "@/lib/types"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { Badge } from "@/components/ui/badge"
import { DialogBreadcrumb, type DialogBreadcrumbItem } from "@/components/ui/dialog-breadcrumb"
import { ProspectGridCard } from "@/components/cards/prospect-grid-card"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { fetchAccountRelated } from "@/lib/dashboard/api-client"

interface ProspectDetailsDialogProps {
  prospect: Prospect | null
  allProspects: Prospect[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAccountOpen?: (accountName: string) => void
  /** Server mode (#249): load company contacts from the related endpoint instead of the allProspects prop. */
  fetchRelated?: boolean
}

function MetaRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined) return null
  const str = typeof value === "number" ? value.toString() : value
  if (str.trim() === "") return null
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm border-b border-border/30 last:border-b-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right break-words">{str}</span>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-border/40 pb-2">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
    </div>
  )
}

function QuickFilterGroup({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string
  options: Array<{ name: string; count: number }>
  selected: Set<string>
  onToggle: (value: string) => void
  onClear: () => void
}) {
  if (options.length === 0) return null
  const totalCount = options.reduce((s, o) => s + o.count, 0)
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">{label}</span>
      <button
        type="button"
        onClick={onClear}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1.5 ${selected.size === 0 ? "bg-primary text-primary-foreground border-primary" : "bg-background/40 text-muted-foreground border-border/60 hover:bg-background/60"}`}
      >
        All
        <span className={`text-[10px] tabular-nums ${selected.size === 0 ? "text-primary-foreground/70" : "text-muted-foreground/70"}`}>{totalCount}</span>
      </button>
      {options.map((opt) => {
        const active = selected.has(opt.name)
        return (
          <button
            key={opt.name}
            type="button"
            onClick={() => onToggle(opt.name)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1.5 ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background/40 text-foreground border-border/60 hover:bg-background/60"}`}
          >
            {opt.name}
            <span className={`text-[10px] tabular-nums ${active ? "text-primary-foreground/70" : "text-muted-foreground/70"}`}>{opt.count}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ProspectDetailsDialog({
  prospect,
  allProspects: allProspectsProp,
  open,
  onOpenChange,
  onAccountOpen,
  fetchRelated = false,
}: ProspectDetailsDialogProps) {
  const copy = useCopyToClipboard()
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState<Prospect | null>(prospect)
  const [headTypeFilter, setHeadTypeFilter] = useState<Set<string>>(new Set())
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set())
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set())
  const [contactsPage, setContactsPage] = useState(1)
  const CONTACTS_PER_PAGE = 6

  useEffect(() => {
    setCurrent(prospect)
    setHeadTypeFilter(new Set())
    setDeptFilter(new Set())
    setLevelFilter(new Set())
    setContactsPage(1)
  }, [prospect])

  const p = current

  const [relatedProspects, setRelatedProspects] = useState<Prospect[] | null>(null)
  const relatedAccount = fetchRelated && open ? (p?.account_global_legal_name ?? "") : ""
  useEffect(() => {
    if (!relatedAccount) {
      setRelatedProspects(null)
      return
    }
    let cancelled = false
    fetchAccountRelated(relatedAccount)
      .then((res) => {
        if (!cancelled) setRelatedProspects(res.prospects)
      })
      .catch(() => {
        if (!cancelled) setRelatedProspects(null)
      })
    return () => {
      cancelled = true
    }
  }, [relatedAccount])

  const allProspects = fetchRelated ? (relatedProspects ?? []) : allProspectsProp

  const companyContacts = useMemo(
    () =>
      p
        ? allProspects.filter(
            (other) =>
              other.account_global_legal_name === p.account_global_legal_name &&
              (p.ps_unique_key
                ? other.ps_unique_key !== p.ps_unique_key
                : other.prospect_first_name !== p.prospect_first_name ||
                  other.prospect_last_name !== p.prospect_last_name),
          )
        : [],
    [p, allProspects],
  )

  const sortByCount = (items: string[]): Array<{ name: string; count: number }> => {
    const counts = new Map<string, number>()
    for (const v of items) {
      if (!v) continue
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
  }

  // Cascading filters: each filter's options are derived from contacts that already
  // pass the *other two* filters, so counts and pills stay accurate.
  const headTypeOptions = useMemo(
    () =>
      sortByCount(
        companyContacts
          .filter(
            (c) =>
              (deptFilter.size === 0 || deptFilter.has((c.prospect_department ?? "").trim())) &&
              (levelFilter.size === 0 || levelFilter.has((c.prospect_level ?? "").trim())),
          )
          .map((c) => (c.head_type ?? "").trim())
          .filter(Boolean),
      ),
    [companyContacts, deptFilter, levelFilter],
  )
  const deptOptions = useMemo(
    () =>
      sortByCount(
        companyContacts
          .filter(
            (c) =>
              (headTypeFilter.size === 0 || headTypeFilter.has((c.head_type ?? "").trim())) &&
              (levelFilter.size === 0 || levelFilter.has((c.prospect_level ?? "").trim())),
          )
          .map((c) => (c.prospect_department ?? "").trim())
          .filter(Boolean),
      ),
    [companyContacts, headTypeFilter, levelFilter],
  )
  const levelOptions = useMemo(
    () =>
      sortByCount(
        companyContacts
          .filter(
            (c) =>
              (headTypeFilter.size === 0 || headTypeFilter.has((c.head_type ?? "").trim())) &&
              (deptFilter.size === 0 || deptFilter.has((c.prospect_department ?? "").trim())),
          )
          .map((c) => (c.prospect_level ?? "").trim())
          .filter(Boolean),
      ),
    [companyContacts, headTypeFilter, deptFilter],
  )

  const filteredContacts = useMemo(() => {
    const result = companyContacts.filter((c) => {
      if (headTypeFilter.size > 0 && !headTypeFilter.has((c.head_type ?? "").trim())) return false
      if (deptFilter.size > 0 && !deptFilter.has((c.prospect_department ?? "").trim())) return false
      if (levelFilter.size > 0 && !levelFilter.has((c.prospect_level ?? "").trim())) return false
      return true
    })
    return result
  }, [companyContacts, headTypeFilter, deptFilter, levelFilter])

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setContactsPage(1)
  }, [headTypeFilter, deptFilter, levelFilter])

  const pagedContacts = useMemo(
    () => filteredContacts.slice((contactsPage - 1) * CONTACTS_PER_PAGE, contactsPage * CONTACTS_PER_PAGE),
    [filteredContacts, contactsPage, CONTACTS_PER_PAGE],
  )

  if (!p) return null

  const fullName = p.prospect_full_name || [p.prospect_first_name, p.prospect_last_name].filter(Boolean).join(" ").trim()
  const initials = [p.prospect_first_name?.[0], p.prospect_last_name?.[0]].filter(Boolean).join("")
  const location = formatProspectLocation(p.prospect_city, p.prospect_state)

  const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const breadcrumbItems: DialogBreadcrumbItem[] = [
    ...(p.account_global_legal_name
      ? [{ label: p.account_global_legal_name, onClick: () => onOpenChange(false) }]
      : []),
    { label: "Prospects", onClick: () => onOpenChange(false) },
    { label: fullName || "Prospect" },
  ]

  const hasLeftContent = !!(p.prospect_title || p.prospect_email)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto glassmorphism-dialog">
        <DialogHeader>
          <DialogBreadcrumb items={breadcrumbItems} />
          <DialogDescription className="sr-only">
            Prospect profile details, contact information, account linkage, and related contacts.
          </DialogDescription>
          <DialogTitle className="flex items-center gap-3 text-2xl font-bold">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-primary">{initials}</span>
            </div>
            <div className="flex flex-1 min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="block leading-tight">{fullName}</span>
                {p.account_global_legal_name ? (
                  <p className="mt-1 text-sm font-normal text-muted-foreground">
                    {p.account_global_legal_name}
                    {onAccountOpen ? (
                      <button
                        type="button"
                        onClick={() => onAccountOpen(p.account_global_legal_name)}
                        className="ml-1.5 inline-flex h-5 w-5 translate-y-0.5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`Open account details for ${p.account_global_legal_name}`}
                        title={`Open account details for ${p.account_global_legal_name}`}
                      >
                        <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2 shrink-0 mt-1">
                {p.prospect_email ? (
                  <a
                    href={`mailto:${p.prospect_email}`}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title={p.prospect_email}
                    aria-label="Send email"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                ) : null}
                {p.prospect_linkedin_url ? (
                  <a
                    href={p.prospect_linkedin_url.startsWith("http") ? p.prospect_linkedin_url : `https://${p.prospect_linkedin_url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-[#0A66C2] transition-colors"
                    title="View LinkedIn"
                    aria-label="View LinkedIn profile"
                  >
                    <Linkedin className="h-4 w-4" />
                  </a>
                ) : null}
                {p.head_type === "GCC Head" ? (
                  <Badge className="font-normal border-transparent bg-blue-100 text-blue-700 hover:bg-blue-100/80 dark:bg-blue-500/15 dark:text-blue-300">
                    GCC Head
                  </Badge>
                ) : null}
                {p.head_type === "HR Head" ? (
                  <Badge className="font-normal border-transparent bg-orange-100 text-orange-700 hover:bg-orange-100/80 dark:bg-orange-500/15 dark:text-orange-300">
                    HR Head
                  </Badge>
                ) : null}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div ref={scrollRef} className="mt-6 space-y-8">
          <section className="rounded-xl border border-border/60 bg-background/40 p-5 backdrop-blur-sm lg:p-6 dark:border-white/10 dark:bg-white/5">
            <div className={`grid grid-cols-1 gap-6 ${hasLeftContent ? "lg:grid-cols-3" : ""}`}>
              {hasLeftContent ? (
                <div className="space-y-5 lg:col-span-2">
                  {p.prospect_title ? (
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Job Title
                      </p>
                      <p className="text-sm leading-relaxed text-foreground/90">{p.prospect_title}</p>
                    </div>
                  ) : null}
                  {p.prospect_email ? (
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        Email
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground/90 break-all">{p.prospect_email}</span>
                        <button
                          type="button"
                          onClick={() => {
                            copy(p.prospect_email!, "Email")
                            setCopied(true)
                            setTimeout(() => setCopied(false), 1500)
                          }}
                          className="p-1 rounded text-muted-foreground hover:bg-background/60 hover:text-foreground transition-colors shrink-0"
                          title={copied ? "Copied!" : "Copy email"}
                          aria-label="Copy email"
                        >
                          {copied
                            ? <Check className="h-3.5 w-3.5 text-green-500 animate-scale-in" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className={hasLeftContent ? "lg:border-l lg:border-border/50 lg:pl-6" : ""}>
                <MetaRow label="Department" value={p.prospect_department} />
                <MetaRow label="Level" value={p.prospect_level} />
                <MetaRow label="In Company Since" value={p.prospect_in_company_year} />
                <MetaRow label="Current Role Since" value={p.prospect_current_year} />
                <MetaRow label="Center" value={p.center_name} />
                <MetaRow label="Location" value={location} />
                <MetaRow label="Country" value={p.prospect_country?.trim().toUpperCase() === "TBA" || location === "India" ? null : p.prospect_country} />
              </div>
            </div>
          </section>

          {companyContacts.length > 0 ? (
            <section className="space-y-4">
              <SectionHeader title={`More Contacts From ${p.account_global_legal_name}`} />
              <div className="space-y-2">
                <QuickFilterGroup
                  label="Head Type"
                  options={headTypeOptions}
                  selected={headTypeFilter}
                  onToggle={(v) => toggleInSet(setHeadTypeFilter, v)}
                  onClear={() => setHeadTypeFilter(new Set())}
                />
                <QuickFilterGroup
                  label="Department"
                  options={deptOptions}
                  selected={deptFilter}
                  onToggle={(v) => toggleInSet(setDeptFilter, v)}
                  onClear={() => setDeptFilter(new Set())}
                />
                <QuickFilterGroup
                  label="Level"
                  options={levelOptions}
                  selected={levelFilter}
                  onToggle={(v) => toggleInSet(setLevelFilter, v)}
                  onClear={() => setLevelFilter(new Set())}
                />
              </div>
              {filteredContacts.length > 0 ? (
                <div className="rounded-xl border border-border/60 bg-background/40 backdrop-blur-sm dark:border-white/10 dark:bg-white/5 overflow-hidden">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 p-4">
                    {pagedContacts.map((contact, idx) => (
                      <ProspectGridCard
                        key={`${contact.prospect_first_name}-${contact.prospect_last_name}-${(contactsPage - 1) * CONTACTS_PER_PAGE + idx}`}
                        prospect={contact}
                        onClick={() => {
                          setCurrent(contact)
                          setHeadTypeFilter(new Set())
                          setDeptFilter(new Set())
                          setLevelFilter(new Set())
                          setContactsPage(1)
                          scrollRef.current?.closest('[role="dialog"]')?.scrollTo({ top: 0, behavior: "smooth" })
                        }}
                      />
                    ))}
                  </div>
                  <PaginationControls
                    currentPage={contactsPage}
                    totalItems={filteredContacts.length}
                    itemsPerPage={CONTACTS_PER_PAGE}
                    onPageChange={setContactsPage}
                    dataLength={filteredContacts.length}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/40 py-10 text-center backdrop-blur-sm dark:bg-white/5 dark:border-white/10 animate-fade-in">
                  <SlidersHorizontal className="mb-2 h-7 w-7 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-foreground">No matching contacts</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Adjust the department or level filters above.</p>
                </div>
              )}
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
