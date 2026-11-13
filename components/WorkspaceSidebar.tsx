"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Plus,
  ReceiptText,
  Store,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { AppRole, Brand, Restaurant } from "@/lib/types";

type Props = {
  restaurants: { restaurant: Restaurant; role: AppRole }[];
  brands: Brand[];
  userName: string;
  userEmail: string;
};

export function WorkspaceSidebar({
  restaurants,
  brands,
  userName,
  userEmail,
}: Props) {
  const pathname = usePathname() ?? "";

  const initials =
    userName
      .split(/\s+/)
      .map((s) => s.charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "BJ";

  const highestRole: AppRole = restaurants.some((r) => r.role === "admin")
    ? "admin"
    : restaurants.some((r) => r.role === "manager")
      ? "manager"
      : "user";

  return (
    <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex">
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3.5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-2xs">
            <ReceiptText className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight tracking-tight">
              Billjot
            </div>
            <div className="text-[11px] text-muted-foreground">
              Workspace Console
            </div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-3">
        {/* Workspace Overview */}
        <div className="space-y-0.5">
          <div className="px-2.5 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Overview
          </div>
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              pathname === "/dashboard"
                ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">All Workspaces</span>
          </Link>
        </div>

        {/* Brands HQ */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between px-2.5 pb-1">
            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Brands ({brands.length})
            </span>
            <Link
              href="/brands/new"
              title="Create a brand"
              className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </Link>
          </div>
          {brands.length === 0 ? (
            <Link
              href="/brands/new"
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Create first brand
            </Link>
          ) : (
            brands.map((b) => {
              const href = `/brands/${b.slug}`;
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={b.id}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{b.name}</span>
                </Link>
              );
            })
          )}
        </div>

        {/* Restaurants */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between px-2.5 pb-1">
            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Restaurants ({restaurants.length})
            </span>
            <Link
              href="/signup"
              title="New restaurant"
              className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </Link>
          </div>
          {restaurants.map(({ restaurant: r, role }) => {
            const isOps = role === "admin" || role === "manager";
            const targetHref = isOps
              ? `/r/${r.slug}/admin`
              : `/r/${r.slug}/pos`;
            return (
              <div
                key={r.id}
                className="group flex items-center justify-between gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
              >
                <Link
                  href={targetHref}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <Store className="h-4 w-4 shrink-0" />
                  <span className="truncate">{r.name}</span>
                </Link>
                <Link
                  href={`/r/${r.slug}/pos`}
                  title={`Open ${r.name} POS`}
                  className="inline-flex h-5 items-center gap-1 rounded border border-border bg-background px-1.5 text-[10px] font-medium text-muted-foreground transition hover:border-foreground hover:text-foreground"
                >
                  <MonitorSmartphone className="h-2.5 w-2.5" />
                  POS
                </Link>
              </div>
            );
          })}
        </div>
      </nav>

      {/* User Footer */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 px-1">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[11px] font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-xs font-medium leading-tight">
                {userName}
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {highestRole === "admin"
                  ? "Admin"
                  : highestRole === "manager"
                    ? "Manager"
                    : "Cashier"}
              </Badge>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {userEmail}
            </div>
          </div>
        </div>
        <form action="/logout" method="post" className="mt-2">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
