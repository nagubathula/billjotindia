"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function InvoicePrintBar({
  slug,
  invoiceNumber,
}: {
  slug: string;
  invoiceNumber: string;
}) {
  return (
    <div className="mx-auto mb-4 flex max-w-[190mm] items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 shadow-2xs print:hidden">
      <div className="flex items-center gap-3">
        <Link
          href={`/r/${slug}/admin/accounts?tab=invoices`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to Corporate Invoices
        </Link>
        <span className="font-mono text-xs font-semibold text-muted-foreground">
          {invoiceNumber}
        </span>
      </div>
      <Button type="button" size="sm" onClick={() => window.print()}>
        <Printer className="mr-1.5 h-3.5 w-3.5" />
        Print / Save A4 PDF
      </Button>
    </div>
  );
}
