"use client";

import { useState } from "react";
import { ChefHat, CreditCard, Globe, Store } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import type { AdminGatewaySettingsView } from "@/lib/payments";
import type { AppRole, KitchenStation, Outlet, Printer } from "@/lib/types";
import { DomainForm } from "./DomainForm";
import { OutletForm } from "./OutletForm";
import { PaymentGatewaysForm } from "./PaymentGatewaysForm";
import { PrintersStationsForm } from "./PrintersStationsForm";

export function SettingsWorkbench({
  slug,
  role,
  outlets,
  gatewayViews,
  printersByOutlet,
  stationsByOutlet,
  currentDomain,
  subdomainHost,
}: {
  slug: string;
  role: AppRole;
  outlets: Outlet[];
  gatewayViews: Record<string, AdminGatewaySettingsView>;
  printersByOutlet: Record<string, Printer[]>;
  stationsByOutlet: Record<string, KitchenStation[]>;
  currentDomain: string | null;
  subdomainHost: string | null;
}) {
  const [selectedOutletId, setSelectedOutletId] = useState<string>(
    outlets[0]?.id ?? "",
  );
  const activeOutlet =
    outlets.find((o) => o.id === selectedOutletId) ?? outlets[0] ?? null;
  const activeGateway = activeOutlet ? gatewayViews[activeOutlet.id] : undefined;
  const activePrinters = activeOutlet ? (printersByOutlet[activeOutlet.id] ?? []) : [];
  const activeStations = activeOutlet ? (stationsByOutlet[activeOutlet.id] ?? []) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage outlet details, thermal printers & kitchen stations, Razorpay/Stripe gateways, and custom domains."
        actions={
          outlets.length > 1 && activeOutlet ? (
            <Select
              value={activeOutlet.id}
              onValueChange={(v) => v && setSelectedOutletId(v)}
            >
              <SelectTrigger size="sm" className="h-8 w-56 bg-card text-xs">
                <SelectValue>
                  {(v: string) =>
                    outlets.find((o) => o.id === v)?.name ?? "Select outlet"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {outlets.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                    {o.city ? ` (${o.city})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      {!activeOutlet ? (
        <p className="text-sm text-muted-foreground">No outlets configured.</p>
      ) : (
        <Tabs defaultValue={role === "admin" ? "payments" : "outlet"}>
          <TabsList className="bg-muted/70">
            {role === "admin" && (
              <TabsTrigger value="payments" className="gap-1.5 text-xs">
                <CreditCard className="h-3.5 w-3.5" />
                Payments &amp; UPI
              </TabsTrigger>
            )}
            <TabsTrigger value="outlet" className="gap-1.5 text-xs">
              <Store className="h-3.5 w-3.5" />
              Outlet Profile &amp; Hours
            </TabsTrigger>
            <TabsTrigger value="hardware" className="gap-1.5 text-xs">
              <ChefHat className="h-3.5 w-3.5" />
              Printers &amp; Kitchen Stations
            </TabsTrigger>
            {role === "admin" && (
              <TabsTrigger value="domain" className="gap-1.5 text-xs">
                <Globe className="h-3.5 w-3.5" />
                Custom Domain
              </TabsTrigger>
            )}
          </TabsList>

          {role === "admin" && activeGateway && (
            <TabsContent value="payments" className="mt-4">
              <PaymentGatewaysForm
                key={activeOutlet.id}
                slug={slug}
                outletId={activeOutlet.id}
                outletName={activeOutlet.name}
                initial={activeGateway}
              />
            </TabsContent>
          )}

          <TabsContent value="outlet" className="mt-4">
            <OutletForm
              key={activeOutlet.id}
              slug={slug}
              outlet={activeOutlet}
            />
          </TabsContent>

          <TabsContent value="hardware" className="mt-4">
            <PrintersStationsForm
              key={activeOutlet.id}
              slug={slug}
              outletId={activeOutlet.id}
              outletName={activeOutlet.name}
              initialPrinters={activePrinters}
              initialStations={activeStations}
            />
          </TabsContent>

          {role === "admin" && (
            <TabsContent value="domain" className="mt-4">
              <DomainForm
                slug={slug}
                currentDomain={currentDomain}
                subdomainHost={subdomainHost}
              />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
