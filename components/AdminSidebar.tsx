"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bike,
  Boxes,
  Calculator,
  ChefHat,
  ChevronLeft,
  ExternalLink,
  Gauge,
  KeyRound,
  LayoutGrid,
  ListOrdered,
  LogOut,
  MonitorSmartphone,
  Settings,
  ShoppingBag,
  Store,
  Users,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppRole, Restaurant } from "@/lib/types";

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  user: "Cashier",
};

type Props = {
  restaurant: Restaurant;
  role: AppRole;
  userEmail: string;
  userName: string;
};

export function AdminSidebar({ restaurant, role, userEmail, userName }: Props) {
  const pathname = usePathname() ?? "";
  const base = `/r/${restaurant.slug}/admin`;

  const isActive = (segment: string) =>
    pathname === `${base}/${segment}` ||
    pathname.startsWith(`${base}/${segment}/`);

  const initials =
    userName
      .split(/\s+/)
      .map((s) => s.charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "ST";

  return (
    <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex print:hidden">
      {/* Workspace header */}
      <div className="border-b border-sidebar-border px-4 py-3.5">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All workspaces
        </Link>
        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-2xs">
            <Store className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight tracking-tight">
              {restaurant.name}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              Restaurant Admin
            </div>
          </div>
        </div>

        {/* Quick Launchers */}
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Link
            href={`/r/${restaurant.slug}/pos`}
            className={cn(
              buttonVariants({ variant: "default", size: "xs" }),
              "w-full justify-center",
            )}
          >
            <MonitorSmartphone className="h-3 w-3" />
            Open POS
          </Link>
          <Link
            href={`/r/${restaurant.slug}`}
            target="_blank"
            className={cn(
              buttonVariants({ variant: "outline", size: "xs" }),
              "w-full justify-center",
            )}
          >
            Storefront
            <ExternalLink className="h-2.5 w-2.5 opacity-60" />
          </Link>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
        <NavGroup label="Operations">
          <NavItem href={base} icon={Gauge} active={pathname === base}>
            Overview
          </NavItem>
          <NavItem
            href={`${base}/orders`}
            icon={ListOrdered}
            active={isActive("orders")}
          >
            Orders
          </NavItem>
          <NavItem
            href={`${base}/kitchen`}
            icon={ChefHat}
            active={isActive("kitchen")}
          >
            Kitchen (KDS)
          </NavItem>
          <NavItem
            href={`${base}/tables`}
            icon={LayoutGrid}
            active={isActive("tables")}
          >
            Tables & Floor
          </NavItem>
          <NavItem
            href={`${base}/register`}
            icon={Calculator}
            active={isActive("register")}
          >
            Day-End & Register
          </NavItem>
        </NavGroup>

        <NavGroup label="Catalog & Inventory">
          <NavItem
            href={`${base}/menu`}
            icon={ShoppingBag}
            active={isActive("menu")}
          >
            Menu & Pricing
          </NavItem>
          <NavItem
            href={`${base}/inventory`}
            icon={Boxes}
            active={isActive("inventory")}
          >
            Inventory & Recipes
          </NavItem>
          <NavItem
            href={`${base}/channels`}
            icon={Bike}
            active={isActive("channels")}
          >
            Delivery Channels
          </NavItem>
        </NavGroup>

        <NavGroup label="Insights">
          <NavItem
            href={`${base}/reports`}
            icon={BarChart3}
            active={isActive("reports")}
          >
            Reports & GST
          </NavItem>
          <NavItem
            href={`${base}/customers`}
            icon={UsersRound}
            active={isActive("customers")}
          >
            Customers & CRM
          </NavItem>
        </NavGroup>

        <NavGroup label="Administration">
          {role === "admin" && (
            <NavItem
              href={`${base}/users`}
              icon={Users}
              active={isActive("users")}
            >
              Staff & Roles
            </NavItem>
          )}
          {role === "admin" && (
            <NavItem
              href={`${base}/api-keys`}
              icon={KeyRound}
              active={isActive("api-keys")}
            >
              API keys
            </NavItem>
          )}
          <NavItem
            href={`${base}/settings`}
            icon={Settings}
            active={isActive("settings")}
          >
            Outlet Settings
          </NavItem>
        </NavGroup>
      </nav>

      {/* Staff footer */}
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
                {ROLE_LABEL[role]}
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

function NavGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="px-2.5 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function NavItem({
  href,
  icon: Icon,
  children,
  active,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      />
      <span className="flex-1 truncate">{children}</span>
    </Link>
  );
}
