import os from "node:os";
import path from "node:path";

import { DEFAULT_INDEX_FILE, DEFAULT_SQLITE_INDEX_FILE } from "./constants.mjs";

export function defaultStoreRoot() {
  return process.env.OPENDOCU_HOME || path.join(os.homedir(), ".opendocu");
}

export function resolveStoreRoot(rawStore) {
  return path.resolve(rawStore || defaultStoreRoot());
}

export function indexPath(storeRoot) {
  return path.join(storeRoot, "index", DEFAULT_INDEX_FILE);
}

export function sqliteIndexPath(storeRoot) {
  return path.join(storeRoot, "index", DEFAULT_SQLITE_INDEX_FILE);
}

export function librariesPath(storeRoot) {
  return path.join(storeRoot, "libraries");
}

export function registryPath(storeRoot) {
  return path.join(storeRoot, "registry.json");
}

export function pagesPath(storeRoot, library, version) {
  return path.join(
    librariesPath(storeRoot),
    encodeLibrarySegment(library),
    "versions",
    encodeVersionSegment(version),
    "pages",
  );
}

export function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

export function deriveDocLocation(storeRoot, filePath) {
  const relative = toPosixPath(path.relative(librariesPath(storeRoot), filePath));
  const parts = relative.split("/");
  const versionsIndex = parts.indexOf("versions");
  const pagesIndex = parts.indexOf("pages");

  if (versionsIndex !== 1 || pagesIndex !== 3 || parts.length <= 4) {
    return {
      library: "",
      version: "",
      pagePath: toPosixPath(path.basename(filePath)),
    };
  }

  return {
    library: decodePathSegment(parts[0]),
    version: decodePathSegment(parts[2]),
    pagePath: parts.slice(4).join("/"),
  };
}

export function docIdFor(library, version, pagePath) {
  const withoutExtension = pagePath.replace(/\.(md|mdx|markdown)$/i, "");
  return `${encodeLibrarySegment(library)}@${encodeVersionSegment(version)}/${withoutExtension}`;
}

export function parseDocId(raw) {
  const atIndex = raw.indexOf("@");
  const slashIndex = raw.indexOf("/");
  if (atIndex <= 0 || slashIndex <= atIndex + 1) {
    throw new Error("doc id must look like library@version/path");
  }
  return {
    library: decodePathSegment(raw.slice(0, atIndex)),
    version: decodePathSegment(raw.slice(atIndex + 1, slashIndex)),
    pagePath: raw.slice(slashIndex + 1),
  };
}

export function encodeLibrarySegment(library) {
  return encodeURIComponent(String(library));
}

export function encodeVersionSegment(version) {
  return encodeURIComponent(String(version));
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
