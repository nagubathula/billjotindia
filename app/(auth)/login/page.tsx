import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PwaInstallButton } from "@/components/PwaInstallButton";
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
    <div>
      <div className="text-center lg:text-left">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome back
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sign in to open your restaurant POS, kitchen display, or admin console.
        </p>
      </div>

      {notice && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <Card className="mt-6 rounded-2xl border-border/80 py-6 shadow-float">
        <CardContent className="px-6 sm:px-7">
          <LoginForm next={next} />
        </CardContent>
      </Card>

      <div className="mt-6 space-y-1.5 text-center text-xs text-muted-foreground">
        <p>
          Setting up a new restaurant?{" "}
          <Link
            href="/signup"
            className="font-semibold text-primary hover:underline"
          >
            Create an account
          </Link>
        </p>
        <p>Staff &amp; Captains: use the credentials provided by your manager.</p>
      </div>

      <div className="mt-4 flex justify-center">
        <PwaInstallButton variant="auth" />
      </div>
    </div>
  );
}
