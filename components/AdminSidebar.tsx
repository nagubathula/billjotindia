"use client";

// Persistent left sidebar for admin sections. The active nav item is derived
// from the URL so we don't have to thread "which page am I on" through every
// route. Receives user/restaurant/role from the server-side layout as props.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChefHat,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  MonitorSmartphone,
  Settings,
  ShoppingBag,
  Store,
  UserCog,
  Users,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

  const initials = userName
    .split(/\s+/)
    .map((s) => s.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="hidden h-screen w-60 shrink-0 flex-col border-r bg-card md:flex md:sticky md:top-0">
      <div className="border-b px-4 py-4">
        <Link
          href="/dashboard"
          className="block text-xs text-muted-foreground hover:text-foreground"
        >
          ← All restaurants
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Store className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">
              {restaurant.name}
            </div>
            <div className="truncate font-mono text-[10px] text-muted-foreground">
              /r/{restaurant.slug}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
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
          Kitchen
        </NavItem>
        <NavItem
          href={`${base}/menu`}
          icon={ShoppingBag}
          active={isActive("menu")}
        >
          Menu
        </NavItem>
        <NavItem
          href={`${base}/reports`}
          icon={BarChart3}
          active={isActive("reports")}
        >
          Reports
        </NavItem>
        <NavItem
          href={`${base}/customers`}
          icon={UsersRound}
          active={isActive("customers")}
        >
          Customers
        </NavItem>
        {role === "admin" && (
          <NavItem
            href={`${base}/users`}
            icon={Users}
            active={isActive("users")}
          >
            Users
          </NavItem>
        )}
        <NavItem
          href={`${base}/settings`}
          icon={Settings}
          active={isActive("settings")}
        >
          Settings
        </NavItem>

        <div className="my-2 border-t" />

        <NavItem
          href={`/r/${restaurant.slug}/pos`}
          icon={MonitorSmartphone}
          external
        >
          Open POS
        </NavItem>
        <NavItem href="/dashboard" icon={LayoutDashboard} external>
          Dashboard
        </NavItem>
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium leading-tight">
              {userName}
            </div>
            <Badge
              variant={role === "admin" ? "default" : "secondary"}
              className="mt-0.5 gap-1 text-[9px]"
            >
              {role === "admin" ? <UserCog className="h-2.5 w-2.5" /> : null}
              {ROLE_LABEL[role]}
            </Badge>
          </div>
        </div>
        <div className="mt-1 truncate text-[10px] text-muted-foreground">
          {userEmail}
        </div>
        <form action="/logout" method="post" className="mt-2">
          <button
            type="submit"
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-3 w-3" /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  icon: Icon,
  children,
  active,
  external,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  active?: boolean;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{children}</span>
      {external && <span className="text-[10px] opacity-50">↗</span>}
    </Link>
  );
}
