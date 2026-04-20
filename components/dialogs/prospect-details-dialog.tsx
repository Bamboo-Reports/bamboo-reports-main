"use client"

import React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Mail, Linkedin, MapPin, Building2, Briefcase, Users, Award, Copy } from "lucide-react"
import type { Prospect } from "@/lib/types"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { Badge } from "@/components/ui/badge"
import { DialogBreadcrumb, type DialogBreadcrumbItem } from "@/components/ui/dialog-breadcrumb"

interface ProspectDetailsDialogProps {
  prospect: Prospect | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProspectDetailsDialog({
  prospect,
  open,
  onOpenChange,
}: ProspectDetailsDialogProps) {
  const copy = useCopyToClipboard()
  if (!prospect) return null

  const InfoRow = ({ icon: Icon, label, value, link }: { icon: any; label: string; value: string; link?: string }) => {
    if (!value) return null

    return (
      <div className="flex items-start gap-3 p-3 rounded-lg bg-background/40 backdrop-blur-sm border border-border/50 hover:border-border transition-colors dark:bg-white/5 dark:border-white/10 dark:backdrop-blur-md dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
        <div className="mt-0.5">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary hover:underline break-words"
            >
              {value}
            </a>
          ) : (
            <p className="text-sm font-medium break-words">{value}</p>
          )}
        </div>
      </div>
    )
  }

  const fullName = [prospect.prospect_first_name, prospect.prospect_last_name]
    .filter(Boolean)
    .join(" ")
    .trim()

  const breadcrumbItems: DialogBreadcrumbItem[] = [
    ...(prospect.account_global_legal_name
      ? [{ label: prospect.account_global_legal_name, onClick: () => onOpenChange(false) }]
      : []),
    { label: "Prospects", onClick: () => onOpenChange(false) },
    { label: fullName || "Prospect" },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glassmorphism-dialog">
        <DialogHeader>
          <DialogBreadcrumb items={breadcrumbItems} />
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-primary">
                {prospect.prospect_first_name?.[0]}{prospect.prospect_last_name?.[0]}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="truncate">{prospect.prospect_first_name} {prospect.prospect_last_name}</span>
              <div className="flex items-center gap-1.5">
                {prospect.prospect_email && (
                  <a
                    href={`mailto:${prospect.prospect_email}`}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title={`Email ${prospect.prospect_email}`}
                    aria-label="Send email"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                )}
                {prospect.prospect_linkedin_url && (
                  <a
                    href={prospect.prospect_linkedin_url.startsWith("http") ? prospect.prospect_linkedin_url : `https://${prospect.prospect_linkedin_url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-[#0A66C2] transition-colors"
                    title="View LinkedIn"
                    aria-label="View LinkedIn profile"
                  >
                    <Linkedin className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
            {prospect.head_type === "GCC Head" && (
              <Badge className="shrink-0 font-normal border-transparent bg-blue-100 text-blue-700 hover:bg-blue-100/80 dark:bg-blue-500/15 dark:text-blue-300 mr-6">
                GCC Head
              </Badge>
            )}
            {prospect.head_type === "HR Head" && (
              <Badge className="shrink-0 font-normal border-transparent bg-orange-100 text-orange-700 hover:bg-orange-100/80 dark:bg-orange-500/15 dark:text-orange-300 mr-6">
                HR Head
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Contact Information Section */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Contact Information
            </h3>
            <div className="grid gap-3">
              {prospect.prospect_email && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-background/40 backdrop-blur-sm border border-border/50 hover:border-border transition-colors dark:bg-white/5 dark:border-white/10 dark:backdrop-blur-md dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
                  <div className="mt-0.5">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Email</p>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium break-words">{prospect.prospect_email}</span>
                      <button
                        type="button"
                        onClick={() => copy(prospect.prospect_email!, "Email")}
                        className="p-1 rounded text-muted-foreground hover:bg-background/60 hover:text-foreground transition-colors shrink-0"
                        title="Copy email"
                        aria-label="Copy email"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Professional Information Section */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Professional Information
            </h3>
            <div className="grid gap-3">
              <InfoRow
                icon={Briefcase}
                label="Job Title"
                value={prospect.prospect_title}
              />
              <InfoRow
                icon={Users}
                label="Department"
                value={prospect.prospect_department}
              />
              <InfoRow
                icon={Award}
                label="Level"
                value={prospect.prospect_level}
              />
            </div>
          </div>

          {/* Company Information Section */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Company Information
            </h3>
            <div className="grid gap-3">
              <InfoRow
                icon={Building2}
                label="Account Name"
                value={prospect.account_global_legal_name}
              />
              <InfoRow
                icon={Building2}
                label="Center Name"
                value={prospect.center_name}
              />
            </div>
          </div>

          {/* Location Information Section */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Location
            </h3>
            <div className="grid gap-3">
              <InfoRow
                icon={MapPin}
                label="Location"
                value={[prospect.prospect_city, prospect.prospect_state, prospect.prospect_country]
                  .filter(Boolean)
                  .join(", ")}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
