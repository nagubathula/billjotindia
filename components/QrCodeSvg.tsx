import { useMemo } from "react";
import { generateQrSvgPath } from "@/lib/qrcode-svg";
import { cn } from "@/lib/utils";

export function QrCodeSvg({
  value,
  size = 160,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const { viewBoxSize, pathD } = useMemo(
    () => generateQrSvgPath(value || "https://billjot.in"),
    [value],
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code"
      className={cn("bg-white text-zinc-950", className)}
    >
      <rect width={viewBoxSize} height={viewBoxSize} fill="#ffffff" />
      <path d={pathD} fill="#09090b" />
    </svg>
  );
}
