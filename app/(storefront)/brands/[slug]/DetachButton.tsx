"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detachRestaurantFromBrandAction } from "../actions";

export function DetachButton({
  brandId,
  restaurantId,
}: {
  brandId: number;
  restaurantId: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("Detach this restaurant from the brand? Its data stays.")) return;
        start(async () => {
          const fd = new FormData();
          fd.set("brand_id", String(brandId));
          fd.set("restaurant_id", String(restaurantId));
          const res = await detachRestaurantFromBrandAction(fd);
          if (!res.ok) alert(res.error);
          else router.refresh();
        });
      }}
      className="text-muted-foreground"
    >
      <Unplug className="h-3 w-3" />
    </Button>
  );
}
