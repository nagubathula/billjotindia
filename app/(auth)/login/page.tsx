import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./LoginForm";

type SearchParams = { next?: string; error?: string };

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  // Empty next = "no specific destination requested"; the sign-in action
  // will then resolve to the user's primary restaurant's POS, or /dashboard.
  const next = searchParams.next ?? "";
  const forbidden = searchParams.error === "forbidden";
  const otherError =
    searchParams.error && searchParams.error !== "forbidden"
      ? decodeURIComponent(searchParams.error)
      : null;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          {forbidden
            ? "You don't have permission for that page. Sign in with a different account."
            : otherError
              ? otherError
              : "Sign in to your account — staff and customers."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={next} />
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-1 text-xs text-muted-foreground">
        <div>
          New customer?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </div>
        <div>Staff: ask your admin to set up your account.</div>
      </CardFooter>
    </Card>
  );
}
