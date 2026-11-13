import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Apple devices render San Francisco via the system font stack in globals.css;
// Inter is the closest freely licensed fallback for everyone else.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Billjot India",
  description: "POS, kiosk and online ordering for Indian F&B",
};

export const viewport: Viewport = {
  themeColor: "#f5f5f7",
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

  var PREFIXES = ["bis_skin_checked", "bis_register", "__processed_"];
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
      var all = root.querySelectorAll("[bis_skin_checked],[bis_register]");
      for (var i = 0; i < all.length; i++) cleanNode(all[i]);
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
    window.addEventListener("load", function() {
      setTimeout(function() { obs.disconnect(); }, 2000);
    }, { once: true });
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: stripExtensionAttrsScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
