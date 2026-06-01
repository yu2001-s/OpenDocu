const SYMBOL_TOKEN_RE = /[A-Za-z0-9_$@#][A-Za-z0-9_$@#./:_-]*/g;

export function tokenize(input) {
  const tokens = [];
  const seen = new Set();

  for (const match of input.matchAll(SYMBOL_TOKEN_RE)) {
    const raw = match[0];
    for (const token of expandToken(raw)) {
      if (!token || seen.has(token)) {
        continue;
      }
      seen.add(token);
      tokens.push(token);
    }
  }

  return tokens;
}

export function tokenCounts(input) {
  const counts = new Map();
  for (const match of input.matchAll(SYMBOL_TOKEN_RE)) {
    for (const token of expandToken(match[0])) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return counts;
}

export function queryGroups(terms) {
  return terms
    .map((term) => ({
      raw: term,
      tokens: tokenize(term),
      phrase: normalizePhrase(term),
    }))
    .filter((group) => group.tokens.length > 0 || group.phrase.length > 0);
}

export function normalizePhrase(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function expandToken(raw) {
  const lower = raw.toLowerCase();
  const values = new Set();
  add(values, lower);

  const symbolParts = lower.split(/[._/:-]+/g).filter(Boolean);
  for (const part of symbolParts) {
    add(values, part);
  }

  for (const part of raw.split(/[._/:-]+/g).filter(Boolean)) {
    for (const camel of splitCamel(part)) {
      add(values, camel.toLowerCase());
    }
  }

  for (const value of [...values]) {
    if (value.length > 3 && value.endsWith("s")) {
      add(values, value.slice(0, -1));
    }
  }

  return [...values].filter((value) => value.length > 0);
}

function splitCamel(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}

function add(set, value) {
  const cleaned = value.replace(/^[-_.:/]+|[-_.:/]+$/g, "");
  if (cleaned) {
    set.add(cleaned);
  }
}
