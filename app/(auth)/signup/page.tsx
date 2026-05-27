import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignupForm } from "./SignupForm";

export default function SignupPage() {
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
