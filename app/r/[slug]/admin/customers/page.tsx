import { notFound } from "next/navigation";
import {
  UsersRound,
  Repeat,
  IndianRupee,
  ShoppingBag,
  Crown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantBySlug } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { CUSTOMER_LIST_SOURCES } from "@/lib/channels";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((s) => s.charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

type Customer = {
  email: string;
  name: string;
  orders: number;
  spent: number;
  last: number;
  first: number;
};

export default async function CustomersPage({
  params,
}: {
  params: { slug: string };
}) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);
  const scoped = outletIds.length > 0 ? outletIds : ["00000000-0000-0000-0000-000000000000"];

  // Only orders customers placed with us directly. Delivery-platform orders
  // (Zomato, Swiggy, …) are left out: those customers are the platform's, and
  // their details reach us only to fulfil that one order — not to build a
  // customer list from. They still count in Orders and Reports.
  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select("customer_name, customer_email, total_amount, placed_at, source, status")
    .in("outlet_id", scoped)
    .in("source", CUSTOMER_LIST_SOURCES)
    .neq("status", "cancelled")
    .order("placed_at", { ascending: false })
    .limit(5000);

  const orders = (data ?? []) as Pick<
    Order,
    "customer_name" | "customer_email" | "total_amount" | "placed_at" | "source" | "status"
  >[];

  // Aggregate by email. POS walk-ins and platform orders never get here (see
  // the source filter above); the prefix check also drops placeholder emails.
  const map = new Map<string, Customer>();
  for (const o of orders) {
    const email = (o.customer_email ?? "").toLowerCase().trim();
    if (!email || email.startsWith("pos+") || email.startsWith("guest+")) continue;

    const t = o.placed_at ? new Date(o.placed_at).getTime() : 0;
    const cur =
      map.get(email) ??
      ({
        email,
        name: o.customer_name ?? email,
        orders: 0,
        spent: 0,
        last: 0,
        first: Number.MAX_SAFE_INTEGER,
      } as Customer);

    cur.orders += 1;
    cur.spent += Number(o.total_amount);
    cur.last = Math.max(cur.last, t);
    cur.first = Math.min(cur.first, t);
    map.set(email, cur);
  }

  const customers = Array.from(map.values()).sort((a, b) => b.spent - a.spent);

  const total = customers.length;
  const repeat = customers.filter((c) => c.orders > 1).length;
  const repeatRate = total ? Math.round((repeat / total) * 100) : 0;
  const totalSpent = customers.reduce((s, c) => s + c.spent, 0);
  const avgSpend = total ? totalSpent / total : 0;
  const topSpentMax = customers[0]?.spent ?? 1;

  const fmtDate = (t: number) =>
    t ? new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="People who've ordered from your own storefront and kiosk. Walk-in counter sales and delivery-platform orders (Zomato, Swiggy) are excluded."
      />

      {total === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={UsersRound}
              title="No customers yet"
              description="Once customers order from your storefront, they'll appear here with their order history and spend."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={UsersRound} label="Customers" value={total.toString()} />
            <Stat
              icon={Repeat}
              label="Repeat customers"
              value={repeat.toString()}
            />
            <Stat
              icon={ShoppingBag}
              label="Repeat rate"
              value={`${repeatRate}%`}
            />
            <Stat
              icon={IndianRupee}
              label="Avg spend / customer"
              value={inr(avgSpend)}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            {/* Customer table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All customers</CardTitle>
                <CardDescription>Sorted by total spend.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-2 font-normal">Customer</th>
                        <th className="py-2 text-right font-normal">Orders</th>
                        <th className="py-2 text-right font-normal">Spent</th>
                        <th className="py-2 text-right font-normal">Avg</th>
                        <th className="py-2 text-right font-normal">Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.slice(0, 50).map((c) => (
                        <tr key={c.email} className="border-b last:border-0">
                          <td className="py-2">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-[11px]">
                                  {initials(c.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 font-medium">
                                  <span className="truncate">{c.name}</span>
                                  {c.orders >= 5 && (
                                    <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                  )}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {c.email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {c.orders}
                          </td>
                          <td className="py-2 text-right font-medium tabular-nums">
                            {inr(c.spent)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {inr(c.spent / c.orders)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {fmtDate(c.last)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {customers.length > 50 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Showing top 50 of {customers.length} customers.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Top customers + new vs repeat */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Crown className="h-4 w-4 text-amber-500" />
                    Top spenders
                  </CardTitle>
                  <CardDescription>Your most valuable customers.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {customers.slice(0, 6).map((c) => (
                    <div key={c.email} className="text-sm">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {inr(c.spent)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/80"
                          style={{ width: `${(c.spent / topSpentMax) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">New vs repeat</CardTitle>
                  <CardDescription>By customer count.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Split label="Repeat" value={repeat} total={total} />
                  <Split label="One-time" value={total - repeat} total={total} />
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Split({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {value} · {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full bg-primary/80")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
