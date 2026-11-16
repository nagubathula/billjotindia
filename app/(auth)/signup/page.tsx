import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { SignupForm } from "./SignupForm";
import { CreateRestaurantForm } from "./CreateRestaurantForm";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const user = await getCurrentUser();

  // Already signed in → adding another restaurant. Don't ask them to make a
  // new account; just take a restaurant name and create it under this user.
  if (user) {
    const name =
      (user.user_metadata?.display_name as string | undefined) ??
      (user.user_metadata?.full_name as string | undefined) ??
      user.email;
    return (
      <div>
        <div className="text-center lg:text-left">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Add a new restaurant
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {name ? `Signed in as ${name}. ` : ""}Give it a name and
            you&apos;ll be its admin.
          </p>
        </div>

        <Card className="mt-6 rounded-2xl border-border/80 py-6 shadow-float">
          <CardContent className="px-6 sm:px-7">
            <CreateRestaurantForm />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to dashboard
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center lg:text-left">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Create your restaurant
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Set up your POS in two minutes. You&apos;ll be the admin, and can add
          managers, cashiers, and captains anytime.
        </p>
      </div>

      <Card className="mt-6 rounded-2xl border-border/80 py-6 shadow-float">
        <CardContent className="px-6 sm:px-7">
          <SignupForm />
        </CardContent>
      </Card>

      <div className="mt-6 text-center text-xs text-muted-foreground">
        <p>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
