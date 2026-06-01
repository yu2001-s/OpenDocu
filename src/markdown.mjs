import path from "node:path";

import { firstHeading, parseFrontmatter, stripMarkdownInline } from "./frontmatter.mjs";
import { deriveDocLocation, docIdFor, toPosixPath } from "./paths.mjs";

const DEFAULT_MAX_CHARS = 4800;
const DEFAULT_OVERLAP_CHARS = 700;

export function parseMarkdownFile(storeRoot, filePath, content) {
  const { data, body } = parseFrontmatter(content);
  const derived = deriveDocLocation(storeRoot, filePath);
  const pagePath = derived.pagePath;
  const library = String(data.library || derived.library || "").trim();
  const version = String(data.version || derived.version || "unknown").trim();
  const title =
    String(data.title || "").trim() ||
    firstHeading(body) ||
    titleFromPath(pagePath);

  const relativeFile = toPosixPath(path.relative(storeRoot, filePath));
  const doc = {
    id: docIdFor(library || "unknown", version || "unknown", pagePath),
    library: library || "unknown",
    version: version || "unknown",
    title,
    url: String(data.url || data.source_url || "").trim(),
    retrievedAt: String(data.retrieved_at || "").trim(),
    contentHash: String(data.content_hash || "").trim(),
    file: relativeFile,
    pagePath,
  };

  return {
    doc,
    chunks: chunkMarkdown(doc, body),
    frontmatter: data,
  };
}

export function chunkMarkdown(doc, markdown, options = {}) {
  const maxChars = options.maxChars || DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars || DEFAULT_OVERLAP_CHARS;
  const sections = splitSections(markdown);
  const chunks = [];
  let ordinal = 0;

  for (const section of sections) {
    const sectionChunks = splitLongSection(section.text, maxChars, overlapChars);
    for (const text of sectionChunks) {
      chunks.push({
        id: `${doc.id}#${ordinal + 1}`,
        docId: doc.id,
        ordinal: ordinal + 1,
        library: doc.library,
        version: doc.version,
        title: doc.title,
        heading: section.heading,
        headingPath: section.headingPath,
        url: doc.url,
        file: doc.file,
        text: text.trim(),
      });
      ordinal += 1;
    }
  }

  if (chunks.length === 0) {
    chunks.push({
      id: `${doc.id}#1`,
      docId: doc.id,
      ordinal: 1,
      library: doc.library,
      version: doc.version,
      title: doc.title,
      heading: doc.title,
      headingPath: [doc.title],
      url: doc.url,
      file: doc.file,
      text: markdown.trim(),
    });
  }

  return chunks;
}

function splitSections(markdown) {
  const sections = [];
  const headingStack = [];
  let current = {
    heading: "",
    headingPath: [],
    lines: [],
  };

  for (const line of markdown.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      pushCurrent(sections, current);
      const depth = match[1].length;
      const heading = stripMarkdownInline(match[2]);
      headingStack.length = depth - 1;
      headingStack[depth - 1] = heading;
      current = {
        heading,
        headingPath: headingStack.filter(Boolean),
        lines: [line],
      };
    } else {
      current.lines.push(line);
    }
  }

  pushCurrent(sections, current);
  return sections;
}

function pushCurrent(sections, current) {
  const text = current.lines.join("\n").trim();
  if (!text) {
    return;
  }
  sections.push({
    heading: current.heading || "Overview",
    headingPath: current.headingPath.length > 0 ? current.headingPath : ["Overview"],
    text,
  });
}

function splitLongSection(text, maxChars, overlapChars) {
  if (text.length <= maxChars) {
    return [text];
  }

  const paragraphs = text.split(/\n{2,}/);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const addition = current ? `\n\n${paragraph}` : paragraph;
    if (current.length + addition.length <= maxChars) {
      current += addition;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = tail(current, overlapChars);
    }

    if (paragraph.length > maxChars) {
      const pieces = splitHard(paragraph, maxChars, overlapChars);
      chunks.push(...pieces.slice(0, -1));
      current = pieces[pieces.length - 1] || "";
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
}

function splitHard(text, maxChars, overlapChars) {
  const chunks = [];
  let offset = 0;
  while (offset < text.length) {
    chunks.push(text.slice(offset, offset + maxChars));
    offset += Math.max(1, maxChars - overlapChars);
  }
  return chunks;
}

function tail(text, maxChars) {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(text.length - maxChars);
}

function titleFromPath(pagePath) {
  const base = path.basename(pagePath).replace(/\.(md|mdx|markdown)$/i, "");
  return base
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
