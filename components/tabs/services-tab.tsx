"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ServiceRow } from "@/components/tables"
import { EmptyState } from "@/components/states/empty-state"
import { getPaginatedData, getTotalPages, getPageInfo } from "@/lib/utils/helpers"
import { Button } from "@/components/ui/button"
import type { Service } from "@/lib/types"

interface ServicesTabProps {
  services: Service[]
  currentPage: number
  setCurrentPage: (page: number | ((prev: number) => number)) => void
  itemsPerPage: number
}

export function ServicesTab({
  services,
  currentPage,
  setCurrentPage,
  itemsPerPage,
}: ServicesTabProps) {
  // Show empty state when no services
  if (services.length === 0) {
    return (
      <TabsContent value="services">
        <EmptyState type="no-results" />
      </TabsContent>
    )
  }

  return (
    <TabsContent value="services">
      <Card>
        <CardHeader>
          <CardTitle>Services Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CN Unique Key</TableHead>
                  <TableHead>Center Name</TableHead>
                  <TableHead>Primary Service</TableHead>
                  <TableHead>Focus Region</TableHead>
                  <TableHead>IT</TableHead>
                  <TableHead>ER&D</TableHead>
                  <TableHead>FnA</TableHead>
                  <TableHead>HR</TableHead>
                  <TableHead>Procurement</TableHead>
                  <TableHead>Sales & Marketing</TableHead>
                  <TableHead>Customer Support</TableHead>
                  <TableHead>Others</TableHead>
                  <TableHead>Software Vendor</TableHead>
                  <TableHead>Software In Use</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getPaginatedData(services, currentPage, itemsPerPage).map(
                  (service) => (
                    <ServiceRow key={service.cn_unique_key} service={service} />
                  )
                )}
              </TableBody>
            </Table>
          </div>
          {services.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  Showing{" "}
                  {getPageInfo(currentPage, services.length, itemsPerPage).startItem} to{" "}
                  {getPageInfo(currentPage, services.length, itemsPerPage).endItem} of{" "}
                  {services.length} results
                </p>
              </div>
              {getTotalPages(services.length, itemsPerPage) > 1 && (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {getTotalPages(services.length, itemsPerPage)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((prev) =>
                        Math.min(prev + 1, getTotalPages(services.length, itemsPerPage))
                      )
                    }
                    disabled={
                      currentPage === getTotalPages(services.length, itemsPerPage)
                    }
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  )
}
