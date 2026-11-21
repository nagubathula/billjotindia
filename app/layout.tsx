import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { PwaProvider } from "@/components/PwaProvider";
import "./globals.css";

// Apple devices render San Francisco via the system font stack in globals.css;
// Inter is the closest freely licensed fallback for everyone else.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  applicationName: "Billjot Console",
  title: "Billjot Console",
  description: "Restaurant POS, kitchen display, and multi-outlet operations",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Billjot",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon-16x16.png",
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const stripExtensionAttrsScript = `
(function() {
  function isExtensionStack(stack, filename) {
    if (typeof filename === "string" && (filename.indexOf("chrome-extension://") === 0 || filename.indexOf("moz-extension://") === 0)) {
      return true;
    }
    if (typeof stack !== "string") return false;
    var hasExt = stack.indexOf("chrome-extension://") !== -1 || stack.indexOf("moz-extension://") !== -1;
    if (!hasExt) return false;
    var hasAppFrame = stack.indexOf("/_next/") !== -1 || stack.indexOf("webpack-internal:") !== -1;
    return !hasAppFrame;
  }

  window.addEventListener("error", function(e) {
    var stack = e && e.error && e.error.stack ? String(e.error.stack) : "";
    if (isExtensionStack(stack, e ? e.filename : "")) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);

  window.addEventListener("unhandledrejection", function(e) {
    var reason = e ? e.reason : null;
    var stack = reason && reason.stack ? String(reason.stack) : "";
    if (isExtensionStack(stack, "")) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);

  var PREFIXES = ["bis_skin_checked", "bis_register", "__processed_", "data-gr-ext-installed", "data-new-gr-c-s-check-loaded"];
  var ATTR_SELECTOR = "[bis_skin_checked],[bis_register],[data-gr-ext-installed],[data-new-gr-c-s-check-loaded]";
  function isExtAttr(name) {
    for (var i = 0; i < PREFIXES.length; i++) {
      if (name === PREFIXES[i] || name.indexOf(PREFIXES[i]) === 0) return true;
    }
    return false;
  }
  function cleanNode(el) {
    if (!el || el.nodeType !== 1 || !el.attributes) return;
    for (var i = el.attributes.length - 1; i >= 0; i--) {
      var name = el.attributes[i].name;
      if (isExtAttr(name)) el.removeAttribute(name);
    }
  }
  function cleanTree(root) {
    if (!root) return;
    cleanNode(root);
    if (root.querySelectorAll) {
      var all = root.querySelectorAll(ATTR_SELECTOR);
      for (var i = 0; i < all.length; i++) cleanNode(all[i]);
      var tmpls = root.querySelectorAll("template");
      for (var t = 0; t < tmpls.length; t++) {
        if (tmpls[t].content) cleanTree(tmpls[t].content);
      }
    }
  }
  cleanTree(document.documentElement);
  if (typeof MutationObserver !== "undefined") {
    var obs = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "attributes" && m.attributeName && isExtAttr(m.attributeName)) {
          m.target.removeAttribute(m.attributeName);
        } else if (m.type === "childList") {
          for (var j = 0; j < m.addedNodes.length; j++) {
            cleanTree(m.addedNodes[j]);
          }
        }
      }
    });
    obs.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true
    });
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: stripExtensionAttrsScript }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased" suppressHydrationWarning>
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
