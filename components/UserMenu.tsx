import Link from "next/link";
import {
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Store,
  UserCog,
  User as UserIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentUser, getUserRestaurants } from "@/lib/auth";
import type { AppRole } from "@/lib/types";

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  user: "Cashier",
};

const ROLE_ICON: Record<AppRole, React.ComponentType<{ className?: string }>> = {
  admin: ShieldCheck,
  manager: UserCog,
  user: UserIcon,
};

// Server component — reads session + all restaurants the user has access to
// and renders a multi-restaurant aware dropdown. If signed out, renders a
// "Sign in" link. If signed in with multiple restaurants, shows each one as
// its own switchable section.
export async function UserMenu({ next = "/" }: { next?: string }) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(next)}`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        Sign in
      </Link>
    );
  }

  const restaurants = await getUserRestaurants();
  const primary = restaurants[0] ?? null;
  const role = primary?.role ?? null;
  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "?";
  const initials = displayName
    .split(/\s+/)
    .map((s) => s.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const RoleIcon = role ? ROLE_ICON[role] : UserIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-2 px-2",
        )}
      >
        <Avatar className="h-6 w-6">
          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden text-sm sm:inline">{displayName}</span>
        {role && (
          <Badge variant="secondary" className="hidden gap-1 sm:inline-flex">
            <RoleIcon className="h-3 w-3" />
            {ROLE_LABEL[role]}
          </Badge>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="truncate text-sm font-medium">{displayName}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        {restaurants.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                {restaurants.length === 1 ? "Your restaurant" : "Your restaurants"}
              </DropdownMenuLabel>
              {restaurants.map(({ restaurant: r, role: rRole }) => (
                <DropdownMenuItem key={r.id} className="flex-col items-start gap-0.5 py-1.5">
                  <Link
                    href={`/r/${r.slug}/pos`}
                    className="flex w-full items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{r.name}</span>
                    </span>
                    <Badge
                      variant={rRole === "admin" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {ROLE_LABEL[rRole]}
                    </Badge>
                  </Link>
                </DropdownMenuItem>
              ))}

              <DropdownMenuItem>
                <Link
                  href="/dashboard"
                  className="flex w-full items-center gap-1.5 text-muted-foreground"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Dashboard
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem>
          <Link href="/dashboard" className="w-full text-muted-foreground">
            My account
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem>
          {/* POST form so the sign-out is non-CSRF-triggerable. */}
          <form action="/logout" method="post" className="w-full">
            <button
              type="submit"
              className="flex w-full items-center gap-2 text-left text-sm"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
