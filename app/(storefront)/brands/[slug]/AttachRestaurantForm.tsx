"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { attachRestaurantToBrandAction } from "../actions";
import type { Restaurant } from "@/lib/types";

export function AttachRestaurantForm({
  brandId,
  restaurants,
}: {
  brandId: number;
  restaurants: Restaurant[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<string>(String(restaurants[0]?.id ?? ""));
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid min-w-[200px] flex-1 gap-1.5">
        <Label>Restaurant</Label>
        <Select value={pick} onValueChange={(v) => v && setPick(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {restaurants.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        disabled={pending || !pick}
        onClick={() => {
          setErr(null);
          start(async () => {
            const fd = new FormData();
            fd.set("brand_id", String(brandId));
            fd.set("restaurant_id", pick);
            const res = await attachRestaurantToBrandAction(fd);
            if (!res.ok) setErr(res.error);
            else router.refresh();
          });
        }}
      >
        {pending ? "Attaching…" : "Attach"}
      </Button>

      {err && (
        <p className="basis-full text-sm text-destructive" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
