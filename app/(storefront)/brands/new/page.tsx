import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { NewBrandForm } from "./NewBrandForm";

export const dynamic = "force-dynamic";

export default async function NewBrandPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/brands/new");

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Create a brand</CardTitle>
        <CardDescription>
          A brand groups multiple restaurants you operate as franchises. After
          creating, attach existing restaurants you admin.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <NewBrandForm />
      </CardContent>
    </Card>
  );
}
