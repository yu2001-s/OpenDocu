import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { SUPPORTED_DOC_EXTENSIONS } from "./constants.mjs";
import { firstHeading, parseFrontmatter } from "./frontmatter.mjs";
import { findDocFiles } from "./indexer.mjs";
import { pagesPath, toPosixPath } from "./paths.mjs";

export async function importMarkdownTree(storeRoot, options) {
  const sourceDir = path.resolve(options.sourceDir);
  const library = required(options.library, "library");
  const version = required(options.version, "version");
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const files = await findDocFiles(sourceDir);
  const written = [];

  for (const filePath of files) {
    const relative = toPosixPath(path.relative(sourceDir, filePath));
    const ext = path.extname(filePath);
    if (!SUPPORTED_DOC_EXTENSIONS.has(ext)) {
      continue;
    }

    const raw = await fs.readFile(filePath, "utf8");
    const { data, body } = parseFrontmatter(raw);
    const title = data.title || firstHeading(body) || titleFromRelativePath(relative);
    const url = chooseUrl(data, relative, options);
    const hash = `sha256:${crypto.createHash("sha256").update(raw).digest("hex")}`;
    const frontmatterLines = [
      "---",
      `library: ${quoteYaml(library)}`,
      `version: ${quoteYaml(version)}`,
      `title: ${quoteYaml(title)}`,
      url ? `url: ${quoteYaml(url)}` : "",
      `retrieved_at: ${quoteYaml(retrievedAt)}`,
      `content_hash: ${quoteYaml(hash)}`,
      ...sourceFrontmatterLines(data),
      "---",
    ]
      .filter((line) => line !== "")
      .join("\n");

    const destination = path.join(pagesPath(storeRoot, library, version), relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, `${frontmatterLines}\n\n${body.trimStart()}`);
    written.push(destination);
  }

  return {
    sourceDir,
    library,
    version,
    written,
  };
}

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function quoteYaml(value) {
  return JSON.stringify(String(value));
}

function titleFromRelativePath(relative) {
  return path
    .basename(relative)
    .replace(/\.(md|mdx|markdown)$/i, "")
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function chooseUrl(data, relative, options) {
  if (data.url || data.source_url || data.canonical_url || data.permalink) {
    return data.url || data.source_url || data.canonical_url || data.permalink;
  }
  if (data.slug && options.urlBase) {
    return `${options.urlBase.replace(/\/$/, "")}/${String(data.slug).replace(/^\//, "")}`;
  }
  if (options.urlBase) {
    return `${options.urlBase.replace(/\/$/, "")}/${relative}`;
  }
  return "";
}

function sourceFrontmatterLines(data) {
  const reserved = new Set([
    "library",
    "version",
    "title",
    "url",
    "source_url",
    "canonical_url",
    "retrieved_at",
    "content_hash",
  ]);
  return Object.entries(data)
    .filter(([key, value]) => !reserved.has(key) && isScalar(value))
    .map(([key, value]) => `source_${key}: ${quoteYaml(value)}`);
}

function isScalar(value) {
  return ["string", "number", "boolean"].includes(typeof value);
}
