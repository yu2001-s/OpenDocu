export function parseFrontmatter(input) {
  if (!input.startsWith("---\n") && !input.startsWith("---\r\n")) {
    return { data: {}, body: input };
  }

  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(input);
  if (!match) {
    return { data: {}, body: input };
  }

  const raw = match[1];
  const body = input.slice(match[0].length);
  return { data: parseSimpleYaml(raw), body };
}

function parseSimpleYaml(raw) {
  const data = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      continue;
    }

    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if (!key) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    data[key] = value;
  }
  return data;
}

export function firstHeading(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? stripMarkdownInline(match[1]).trim() : "";
}

export function stripMarkdownInline(value) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]/g, "")
    .trim();
}
