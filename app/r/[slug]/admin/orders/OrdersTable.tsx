"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Order, Outlet } from "@/lib/types";

type Props = {
  orders: Order[];
  outlets: Outlet[];
  restaurantSlug: string;
  outletFilter: number | null;
};

const ALL_VALUE = "__all__";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  confirmed: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  preparing: "bg-violet-500/10 text-violet-600 ring-violet-500/20",
  ready: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  completed: "bg-muted text-muted-foreground ring-border",
  cancelled: "bg-destructive/10 text-destructive ring-destructive/20",
};

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "pending";
  const style = STATUS_STYLES[s] ?? "bg-muted text-muted-foreground ring-border";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
        style,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {s}
    </span>
  );
}

export function OrdersTable({ orders, outlets, restaurantSlug, outletFilter }: Props) {
  const router = useRouter();
  const outletById = new Map(outlets.map((o) => [o.id, o]));

  const onChange = (v: string | null) => {
    const url =
      !v || v === ALL_VALUE
        ? `/r/${restaurantSlug}/admin/orders`
        : `/r/${restaurantSlug}/admin/orders?outlet=${v}`;
    router.push(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-end justify-between gap-3">
          <div>
            <CardTitle>Recent orders</CardTitle>
            <CardDescription>
              {orders.length} {orders.length === 1 ? "order" : "orders"}.
            </CardDescription>
          </div>
          {outlets.length > 1 && (
            <Select
              value={outletFilter ? String(outletFilter) : ALL_VALUE}
              onValueChange={onChange}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All outlets</SelectItem>
                {outlets.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>Customer</TableHead>
              {outlets.length > 1 && <TableHead>Outlet</TableHead>}
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Placed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => {
              const outlet = outletById.get(o.outlet_id);
              const detailHref = `/r/${restaurantSlug}/admin/orders/${o.id}`;
              return (
                <TableRow
                  key={o.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => router.push(detailHref)}
                >
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={detailHref}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {o.unique_order_id ?? o.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{o.customer_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.customer_email}
                    </div>
                  </TableCell>
                  {outlets.length > 1 && (
                    <TableCell className="text-muted-foreground">
                      {outlet?.name ?? `#${o.outlet_id}`}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {o.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹{Number(o.total_amount).toFixed(0)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {o.created_at
                      ? new Date(o.created_at).toLocaleString("en-IN")
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            {orders.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={outlets.length > 1 ? 7 : 6}
                  className="text-center text-muted-foreground"
                >
                  No orders match the filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
