"use client";

export type PosPrinterTransport = "browser" | "webusb" | "lan_bridge";

export type PosPrinterTerminalConfig = {
  transport: PosPrinterTransport;
  paperWidth: 58 | 80;
  silentReceipt: boolean;
  silentKot: boolean;
  autoKickCashDrawer: boolean;
  lanBridgeUrl: string;
  usbVendorId?: number;
  usbProductId?: number;
  usbProductName?: string;
};

export const DEFAULT_POS_PRINTER_CONFIG: PosPrinterTerminalConfig = {
  transport: "browser",
  paperWidth: 80,
  silentReceipt: false,
  silentKot: false,
  autoKickCashDrawer: false,
  lanBridgeUrl: "http://127.0.0.1:9109/print",
};

const storageKeyForOutlet = (outletId: string) =>
  `billjot:pos-printer:${outletId}`;

export function loadPosPrinterConfig(outletId: string): PosPrinterTerminalConfig {
  if (typeof window === "undefined") return { ...DEFAULT_POS_PRINTER_CONFIG };
  try {
    const raw = window.localStorage.getItem(storageKeyForOutlet(outletId));
    if (!raw) return { ...DEFAULT_POS_PRINTER_CONFIG };
    const parsed = JSON.parse(raw) as Partial<PosPrinterTerminalConfig>;
    return {
      transport:
        parsed.transport === "webusb" || parsed.transport === "lan_bridge"
          ? parsed.transport
          : "browser",
      paperWidth: parsed.paperWidth === 58 ? 58 : 80,
      silentReceipt: Boolean(parsed.silentReceipt),
      silentKot: Boolean(parsed.silentKot),
      autoKickCashDrawer: Boolean(parsed.autoKickCashDrawer),
      lanBridgeUrl:
        typeof parsed.lanBridgeUrl === "string" && parsed.lanBridgeUrl.trim()
          ? parsed.lanBridgeUrl.trim()
          : DEFAULT_POS_PRINTER_CONFIG.lanBridgeUrl,
      usbVendorId:
        typeof parsed.usbVendorId === "number" ? parsed.usbVendorId : undefined,
      usbProductId:
        typeof parsed.usbProductId === "number" ? parsed.usbProductId : undefined,
      usbProductName:
        typeof parsed.usbProductName === "string"
          ? parsed.usbProductName
          : undefined,
    };
  } catch {
    return { ...DEFAULT_POS_PRINTER_CONFIG };
  }
}

export function savePosPrinterConfig(
  outletId: string,
  cfg: PosPrinterTerminalConfig,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKeyForOutlet(outletId), JSON.stringify(cfg));
  } catch {
    // ignore quota errors
  }
}

interface UsbEndpointShape {
  direction: "in" | "out";
  endpointNumber: number;
}
interface UsbAlternateShape {
  endpoints: UsbEndpointShape[];
}
interface UsbInterfaceShape {
  interfaceNumber: number;
  alternates: UsbAlternateShape[];
}
interface UsbDeviceShape {
  vendorId: number;
  productId: number;
  productName?: string;
  opened: boolean;
  configuration: { interfaces: UsbInterfaceShape[] } | null;
  open(): Promise<void>;
  selectConfiguration(cfg: number): Promise<void>;
  claimInterface(iface: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<unknown>;
}
interface NavigatorWithUsb {
  usb?: {
    requestDevice(opts: { filters: Array<{ classCode?: number }> }): Promise<UsbDeviceShape>;
    getDevices(): Promise<UsbDeviceShape[]>;
  };
}

export function isWebUsbSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean((navigator as unknown as NavigatorWithUsb).usb);
}

export async function pairWebUsbPrinter(): Promise<{
  vendorId: number;
  productId: number;
  productName: string;
}> {
  const usb = (navigator as unknown as NavigatorWithUsb).usb;
  if (!usb) {
    throw new Error("WebUSB is not supported in this browser. Use Chrome/Edge over HTTPS or localhost.");
  }
  const dev = await usb.requestDevice({ filters: [{ classCode: 7 }, {}] });
  if (!dev.opened) await dev.open();
  if (!dev.configuration) await dev.selectConfiguration(1);
  return {
    vendorId: dev.vendorId,
    productId: dev.productId,
    productName: dev.productName || `USB Printer (${dev.vendorId}:${dev.productId})`,
  };
}

function findOutEndpoint(dev: UsbDeviceShape): {
  interfaceNumber: number;
  endpointNumber: number;
} | null {
  const interfaces = dev.configuration?.interfaces ?? [];
  for (const iface of interfaces) {
    for (const alt of iface.alternates ?? []) {
      const out = (alt.endpoints ?? []).find((ep) => ep.direction === "out");
      if (out) {
        return {
          interfaceNumber: iface.interfaceNumber,
          endpointNumber: out.endpointNumber,
        };
      }
    }
  }
  return null;
}

export async function sendBytesViaWebUsb(
  bytes: Uint8Array,
  vendorId?: number,
  productId?: number,
): Promise<void> {
  const usb = (navigator as unknown as NavigatorWithUsb).usb;
  if (!usb) {
    throw new Error("WebUSB is unavailable in this browser.");
  }
  const paired = await usb.getDevices();
  let dev =
    vendorId != null && productId != null
      ? paired.find((d) => d.vendorId === vendorId && d.productId === productId)
      : paired[0];
  if (!dev) {
    dev = await usb.requestDevice({ filters: [{ classCode: 7 }, {}] });
  }
  if (!dev.opened) await dev.open();
  if (!dev.configuration) await dev.selectConfiguration(1);
  const ep = findOutEndpoint(dev);
  if (!ep) {
    throw new Error("USB printer OUT endpoint not found.");
  }
  await dev.claimInterface(ep.interfaceNumber);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  await dev.transferOut(ep.endpointNumber, copy);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export async function sendBytesViaLanBridge(
  bridgeUrl: string,
  bytes: Uint8Array,
  meta: {
    jobType: "receipt" | "kot" | "drawer" | "test";
    station?: string;
    paperWidth?: number;
  },
): Promise<void> {
  const target = bridgeUrl.trim() || DEFAULT_POS_PRINTER_CONFIG.lanBridgeUrl;
  const res = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataBase64: uint8ToBase64(bytes),
      jobType: meta.jobType,
      station: meta.station ?? null,
      paperWidth: meta.paperWidth ?? 80,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Print bridge returned HTTP ${res.status}`);
  }
}

export async function dispatchEscPosBytes(
  config: PosPrinterTerminalConfig,
  bytes: Uint8Array,
  meta: {
    jobType: "receipt" | "kot" | "drawer" | "test";
    station?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (config.transport === "browser") {
    return { ok: false, error: "Browser print dialog mode is selected." };
  }
  try {
    if (config.transport === "webusb") {
      await sendBytesViaWebUsb(bytes, config.usbVendorId, config.usbProductId);
      return { ok: true };
    }
    await sendBytesViaLanBridge(config.lanBridgeUrl, bytes, {
      ...meta,
      paperWidth: config.paperWidth,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Printer dispatch failed.",
    };
  }
}
