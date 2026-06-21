import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create a new restaurant</CardTitle>
          <CardDescription>
            {name ? `Signed in as ${name}. ` : ""}You&apos;ll be the admin of
            this new restaurant — just give it a name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateRestaurantForm />
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          <Link
            href="/dashboard"
            className="font-medium text-primary hover:underline"
          >
            ← Back to dashboard
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Get your restaurant on Billjot</CardTitle>
        <CardDescription>
          Set up your POS in two minutes. You become the admin of a new
          restaurant tenant; staff are added later from your dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-1 text-xs text-muted-foreground">
        <div>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </div>
        <div>
          Customer ordering signup is per-restaurant — coming soon at{" "}
          <span className="font-mono">/r/[shop]/signup</span>.
        </div>
      </CardFooter>
    </Card>
  );
}
