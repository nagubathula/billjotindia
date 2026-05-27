import { notFound } from "next/navigation";
import { requireRole, getCurrentUser, getRestaurantBySlug } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
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
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { CreateUserForm } from "./CreateUserForm";
import { UserRowActions } from "./UserRowActions";
import type { AppRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  user: "Cashier",
};

type Props = { params: { slug: string } };

export default async function UsersPage({ params }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  // Tighter gate than the admin layout — only admins manage users.
  await requireRole(["admin"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/users`,
  });
  const me = await getCurrentUser();
  const admin = createAdminClient();

  // Users list is restaurant-scoped: only users with a user_roles row for
  // THIS restaurant. listUsers (auth.admin) returns everyone in Supabase
  // auth; we filter by joining to user_roles.
  const [{ data: usersPage, error: usersErr }, { data: rolesRows, error: rolesErr }] =
    await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      admin
        .from("user_roles")
        .select("user_id, role")
        .eq("restaurant_id", restaurant.id),
    ]);

  const rolesByUser = new Map<string, AppRole>();
  for (const r of rolesRows ?? []) {
    const existing = rolesByUser.get(r.user_id);
    const precedence: Record<AppRole, number> = { admin: 3, manager: 2, user: 1 };
    const incoming = r.role as AppRole;
    if (!existing || precedence[incoming] > precedence[existing]) {
      rolesByUser.set(r.user_id, incoming);
    }
  }

  // Filter the auth users list to only those who have a role in this
  // restaurant. (Phase 3b TODO: also surface users with no role but who
  // signed up as customers of this restaurant.)
  const scopedUsers = (usersPage?.users ?? []).filter((u) =>
    rolesByUser.has(u.id),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Staff with access to this restaurant. Cashiers can use the POS; managers also see admin; admins can manage users + settings."
      />

      <Card>
        <CardHeader>
          <CardTitle>Create a new user</CardTitle>
          <CardDescription>
            Pick an email, set a starting password, choose their role. Share
            the credentials with them securely (WhatsApp, in person). They can
            change their password later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateUserForm restaurantId={restaurant.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
          <CardDescription>
            {usersErr
              ? `Couldn't load users: ${usersErr.message}`
              : rolesErr
                ? `Couldn't load roles: ${rolesErr.message}`
                : `${scopedUsers.length} ${scopedUsers.length === 1 ? "user" : "users"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {scopedUsers.map((u) => {
                const role = rolesByUser.get(u.id) ?? null;
                const isSelf = me?.id === u.id;
                const name =
                  (u.user_metadata?.display_name as string | undefined) ??
                  (u.user_metadata?.full_name as string | undefined) ??
                  null;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {name ?? <span className="text-muted-foreground">—</span>}
                      {isSelf && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          you
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      {role ? (
                        <Badge variant={role === "admin" ? "default" : "secondary"}>
                          {ROLE_LABEL[role]}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          no access
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleString("en-IN")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <UserRowActions
                        userId={u.id}
                        userEmail={u.email ?? "(no email)"}
                        restaurantId={restaurant.id}
                        currentRole={role}
                        isSelf={isSelf}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {scopedUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No users yet. Create the first one above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
