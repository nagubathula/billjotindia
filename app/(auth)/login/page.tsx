import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "./LoginForm";

type SearchParams = { next?: string; error?: string };

export default async function LoginPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  // Empty next = "no specific destination requested"; the sign-in action
  // will then resolve to the user's primary restaurant's POS, or /dashboard.
  const next = searchParams.next ?? "";
  const forbidden = searchParams.error === "forbidden";
  const otherError =
    searchParams.error && searchParams.error !== "forbidden"
      ? decodeURIComponent(searchParams.error)
      : null;
  const notice = forbidden
    ? "You don't have permission for that page. Sign in with a different account."
    : otherError;

  return (
    <>
      <div className="mt-6 text-center">
        <h1 className="text-3xl font-bold">Sign in to Billjot</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          One account for staff and customers.
        </p>
      </div>

      {notice && (
        <p
          role="alert"
          className="mt-6 rounded-xl bg-destructive/10 px-4 py-3 text-center text-xs text-destructive"
        >
          {notice}
        </p>
      )}

      <Card className="mt-6 py-6">
        <CardContent className="px-6">
          <LoginForm next={next} />
        </CardContent>
      </Card>

      <div className="mt-6 space-y-1.5 text-center text-xs text-muted-foreground">
        <p>
          New to Billjot?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
        <p>Staff: ask your admin to set up your account.</p>
      </div>
    </>
  );
}
