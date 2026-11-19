"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setSelectedOutletAction } from "@/app/(pos)/r/[slug]/pos/actions";
import type { Outlet } from "@/lib/types";

export function MenuOutletBar({
  slug,
  outlets,
  currentOutletId,
}: {
  slug: string;
  outlets: Outlet[];
  currentOutletId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (outlets.length <= 1) return null;

  const currentOutlet =
    outlets.find((o) => o.id === currentOutletId) ?? outlets[0];

  return (
    <div className="flex items-center gap-2">
      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
        <Store className="h-3.5 w-3.5" />
        Outlet:
      </span>
      <Select
        value={currentOutletId}
        disabled={pending}
        onValueChange={(nextId) => {
          if (!nextId || nextId === currentOutletId) return;
          start(async () => {
            await setSelectedOutletAction(slug, nextId);
            router.refresh();
          });
        }}
      >
        <SelectTrigger size="sm" className="w-44 text-xs">
          <SelectValue>{currentOutlet?.name ?? "Select outlet"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {outlets.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
