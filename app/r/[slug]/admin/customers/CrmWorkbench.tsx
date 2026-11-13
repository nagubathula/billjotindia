"use client";

import { useMemo, useState } from "react";
import {
  Crown,
  Gift,
  IndianRupee,
  MessageCircle,
  Plus,
  Repeat,
  Search,
  Sparkles,
  Tag,
  UsersRound,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type CustomerRow = {
  email: string;
  name: string;
  phone: string | null;
  orders: number;
  spent: number;
  last: number;
  first: number;
  lastDateLabel: string;
  daysSinceLast: number;
  points: number;
};

type PromoCoupon = {
  id: string;
  code: string;
  title: string;
  type: "Percentage" | "Flat ₹";
  value: number;
  minOrder: number;
  uses: number;
  channel: "POS & Storefront" | "Storefront Only" | "Dine-in Only";
  active: boolean;
};

const INITIAL_COUPONS: PromoCoupon[] = [
  {
    id: "cp-1",
    code: "WELCOME15",
    title: "15% off on first direct storefront order",
    type: "Percentage",
    value: 15,
    minOrder: 299,
    uses: 42,
    channel: "Storefront Only",
    active: true,
  },
  {
    id: "cp-2",
    code: "ANDHRA50",
    title: "Flat ₹50 off on Andhra Bhojanam & Biryanis",
    type: "Flat ₹",
    value: 50,
    minOrder: 349,
    uses: 68,
    channel: "POS & Storefront",
    active: true,
  },
  {
    id: "cp-3",
    code: "FAMILY100",
    title: "Flat ₹100 off on Family Pack Biryanis & Pulaos",
    type: "Flat ₹",
    value: 100,
    minOrder: 799,
    uses: 29,
    channel: "POS & Storefront",
    active: true,
  },
  {
    id: "cp-4",
    code: "CORPORATE10",
    title: "10% Hitech City / Jubilee Hills corporate lunch discount",
    type: "Percentage",
    value: 10,
    minOrder: 500,
    uses: 19,
    channel: "Dine-in Only",
    active: true,
  },
  {
    id: "cp-5",
    code: "FESTIVE20",
    title: "20% festive special offer",
    type: "Percentage",
    value: 20,
    minOrder: 999,
    uses: 14,
    channel: "POS & Storefront",
    active: false,
  },
];

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

export function CrmWorkbench({
  restaurantName,
  customers,
}: {
  restaurantName: string;
  customers: CustomerRow[];
}) {
  const [segment, setSegment] = useState<
    "all" | "vip" | "repeat" | "onetime" | "atrisk"
  >("all");
  const [search, setSearch] = useState("");
  const [coupons, setCoupons] = useState<PromoCoupon[]>(INITIAL_COUPONS);
  const [addingCoupon, setAddingCoupon] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<PromoCoupon["type"]>("Percentage");
  const [newVal, setNewVal] = useState("10");
  const [newMin, setNewMin] = useState("399");

  const total = customers.length;
  const repeatCount = customers.filter((c) => c.orders > 1).length;
  const vipCount = customers.filter((c) => c.orders >= 5).length;
  const atRiskCount = customers.filter((c) => c.daysSinceLast >= 14).length;
  const repeatRate = total ? Math.round((repeatCount / total) * 100) : 0;
  const totalSpent = customers.reduce((s, c) => s + c.spent, 0);
  const totalPoints = customers.reduce((s, c) => s + c.points, 0);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (segment === "vip" && c.orders < 5) return false;
      if (segment === "repeat" && (c.orders < 2 || c.orders >= 5)) return false;
      if (segment === "onetime" && c.orders !== 1) return false;
      if (segment === "atrisk" && c.daysSinceLast < 14) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [customers, segment, search]);

  function handleAddCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim()) return;
    setCoupons((prev) => [
      {
        id: `cp-${Date.now()}`,
        code: newCode.trim().toUpperCase(),
        title: newTitle.trim() || `${newVal} discount offer`,
        type: newType,
        value: Number(newVal) || 10,
        minOrder: Number(newMin) || 0,
        uses: 0,
        channel: "POS & Storefront",
        active: true,
      },
      ...prev,
    ]);
    setNewCode("");
    setNewTitle("");
    setAddingCoupon(false);
  }

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>First-Party Customers</span>
              <UsersRound className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {total}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {vipCount} VIP Gold · {atRiskCount} inactive &gt;14d
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Customer Repeat Rate</span>
              <Repeat className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {repeatRate}%
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {repeatCount} of {total} ordered more than once
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Lifetime Direct Spend</span>
              <IndianRupee className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {inr(totalSpent)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Avg {inr(total ? totalSpent / total : 0)} lifetime value
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Loyalty Points Issued</span>
              <Gift className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {totalPoints.toLocaleString("en-IN")} pts
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              1 pt per ₹20 spent (₹1 redemption value)
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="customers">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="customers">
              Customer CRM &amp; Loyalty ({customers.length})
            </TabsTrigger>
            <TabsTrigger value="coupons">
              Coupons &amp; Promo Offers ({coupons.length})
            </TabsTrigger>
          </TabsList>

          <Button size="sm" onClick={() => setAddingCoupon((v) => !v)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Promo Coupon
          </Button>
        </div>

        {addingCoupon && (
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Create Promo Code</CardTitle>
              <CardDescription className="text-xs">
                Coupons can be applied at the Counter POS or during online storefront checkout.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleAddCoupon}
                className="grid gap-3 sm:grid-cols-5 sm:items-end"
              >
                <div className="grid gap-1.5">
                  <Label className="text-xs">Coupon Code</Label>
                  <Input
                    placeholder="e.g. GUNTUR20"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    required
                  />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label className="text-xs">Offer Description</Label>
                  <Input
                    placeholder="20% off on orders above ₹499"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Type &amp; Value</Label>
                  <div className="flex gap-1">
                    <select
                      value={newType}
                      onChange={(e) =>
                        setNewType(e.target.value as PromoCoupon["type"])
                      }
                      className="h-9 rounded-lg border border-input bg-card px-2 text-xs"
                    >
                      <option value="Percentage">%</option>
                      <option value="Flat ₹">₹</option>
                    </select>
                    <Input
                      type="number"
                      value={newVal}
                      onChange={(e) => setNewVal(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    Save Coupon
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAddingCoupon(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* TAB 1: Customer Directory & Segments */}
        <TabsContent value="customers" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "all", label: `All (${total})` },
                  { id: "vip", label: `VIP Gold 5+ (${vipCount})` },
                  {
                    id: "repeat",
                    label: `Repeat 2–4 (${Math.max(0, repeatCount - vipCount)})`,
                  },
                  {
                    id: "onetime",
                    label: `One-time (${Math.max(0, total - repeatCount)})`,
                  },
                  { id: "atrisk", label: `Win-Back >14d (${atRiskCount})` },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSegment(s.id)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                    segment === s.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, phone…"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Total Spend</TableHead>
                    <TableHead className="text-right">Avg Order</TableHead>
                    <TableHead className="text-right">Loyalty Pts</TableHead>
                    <TableHead className="text-right">Last Order</TableHead>
                    <TableHead className="text-right">Engage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((c) => {
                    const isVip = c.orders >= 5;
                    const isRepeat = c.orders >= 2;
                    const cleanDigits = (c.phone ?? "919848022311").replace(/\D/g, "");
                    const waText = encodeURIComponent(
                      `Namaste ${c.name.split(" ")[0]}! You have ${c.points} loyalty points at ${restaurantName}. Use code ANDHRA50 for ₹50 off on your next Biryani or Bhojanam order!`,
                    );
                    return (
                      <TableRow key={c.email}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8 border border-border">
                              <AvatarFallback className="text-[11px] font-medium">
                                {initials(c.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 font-medium">
                                <span className="truncate">{c.name}</span>
                                {isVip && (
                                  <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                )}
                              </div>
                              <div className="truncate text-[11px] text-muted-foreground">
                                {c.email}
                                {c.phone ? ` · ${c.phone}` : ""}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isVip ? (
                            <Badge className="bg-amber-500/15 text-amber-800">
                              VIP Gold
                            </Badge>
                          ) : isRepeat ? (
                            <Badge variant="secondary">Regular</Badge>
                          ) : (
                            <Badge variant="outline">New</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.orders}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {inr(c.spent)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {inr(c.spent / c.orders)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-700 tabular-nums">
                            <Sparkles className="h-2.5 w-2.5" />
                            {c.points} pts
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                          {c.lastDateLabel}
                        </TableCell>
                        <TableCell className="text-right">
                          <a
                            href={`https://wa.me/${cleanDigits}?text=${waText}`}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              buttonVariants({ variant: "outline", size: "xs" }),
                              "gap-1",
                            )}
                            title="Send loyalty offer via WhatsApp"
                          >
                            <MessageCircle className="h-3 w-3 text-emerald-600" />
                            WhatsApp
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: Coupons & Promo Codes */}
        <TabsContent value="coupons" className="mt-4">
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {coupons.map((cp) => (
              <Card key={cp.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-foreground/40 bg-muted/50 px-2.5 py-1 font-mono text-xs font-bold tracking-wider">
                      <Tag className="h-3 w-3" />
                      {cp.code}
                    </div>
                    <Switch
                      checked={cp.active}
                      onCheckedChange={(checked) =>
                        setCoupons((prev) =>
                          prev.map((x) =>
                            x.id === cp.id ? { ...x, active: checked } : x,
                          ),
                        )
                      }
                    />
                  </div>
                  <CardTitle className="mt-2 text-sm">{cp.title}</CardTitle>
                  <CardDescription className="text-xs">
                    {cp.type === "Percentage"
                      ? `${cp.value}% OFF`
                      : `Flat ₹${cp.value} OFF`}{" "}
                    · Min bill ₹{cp.minOrder}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <Badge variant="outline" className="font-normal">
                    {cp.channel}
                  </Badge>
                  <span className=" tabular-nums">
                    {cp.uses} redemptions
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
