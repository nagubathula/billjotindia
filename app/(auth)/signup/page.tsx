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
      <>
        <div className="mt-6 text-center">
          <h1 className="text-3xl font-bold">New restaurant</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {name ? `Signed in as ${name}. ` : ""}Give it a name and
            you&apos;ll be its admin.
          </p>
        </div>

        <Card className="mt-6 py-6">
          <CardContent className="px-6">
            <CreateRestaurantForm />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to dashboard
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <div className="mt-6 text-center">
        <h1 className="text-3xl font-bold">Create your restaurant</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set up your POS in two minutes. You&apos;ll be the admin, and can add
          staff later from your dashboard.
        </p>
      </div>

      <Card className="mt-6 py-6">
        <CardContent className="px-6">
          <SignupForm />
        </CardContent>
      </Card>

      <div className="mt-6 space-y-1.5 text-center text-xs text-muted-foreground">
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
        <p>Customer ordering sign-up is per restaurant, and coming soon.</p>
      </div>
    </>
  );
}
