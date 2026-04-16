"use client"

import React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Mail, Linkedin, MapPin, Building2, Briefcase, Users, Award } from "lucide-react"
import type { Prospect } from "@/lib/types"

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glassmorphism-dialog">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-lg font-bold text-primary">
                {prospect.prospect_first_name?.[0]}{prospect.prospect_last_name?.[0]}
              </span>
            </div>
            <div>
              {prospect.prospect_first_name} {prospect.prospect_last_name}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Contact Information Section */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Contact Information
            </h3>
            <div className="grid gap-3">
              <InfoRow
                icon={Mail}
                label="Email"
                value={prospect.prospect_email}
                link={prospect.prospect_email ? `mailto:${prospect.prospect_email}` : undefined}
              />
              <InfoRow
                icon={Linkedin}
                label="LinkedIn Profile"
                value="View Profile"
                link={prospect.prospect_linkedin_url}
              />
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
              <InfoRow
                icon={Award}
                label="Head Type"
                value={prospect.head_type}
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
