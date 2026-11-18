import { notFound } from "next/navigation";
import {
  amountInWordsInr,
  CORPORATE_PAYMENT_TERMS_LABEL,
  type CorporateInvoiceLineComputed,
  type CorporatePaymentTerms,
} from "@/lib/accounts";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CorporateClient, CorporateInvoice } from "@/lib/types";
import { isUuid } from "@/lib/utils";
import { InvoicePrintBar } from "./InvoicePrintBar";

export const dynamic = "force-dynamic";

const inrExact = (n: number) =>
  `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

type Props = {
  params: Promise<{ slug: string; invoiceId: string }>;
};

export default async function CorporateInvoicePrintPage(props: Props) {
  const params = await props.params;
  if (!isUuid(params.invoiceId)) notFound();

  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/accounts/invoices/${params.invoiceId}/print`,
  });

  const [outlets, invoiceRes] = await Promise.all([
    getOutletsForRestaurant(restaurant.id),
    createAdminClient()
      .from("corporate_invoices")
      .select("*")
      .eq("id", params.invoiceId)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle(),
  ]);

  const invoice = invoiceRes.data as CorporateInvoice | null;
  if (!invoice) notFound();

  const admin = createAdminClient();
  const { data: clientData } = await admin
    .from("corporate_clients")
    .select("*")
    .eq("id", invoice.corporate_client_id)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  const client = clientData as CorporateClient | null;
  const outlet =
    (invoice.outlet_id
      ? outlets.find((o) => o.id === invoice.outlet_id)
      : outlets[0]) ?? outlets[0];

  const lines = Array.isArray(invoice.line_items)
    ? (invoice.line_items as unknown as CorporateInvoiceLineComputed[])
    : [];
  const totalAmount = Number(invoice.total_amount ?? 0);
  const amountPaid = Number(invoice.amount_paid ?? 0);
  const balanceDue = Math.max(0, Math.round((totalAmount - amountPaid) * 100) / 100);
  const isInter = invoice.supply_type === "inter";

  return (
    <div className="min-h-screen bg-muted/30 py-4 print:bg-white print:p-0">
      <style media="print">{`@page { size: A4 portrait; margin: 10mm; }`}</style>

      <InvoicePrintBar
        slug={params.slug}
        invoiceNumber={invoice.invoice_number}
      />

      <article className="a4-invoice-print mx-auto max-w-[190mm] rounded-xl border border-border bg-white p-8 text-[12px] leading-relaxed text-neutral-900 shadow-sm print:rounded-none print:border-none print:p-0 print:shadow-none">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-neutral-900 pb-4">
          <div className="space-y-1">
            <div className="text-xs font-bold tracking-widest text-neutral-500 uppercase">
              Tax Invoice (Original for Recipient)
            </div>
            <h1 className="text-xl font-bold text-neutral-900">
              {restaurant.name}
            </h1>
            {outlet && (
              <div className="text-xs text-neutral-700">
                <div className="font-medium">{outlet.name}</div>
                {outlet.address && <div>{outlet.address}</div>}
                <div>
                  {[outlet.city, outlet.state, outlet.pincode]
                    .filter(Boolean)
                    .join(", ")}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px]">
                  {outlet.gstin && <span>GSTIN: {outlet.gstin}</span>}
                  {outlet.fssai_license && (
                    <span>FSSAI: {outlet.fssai_license}</span>
                  )}
                  {outlet.state_code && (
                    <span>State Code: {outlet.state_code}</span>
                  )}
                </div>
                {(outlet.phone || outlet.email) && (
                  <div className="text-[11px] text-neutral-600">
                    {[outlet.phone && `Ph: ${outlet.phone}`, outlet.email]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-right">
            <div className="inline-block rounded border border-neutral-900 px-3 py-1 text-xs font-bold uppercase tracking-wider">
              {invoice.status === "cancelled"
                ? "CANCELLED"
                : invoice.payment_status === "paid"
                  ? "PAID IN FULL"
                  : invoice.payment_status === "partial"
                    ? "PARTIALLY PAID"
                    : "PAYMENT DUE"}
            </div>
            <dl className="mt-3 space-y-0.5 text-xs tabular-nums">
              <div className="flex justify-end gap-2">
                <dt className="text-neutral-500">Invoice #:</dt>
                <dd className="font-mono font-bold">{invoice.invoice_number}</dd>
              </div>
              <div className="flex justify-end gap-2">
                <dt className="text-neutral-500">Invoice Date:</dt>
                <dd className="font-medium">{invoice.invoice_date}</dd>
              </div>
              {invoice.due_date && (
                <div className="flex justify-end gap-2">
                  <dt className="text-neutral-500">Due Date:</dt>
                  <dd className="font-medium">{invoice.due_date}</dd>
                </div>
              )}
              {invoice.po_reference && (
                <div className="flex justify-end gap-2">
                  <dt className="text-neutral-500">Buyer PO #:</dt>
                  <dd className="font-mono font-medium">
                    {invoice.po_reference}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </header>

        {/* Buyer & Supply Details */}
        <section className="grid grid-cols-2 gap-6 border-b border-neutral-300 py-4 text-xs">
          <div>
            <div className="text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
              Bill To (Corporate Recipient)
            </div>
            <div className="mt-1 text-sm font-bold text-neutral-900">
              {client?.company_name ?? "Corporate Client"}
            </div>
            {client?.gstin && (
              <div className="font-mono text-[11px] font-semibold">
                Buyer GSTIN: {client.gstin}
              </div>
            )}
            {client?.billing_address && (
              <div className="mt-1 whitespace-pre-line text-neutral-700">
                {client.billing_address}
              </div>
            )}
            {(client?.contact_person || client?.phone || client?.email) && (
              <div className="mt-1 text-[11px] text-neutral-600">
                {[client.contact_person, client.phone, client.email]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </div>

          <div className="space-y-1 text-right">
            <div className="text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
              Supply &amp; Tax Jurisdiction
            </div>
            <div>
              <span className="text-neutral-500">Place of Supply: </span>
              <span className="font-semibold">
                {invoice.place_of_supply ||
                  `${client?.state_code ?? "36"} - ${client?.state_name ?? "Telangana"}`}
              </span>
            </div>
            <div>
              <span className="text-neutral-500">Tax Regime: </span>
              <span className="font-semibold">
                {isInter
                  ? "Inter-State Supply (IGST)"
                  : "Intra-State Supply (CGST + SGST)"}
              </span>
            </div>
            {client?.payment_terms && (
              <div>
                <span className="text-neutral-500">Credit Terms: </span>
                <span className="font-medium">
                  {CORPORATE_PAYMENT_TERMS_LABEL[
                    client.payment_terms as CorporatePaymentTerms
                  ] ?? client.payment_terms}
                </span>
              </div>
            )}
            <div>
              <span className="text-neutral-500">Reverse Charge: </span>
              <span className="font-medium">No</span>
            </div>
          </div>
        </section>

        {/* Line Items Table */}
        <section className="mt-4">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y border-neutral-800 bg-neutral-100 text-[11px] font-bold uppercase text-neutral-800">
                <th className="py-2 pl-2 text-left">#</th>
                <th className="py-2 text-left">Description of Services / Goods</th>
                <th className="py-2 text-left">HSN/SAC</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Rate</th>
                <th className="py-2 text-right">Taxable</th>
                <th className="py-2 text-right">GST %</th>
                {isInter ? (
                  <th className="py-2 text-right">IGST</th>
                ) : (
                  <>
                    <th className="py-2 text-right">CGST</th>
                    <th className="py-2 text-right">SGST</th>
                  </>
                )}
                <th className="py-2 pr-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {lines.map((line, i) => (
                <tr key={i} className="align-top">
                  <td className="py-2 pl-2 tabular-nums text-neutral-500">
                    {i + 1}
                  </td>
                  <td className="py-2 pr-2 font-medium text-neutral-900">
                    {line.description}
                  </td>
                  <td className="py-2 font-mono text-[11px] text-neutral-700">
                    {line.hsn_sac}
                  </td>
                  <td className="py-2 text-right tabular-nums">{line.qty}</td>
                  <td className="py-2 text-right tabular-nums">
                    {inrExact(Number(line.unit_price))}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {inrExact(Number(line.taxable_value))}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {line.gst_rate}%
                  </td>
                  {isInter ? (
                    <td className="py-2 text-right tabular-nums">
                      {inrExact(Number(line.igst))}
                    </td>
                  ) : (
                    <>
                      <td className="py-2 text-right tabular-nums">
                        {inrExact(Number(line.cgst))}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {inrExact(Number(line.sgst))}
                      </td>
                    </>
                  )}
                  <td className="py-2 pr-2 text-right font-semibold tabular-nums">
                    {inrExact(Number(line.total))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Totals & Words */}
        <section className="mt-5 grid grid-cols-12 gap-6 border-t border-neutral-800 pt-4 text-xs">
          <div className="col-span-7 space-y-2">
            <div>
              <div className="text-[10px] font-bold uppercase text-neutral-500">
                Total Invoice Amount (In Words)
              </div>
              <div className="mt-0.5 font-semibold text-neutral-900">
                {amountInWordsInr(totalAmount)}
              </div>
            </div>
            {invoice.notes && (
              <div>
                <div className="text-[10px] font-bold uppercase text-neutral-500">
                  Terms &amp; Payment Instructions
                </div>
                <div className="mt-0.5 text-neutral-700">{invoice.notes}</div>
              </div>
            )}
          </div>

          <div className="col-span-5 space-y-1.5 tabular-nums">
            <div className="flex justify-between">
              <span className="text-neutral-600">Taxable Value</span>
              <span className="font-medium">
                {inrExact(Number(invoice.taxable_subtotal))}
              </span>
            </div>
            {isInter ? (
              <div className="flex justify-between">
                <span className="text-neutral-600">IGST</span>
                <span>{inrExact(Number(invoice.igst_amount))}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-neutral-600">CGST</span>
                  <span>{inrExact(Number(invoice.cgst_amount))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">SGST</span>
                  <span>{inrExact(Number(invoice.sgst_amount))}</span>
                </div>
              </>
            )}
            <div className="flex justify-between border-y border-neutral-900 py-1.5 text-sm font-bold">
              <span>Grand Total</span>
              <span>{inrExact(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-neutral-600">
              <span>Amount Received</span>
              <span>{inrExact(amountPaid)}</span>
            </div>
            <div className="flex justify-between font-bold text-neutral-900">
              <span>Balance Payable</span>
              <span>{inrExact(balanceDue)}</span>
            </div>
          </div>
        </section>

        {/* Declaration & Signatory */}
        <footer className="mt-10 flex items-end justify-between border-t border-neutral-300 pt-4 text-[11px] text-neutral-600">
          <div className="max-w-md space-y-0.5">
            <div className="font-semibold text-neutral-800">Declaration</div>
            <div>
              We declare that this invoice shows the actual price of the goods/services
              described and that all particulars are true and correct under Indian GST Rules.
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-neutral-900">
              For {restaurant.name}
            </div>
            <div className="mt-8 border-t border-neutral-400 pt-1 text-[10px]">
              Authorized Signatory
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}
