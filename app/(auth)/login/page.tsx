import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import {
  getCurrentUser,
  isSafeInternalNext,
  resolveDefaultHome,
} from "@/lib/auth";
import { LoginForm } from "./LoginForm";

type SearchParams = { next?: string; error?: string };

export default async function LoginPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const next = searchParams.next ?? "";
  const forbidden = searchParams.error === "forbidden";

  // If already signed in (and not deliberately switching accounts after a
  // forbidden bounce), go straight into the workspace.
  if (!forbidden) {
    const user = await getCurrentUser();
    if (user) {
      redirect(isSafeInternalNext(next) ? next : await resolveDefaultHome());
    }
  }

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
          Sign in to your restaurant workspace.
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
