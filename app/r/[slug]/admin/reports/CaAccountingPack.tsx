"use client";

import { useState } from "react";
import { Download, FileCode2, FileSpreadsheet, FileText, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  serializeGstr1B2bCsv,
  serializeGstr1B2csCsv,
  serializeGstr1DocsCsv,
  serializeGstr1HsnCsv,
  serializeGstr1Json,
  serializeTallyPrimeXml,
  type CaAccountingReport,
} from "@/lib/ca-exports";

const inr2 = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function CaAccountingPack({
  report,
  filingPeriodMmYyyy,
}: {
  report: CaAccountingReport;
  filingPeriodMmYyyy: string;
}) {
  const [downloadedNotice, setDownloadedNotice] = useState<string | null>(null);
  const safeSlugPeriod = report.periodLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  function triggerDownload(label: string, filename: string, content: string, mime: string) {
    downloadTextFile(filename, content, mime);
    setDownloadedNotice(`Downloaded ${label} (${filename})`);
    setTimeout(() => setDownloadedNotice(null), 3500);
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              CA Accounting Pack — GSTR-1 &amp; Tally Prime
            </CardTitle>
            <CardDescription className="mt-1">
              GST-ready returns for {report.periodLabel} · POS: {report.placeOfSupply}
              {report.outletGstin ? ` · GSTIN ${report.outletGstin}` : " · Configure GSTIN in Settings"}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                triggerDownload(
                  "GSTR-1 HSN Summary CSV",
                  `gstr1-hsn-${safeSlugPeriod}.csv`,
                  serializeGstr1HsnCsv(report),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              HSN CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                triggerDownload(
                  "GSTR-1 B2CS CSV",
                  `gstr1-b2cs-${safeSlugPeriod}.csv`,
                  serializeGstr1B2csCsv(report),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              B2CS CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={report.b2bRows.length === 0}
              onClick={() =>
                triggerDownload(
                  "GSTR-1 B2B CSV",
                  `gstr1-b2b-${safeSlugPeriod}.csv`,
                  serializeGstr1B2bCsv(report),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              B2B CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                triggerDownload(
                  "GSTR-1 Doc Series CSV",
                  `gstr1-docs-${safeSlugPeriod}.csv`,
                  serializeGstr1DocsCsv(report),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Docs CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                triggerDownload(
                  "GSTR-1 Offline Portal JSON",
                  `gstr1-${filingPeriodMmYyyy}.json`,
                  serializeGstr1Json(report, filingPeriodMmYyyy),
                  "application/json;charset=utf-8",
                )
              }
            >
              <FileCode2 className="mr-1.5 h-3.5 w-3.5" />
              GSTR-1 JSON
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={report.tallyVouchers.length === 0}
              onClick={() =>
                triggerDownload(
                  "Tally Prime Sales Vouchers XML",
                  `tally-vouchers-${safeSlugPeriod}.xml`,
                  serializeTallyPrimeXml(report),
                  "application/xml;charset=utf-8",
                )
              }
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Tally Prime XML
            </Button>
          </div>
        </div>
        {downloadedNotice && (
          <p className="mt-2 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700">
            {downloadedNotice}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="text-[11px] text-muted-foreground">Table 7 · B2CS (Unregistered)</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {inr2(report.totals.b2csTaxable)}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              Tax {inr2(report.totals.b2csTax)} · Gross {inr2(report.totals.b2csGross)}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="text-[11px] text-muted-foreground">Table 4A · B2B Corporate</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {inr2(report.totals.b2bTaxable)}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {report.b2bRows.length} invoices · Tax {inr2(report.totals.b2bTax)}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="text-[11px] text-muted-foreground">Table 12 · HSN / SAC Total</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {inr2(report.totals.hsnTotalValue)}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              Taxable {inr2(report.totals.hsnTaxable)} · {report.hsnRows.length} HSN rows
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="text-[11px] text-muted-foreground">Sec 9(5) ECO Supplies</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {inr2(report.ecoSec95.grossAmount)}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {report.ecoSec95.orderCount} aggregator orders (tax paid by operator)
            </div>
          </div>
        </div>

        <Tabs defaultValue="hsn">
          <TabsList>
            <TabsTrigger value="hsn" className="text-xs">
              HSN Summary ({report.hsnRows.length})
            </TabsTrigger>
            <TabsTrigger value="b2cs" className="text-xs">
              B2CS Slabs ({report.b2csRows.length})
            </TabsTrigger>
            <TabsTrigger value="b2b" className="text-xs">
              B2B Invoices ({report.b2bRows.length})
            </TabsTrigger>
            <TabsTrigger value="tally" className="text-xs">
              Docs &amp; Tally Vouchers ({report.tallyVouchers.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hsn" className="mt-3">
            {report.hsnRows.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No HSN taxable supplies in this range.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>HSN / SAC</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>UQC</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">CGST</TableHead>
                      <TableHead className="text-right">SGST</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.hsnRows.map((h) => (
                      <TableRow key={`${h.hsn}-${h.rate}`}>
                        <TableCell className="font-mono text-xs font-medium">{h.hsn}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs">{h.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{h.uqc}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{h.totalQty}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{h.rate}%</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{inr2(h.taxableValue)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{inr2(h.cgst)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{inr2(h.sgst)}</TableCell>
                        <TableCell className="text-right text-xs font-semibold tabular-nums">
                          {inr2(h.totalValue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="b2cs" className="mt-3">
            {report.b2csRows.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No direct B2CS supplies in this range.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Place of Supply</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">GST Rate</TableHead>
                      <TableHead className="text-right">Taxable Value</TableHead>
                      <TableHead className="text-right">CGST</TableHead>
                      <TableHead className="text-right">SGST</TableHead>
                      <TableHead className="text-right">Gross Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.b2csRows.map((r) => (
                      <TableRow key={r.rate}>
                        <TableCell className="text-xs font-medium">{r.placeOfSupply}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{r.orderCount}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{r.rate}%</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{inr2(r.taxableValue)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{inr2(r.cgst)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{inr2(r.sgst)}</TableCell>
                        <TableCell className="text-right text-xs font-semibold tabular-nums">
                          {inr2(r.grossTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="b2b" className="mt-3">
            {report.b2bRows.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No Corporate B2B GST invoices raised in this period. Orders converted to B2B Tax Invoices are automatically excluded from B2CS to avoid double counting.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Recipient GSTIN</TableHead>
                      <TableHead>Company Name</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>POS</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">Tax (CGST/SGST/IGST)</TableHead>
                      <TableHead className="text-right">Invoice Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.b2bRows.map((r) => (
                      <TableRow key={r.invoiceNumber}>
                        <TableCell className="font-mono text-xs">{r.recipientGstin}</TableCell>
                        <TableCell className="text-xs font-medium">{r.receiverName}</TableCell>
                        <TableCell className="font-mono text-xs">{r.invoiceNumber}</TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {r.invoiceDate}
                        </TableCell>
                        <TableCell className="text-xs">{r.placeOfSupply}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{inr2(r.taxableValue)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {inr2(r.cgst + r.sgst + r.igst)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold tabular-nums">
                          {inr2(r.invoiceValue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="tally" className="mt-3 space-y-4">
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Table 13 · Document Nature</TableHead>
                    <TableHead>Sr. From</TableHead>
                    <TableHead>Sr. To</TableHead>
                    <TableHead className="text-right">Issued</TableHead>
                    <TableHead className="text-right">Cancelled</TableHead>
                    <TableHead className="text-right">Net Issued</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.docSummary.map((d) => (
                    <TableRow key={d.nature}>
                      <TableCell className="text-xs font-medium">{d.nature}</TableCell>
                      <TableCell className="font-mono text-xs">{d.srNoFrom}</TableCell>
                      <TableCell className="font-mono text-xs">{d.srNoTo}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{d.totalNumber}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {d.cancelled}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold tabular-nums">
                        {d.netIssued}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {report.tallyVouchers.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Date</TableHead>
                      <TableHead>Voucher #</TableHead>
                      <TableHead>Debit Party / Settlement Ledger</TableHead>
                      <TableHead className="text-right">Taxable Sales</TableHead>
                      <TableHead className="text-right">GST Total</TableHead>
                      <TableHead className="text-right">Gross Voucher</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.tallyVouchers.slice(0, 30).map((v) => (
                      <TableRow key={v.voucherKey}>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {v.dateDisplay}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{v.voucherNumber}</TableCell>
                        <TableCell className="text-xs font-medium">
                          <Badge variant="outline" className="font-normal">
                            {v.partyLedger}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {inr2(v.taxableSales)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {inr2(v.cgst + v.sgst + v.igst)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold tabular-nums">
                          {inr2(v.grossTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{report.ecoSec95.cgstNote}</span>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
