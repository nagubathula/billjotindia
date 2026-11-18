"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Crown,
  Gift,
  IndianRupee,
  Loader2,
  MessageCircle,
  Plus,
  Repeat,
  Search,
  Sparkles,
  Tag,
  Trash2,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
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
import {
  COUPON_CHANNELS,
  COUPON_CHANNEL_LABEL,
  formatCouponOfferLabel,
  type CouponChannel,
  type CouponDiscountType,
} from "@/lib/coupons";
import type { Coupon } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  createCouponAction,
  deleteCouponAction,
  toggleCouponActiveAction,
} from "./actions";

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
  restaurantSlug,
  restaurantName,
  customers,
  initialCoupons,
}: {
  restaurantSlug: string;
  restaurantName: string;
  customers: CustomerRow[];
  initialCoupons: Coupon[];
}) {
  const [segment, setSegment] = useState<
    "all" | "vip" | "repeat" | "onetime" | "atrisk"
  >("all");
  const [search, setSearch] = useState("");
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [addingCoupon, setAddingCoupon] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<CouponDiscountType>("percentage");
  const [newVal, setNewVal] = useState("10");
  const [newMaxDiscount, setNewMaxDiscount] = useState("150");
  const [newMin, setNewMin] = useState("399");
  const [newChannel, setNewChannel] = useState<CouponChannel>("all");
  const [newUsageLimit, setNewUsageLimit] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    setCouponError(null);
    setActionMsg(null);
    startTransition(async () => {
      const res = await createCouponAction(restaurantSlug, {
        code: newCode,
        title: newTitle || `${newVal}${newType === "percentage" ? "%" : "₹"} offer`,
        discount_type: newType,
        discount_value: Number(newVal),
        max_discount:
          newType === "percentage" && Number(newMaxDiscount) > 0
            ? Number(newMaxDiscount)
            : null,
        min_order_amount: Number(newMin) || 0,
        channel: newChannel,
        usage_limit: Number(newUsageLimit) > 0 ? Number(newUsageLimit) : null,
        expires_at: newExpiresAt || null,
      });
      if (!res.ok) {
        setCouponError(res.error);
        return;
      }
      setCoupons((prev) => [res.coupon, ...prev]);
      setNewCode("");
      setNewTitle("");
      setNewUsageLimit("");
      setNewExpiresAt("");
      setAddingCoupon(false);
      setActionMsg(`Coupon ${res.coupon.code} is now live.`);
    });
  }

  function handleToggleCoupon(cp: Coupon, checked: boolean) {
    setActionMsg(null);
    setCoupons((prev) =>
      prev.map((x) => (x.id === cp.id ? { ...x, is_active: checked } : x)),
    );
    startTransition(async () => {
      const res = await toggleCouponActiveAction(restaurantSlug, cp.id, checked);
      if (!res.ok) {
        setCoupons((prev) =>
          prev.map((x) => (x.id === cp.id ? { ...x, is_active: cp.is_active } : x)),
        );
        setActionMsg(res.error);
      }
    });
  }

  function handleDeleteCoupon(cp: Coupon) {
    setActionMsg(null);
    startTransition(async () => {
      const res = await deleteCouponAction(restaurantSlug, cp.id);
      if (!res.ok) {
        setActionMsg(res.error);
        return;
      }
      setCoupons((prev) => prev.filter((x) => x.id !== cp.id));
      setActionMsg(`Deleted coupon ${cp.code}.`);
    });
  }

  const activePromoCode = coupons.find((c) => c.is_active)?.code ?? "WELCOME50";

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

      {actionMsg && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
          {actionMsg}
        </div>
      )}

      <Tabs defaultValue={customers.length > 0 ? "customers" : "coupons"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="customers">
              Customer CRM &amp; Loyalty ({customers.length})
            </TabsTrigger>
            <TabsTrigger value="coupons">
              Coupons &amp; Promo Offers ({coupons.length})
            </TabsTrigger>
          </TabsList>

          <Button
            size="sm"
            onClick={() => {
              setCouponError(null);
              setAddingCoupon(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Promo Coupon
          </Button>
        </div>

        <Dialog open={addingCoupon} onOpenChange={setAddingCoupon}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Promo Coupon</DialogTitle>
              <DialogDescription>
                Saved in the database and enforced automatically across Checkout, API Storefronts, and POS.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddCoupon} className="grid gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Coupon Code</Label>
                  <Input
                    placeholder="e.g. GUNTUR20"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    required
                    autoFocus
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Channel</Label>
                  <select
                    value={newChannel}
                    onChange={(e) => setNewChannel(e.target.value as CouponChannel)}
                    className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                  >
                    {COUPON_CHANNELS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs">Offer Description</Label>
                <Input
                  placeholder="20% off on orders above ₹499"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Discount Type</Label>
                  <select
                    value={newType}
                    onChange={(e) =>
                      setNewType(e.target.value as CouponDiscountType)
                    }
                    className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Flat Amount (₹)</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">
                    {newType === "percentage" ? "Discount (%)" : "Discount (₹)"}
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={newType === "percentage" ? 100 : undefined}
                    step="0.01"
                    value={newVal}
                    onChange={(e) => setNewVal(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Minimum Bill (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={newMin}
                    onChange={(e) => setNewMin(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {newType === "percentage" && (
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Max Cap (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="Optional"
                      value={newMaxDiscount}
                      onChange={(e) => setNewMaxDiscount(e.target.value)}
                    />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label className="text-xs">Usage Limit</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Unlimited"
                    value={newUsageLimit}
                    onChange={(e) => setNewUsageLimit(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Expires On</Label>
                  <Input
                    type="date"
                    value={newExpiresAt}
                    onChange={(e) => setNewExpiresAt(e.target.value)}
                  />
                </div>
              </div>

              {couponError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {couponError}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setAddingCoupon(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Create Coupon
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* TAB 1: Customer Directory & Segments */}
        <TabsContent value="customers" className="mt-4 space-y-4">
          {customers.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  icon={UsersRound}
                  title="No first-party customers yet"
                  description="Once guests order directly from your storefront with their name & email, they will appear here automatically. You can still configure promo coupons right now."
                />
              </CardContent>
            </Card>
          ) : (
            <>
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
                        const cleanDigits = (c.phone ?? "919848022311").replace(
                          /\D/g,
                          "",
                        );
                        const waText = encodeURIComponent(
                          `Namaste ${c.name.split(" ")[0]}! You have ${c.points} loyalty points at ${restaurantName}. Use code ${activePromoCode} on your next order!`,
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
            </>
          )}
        </TabsContent>

        {/* TAB 2: DB-backed Coupons & Promo Codes */}
        <TabsContent value="coupons" className="mt-4">
          {coupons.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  icon={Tag}
                  title="No promo coupons yet"
                  description="Create percentage or flat discount codes synced across online checkout, API storefronts, and POS billing."
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {coupons.map((cp) => {
                const channelLabel =
                  COUPON_CHANNEL_LABEL[cp.channel as CouponChannel] ??
                  "All Channels";
                return (
                  <Card key={cp.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-foreground/40 bg-muted/50 px-2.5 py-1 font-mono text-xs font-bold tracking-wider">
                          <Tag className="h-3 w-3" />
                          {cp.code}
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={cp.is_active}
                            disabled={pending}
                            onCheckedChange={(checked) =>
                              handleToggleCoupon(cp, checked)
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={pending}
                            title="Delete coupon"
                            onClick={() => handleDeleteCoupon(cp)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <CardTitle className="mt-2 text-sm">{cp.title}</CardTitle>
                      <CardDescription className="text-xs">
                        {formatCouponOfferLabel(cp)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                      <Badge variant="outline" className="font-normal">
                        {channelLabel}
                      </Badge>
                      <span className="tabular-nums">
                        {cp.used_count}
                        {cp.usage_limit ? ` / ${cp.usage_limit}` : ""} uses
                      </span>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
