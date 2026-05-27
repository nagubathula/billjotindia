"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building, MapPin, Receipt, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Outlet } from "@/lib/types";
import { updateOutletAction } from "./actions";

export function OutletForm({ slug, outlet }: { slug: string; outlet: Outlet }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<
    { kind: "ok"; text: string } | { kind: "err"; text: string } | null
  >(null);

  return (
    <form
      action={(fd) => {
        setStatus(null);
        start(async () => {
          const res = await updateOutletAction(slug, outlet.id, fd);
          if (res.ok) {
            setStatus({ kind: "ok", text: "Outlet saved." });
            router.refresh();
          } else {
            setStatus({ kind: "err", text: res.error });
          }
        });
      }}
      className="space-y-4"
    >
      {/* Identity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building className="h-4 w-4 text-muted-foreground" />
            Identity
          </CardTitle>
          <CardDescription>What this outlet is called and how customers reach you.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Outlet name" name="name" defaultValue={outlet.name} required />
          <Field label="Phone" name="phone" defaultValue={outlet.phone} placeholder="+91 80 1234 5678" />
          <Field label="Email" name="email" type="email" defaultValue={outlet.email} className="sm:col-span-2" />
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Address
          </CardTitle>
          <CardDescription>Printed on receipts and used by online-ordering customers.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Street address"
            name="address"
            defaultValue={outlet.address}
            className="sm:col-span-2"
            placeholder="12 MG Road, Indiranagar"
          />
          <Field label="City" name="city" defaultValue={outlet.city} placeholder="Bengaluru" />
          <Field label="State" name="state" defaultValue={outlet.state} placeholder="Karnataka" />
          <Field
            label="State code (2 digits)"
            name="state_code"
            defaultValue={outlet.state_code}
            maxLength={2}
            placeholder="29"
            help="Drives whether GST splits as CGST+SGST (intra-state) or IGST."
          />
          <Field label="Pincode" name="pincode" defaultValue={outlet.pincode} placeholder="560038" />
        </CardContent>
      </Card>

      {/* Tax & licensing */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            Tax & licensing
          </CardTitle>
          <CardDescription>Printed on every GST invoice. Required to run a registered F&B business in India.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="GSTIN"
            name="gstin"
            defaultValue={outlet.gstin}
            maxLength={15}
            placeholder="29ABCDE1234F1Z5"
            help="15-character GST identification number."
            className="sm:col-span-2"
          />
          <Field
            label="FSSAI licence"
            name="fssai_license"
            defaultValue={outlet.fssai_license}
            placeholder="12345678901234"
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>

      {/* Save */}
      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-lg border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
        {status && (
          <p
            className={`text-sm ${
              status.kind === "ok" ? "text-emerald-700" : "text-destructive"
            }`}
            role={status.kind === "err" ? "alert" : undefined}
          >
            {status.text}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          <Save className="mr-1 h-3 w-3" />
          {pending ? "Saving…" : "Save outlet"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  maxLength,
  placeholder,
  help,
  className,
}: {
  label: string;
  name: string;
  defaultValue: string | null;
  type?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  help?: string;
  className?: string;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={`outlet-${name}`}>{label}</Label>
      <Input
        id={`outlet-${name}`}
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
      />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}
