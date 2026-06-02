import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { SUPPORTED_DOC_EXTENSIONS } from "./constants.mjs";
import { firstHeading, parseFrontmatter } from "./frontmatter.mjs";
import { findDocFiles } from "./indexer.mjs";
import { pagesPath, toPosixPath } from "./paths.mjs";

const HTML_EXTENSIONS = new Set([".html", ".htm"]);

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

    const destination = await writeImportedPage(storeRoot, {
      library,
      version,
      relative,
      title,
      url,
      retrievedAt,
      hash,
      data,
      body,
    });
    written.push(destination);
  }

  return {
    sourceDir,
    library,
    version,
    written,
  };
}

export async function importHtmlTree(storeRoot, options) {
  const sourceDir = path.resolve(options.sourceDir);
  const library = required(options.library, "library");
  const version = required(options.version, "version");
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const files = await findFilesByExtension(sourceDir, HTML_EXTENSIONS);
  const written = [];

  for (const filePath of files) {
    const relative = toPosixPath(path.relative(sourceDir, filePath));
    const raw = await fs.readFile(filePath, "utf8");
    const converted = htmlToMarkdown(raw);
    const title = converted.title || titleFromRelativePath(relative);
    const url = options.urlBase ? chooseUrl({}, relative, options) : converted.canonicalUrl;
    const hash = `sha256:${crypto.createHash("sha256").update(raw).digest("hex")}`;
    const destination = await writeImportedPage(storeRoot, {
      library,
      version,
      relative: relative.replace(/\.html?$/i, ".md"),
      title,
      url,
      retrievedAt,
      hash,
      data: { format: "html", canonical: converted.canonicalUrl },
      body: converted.markdown,
    });
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

async function writeImportedPage(storeRoot, page) {
  const frontmatterLines = [
    "---",
    `library: ${quoteYaml(page.library)}`,
    `version: ${quoteYaml(page.version)}`,
    `title: ${quoteYaml(page.title)}`,
    page.url ? `url: ${quoteYaml(page.url)}` : "",
    `retrieved_at: ${quoteYaml(page.retrievedAt)}`,
    `content_hash: ${quoteYaml(page.hash)}`,
    ...sourceFrontmatterLines(page.data),
    "---",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const destination = path.join(pagesPath(storeRoot, page.library, page.version), page.relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, `${frontmatterLines}\n\n${page.body.trimStart()}`);
  return destination;
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
    .map(([key, value]) => `${key.startsWith("source_") ? key : `source_${key}`}: ${quoteYaml(value)}`);
}

function isScalar(value) {
  return ["string", "number", "boolean"].includes(typeof value);
}

async function findFilesByExtension(root, extensions) {
  const results = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  }

  await walk(root);
  return results.sort();
}

function htmlToMarkdown(html) {
  const canonicalUrl = attr(
    html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0] || "",
    "href",
  );
  const title =
    textFromHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "") ||
    textFromHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  let content =
    matchTagContent(html, "main") ||
    matchTagContent(html, "article") ||
    matchTagContent(html, "body") ||
    html;

  content = content
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, "");

  content = content.replace(/<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, code) => {
    return `\n\n\`\`\`\n${decodeHtml(stripTags(code)).trim()}\n\`\`\`\n\n`;
  });
  content = content.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    return `\n\n\`\`\`\n${decodeHtml(stripTags(code)).trim()}\n\`\`\`\n\n`;
  });
  content = content.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, code) => {
    return `\`${decodeHtml(stripTags(code)).trim()}\``;
  });
  content = content.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, depth, text) => {
    return `\n\n${"#".repeat(Number(depth))} ${textFromHtml(text)}\n\n`;
  });
  content = content.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const label = textFromHtml(text);
    return label && href ? `[${label}](${decodeHtml(href)})` : label;
  });
  content = content
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|main|tr)>/gi, "\n\n")
    .replace(/<td\b[^>]*>/gi, " ")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, "");

  return {
    title,
    canonicalUrl: canonicalUrl ? decodeHtml(canonicalUrl) : "",
    markdown: normalizeMarkdown(decodeHtml(content)),
  };
}

function matchTagContent(html, tagName) {
  const match = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i").exec(html);
  return match ? match[1] : "";
}

function attr(tag, name) {
  const match = new RegExp(`${name}=["']([^"']+)["']`, "i").exec(tag);
  return match ? match[1] : "";
}

function textFromHtml(value) {
  return normalizeSpaces(decodeHtml(stripTags(stripHeadingAnchors(value))));
}

function stripHeadingAnchors(value) {
  return value.replace(/<a\b[^>]*>\s*#\s*<\/a>/gi, "");
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, "");
}

function decodeHtml(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number.parseInt(num, 10)))
    .replace(/&([a-z]+);/gi, (_, name) => named[name.toLowerCase()] || `&${name};`);
}

function normalizeMarkdown(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .concat("\n");
}

function normalizeSpaces(value) {
  return value.replace(/\s+/g, " ").trim();
}
