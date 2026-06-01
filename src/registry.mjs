import fs from "node:fs/promises";

import { registryPath } from "./paths.mjs";

export async function loadRegistry(storeRoot) {
  try {
    const payload = JSON.parse(await fs.readFile(registryPath(storeRoot), "utf8"));
    return {
      schema_version: payload.schema_version || 1,
      aliases: payload.aliases && typeof payload.aliases === "object" ? payload.aliases : {},
    };
  } catch {
    return { schema_version: 1, aliases: {} };
  }
}

export async function saveAlias(storeRoot, alias, library) {
  const registry = await loadRegistry(storeRoot);
  registry.aliases[alias] = library;
  await fs.writeFile(registryPath(storeRoot), `${JSON.stringify(registry, null, 2)}\n`);
  return registry;
}

export async function resolveLibraryName(storeRoot, requested, index = null) {
  const registry = await loadRegistry(storeRoot);
  const available = index ? availableLibraries(index) : [];
  const aliases = {
    nodejs: "node",
    "next.js": "nextjs",
    next: "nextjs",
    reactjs: "react",
    ...registry.aliases,
  };

  if (available.includes(requested)) {
    return { requested, library: requested, reason: "exact" };
  }
  if (aliases[requested]) {
    return { requested, library: aliases[requested], reason: "alias" };
  }

  const normalized = normalizeLibrary(requested);
  const normalizedMatches = available.filter((library) => normalizeLibrary(library) === normalized);
  if (normalizedMatches.length === 1) {
    return { requested, library: normalizedMatches[0], reason: "normalized" };
  }

  return { requested, library: requested, reason: "unresolved" };
}

function availableLibraries(index) {
  return [...new Set((index?.docs || []).map((doc) => doc.library))];
}

function normalizeLibrary(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}
