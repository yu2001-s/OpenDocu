export function resolveVersionCandidates(availableVersions, requestedVersion) {
  if (!requestedVersion) {
    return null;
  }

  const available = [...new Set(availableVersions.map(String))];
  const requested = String(requestedVersion);
  if (available.includes(requested)) {
    return [requested];
  }

  const variants = [requested.replace(/^v/i, ""), requested.startsWith("v") ? requested : `v${requested}`];
  for (const variant of variants) {
    if (available.includes(variant)) {
      return [variant];
    }
  }

  const aliases = semverAliases(requested);
  const alias = aliases.find((candidate) => available.includes(candidate));
  if (alias) {
    return [alias];
  }

  const compatible = available
    .filter((version) => aliases.some((candidate) => version === candidate || version.startsWith(`${candidate}.`)))
    .sort(compareVersionDesc);
  return compatible.length > 0 ? compatible : [requested];
}

export function semverAliases(version) {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(version));
  if (!match) {
    return [];
  }

  const [, major, minor, patch] = match;
  return [
    major && minor && patch ? `${major}.${minor}.${patch}` : "",
    major && minor ? `${major}.${minor}` : "",
    major || "",
  ].filter(Boolean);
}

function compareVersionDesc(a, b) {
  const aParts = numericParts(a);
  const bParts = numericParts(b);
  const length = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (bParts[index] || 0) - (aParts[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return String(b).localeCompare(String(a));
}

function numericParts(version) {
  const match = /^v?(\d+(?:\.\d+)*)/.exec(String(version));
  return match ? match[1].split(".").map(Number) : [];
}
