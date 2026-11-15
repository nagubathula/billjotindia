import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const hooksSource = `
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = ${JSON.stringify(ROOT_DIR)};

function tryResolveFile(basePath) {
  const candidates = [
    basePath,
    basePath + ".ts",
    basePath + ".tsx",
    basePath + ".mjs",
    basePath + ".js",
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return pathToFileURL(c).href;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export {};",
    };
  }

  if (specifier === "next/server") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export function after(fn) { return fn(); };",
    };
  }

  if (specifier.startsWith("@/")) {
    const target = path.join(ROOT, specifier.slice(2));
    const found = tryResolveFile(target);
    if (found) {
      return { shortCircuit: true, url: found };
    }
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const target = path.resolve(parentDir, specifier);
    const found = tryResolveFile(target);
    if (found) {
      return { shortCircuit: true, url: found };
    }
  }

  return nextResolve(specifier, context);
}
`;

register(
  `data:text/javascript;base64,${Buffer.from(hooksSource, "utf8").toString("base64")}`,
  pathToFileURL(path.join(ROOT_DIR, "package.json")),
);
void fs;
