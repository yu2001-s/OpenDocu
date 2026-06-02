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
  const requestedParts = numericParts(requested);
  const lessSpecificAliases = aliases.slice(1);
  for (const alias of lessSpecificAliases.slice(0, -1)) {
    if (available.includes(alias)) {
      return [alias];
    }
  }

  const compatible =
    requestedParts.length >= 2
      ? available
          .filter((version) => isSameMinor(version, requested) && compareVersionAsc(version, requested) <= 0)
          .sort(compareVersionDesc)
      : available
          .filter((version) => isSameMajor(version, requested))
          .sort(compareVersionDesc);

  if (compatible.length > 0) {
    return compatible;
  }

  const majorAlias = lessSpecificAliases.at(-1);
  if (majorAlias && available.includes(majorAlias)) {
    return [majorAlias];
  }

  return [requested];
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

function compareVersionAsc(a, b) {
  return compareVersionDesc(b, a);
}

function isSameMinor(version, requested) {
  const versionParts = numericParts(version);
  const requestedParts = numericParts(requested);
  return (
    versionParts.length >= 2 &&
    requestedParts.length >= 2 &&
    versionParts[0] === requestedParts[0] &&
    versionParts[1] === requestedParts[1]
  );
}

function isSameMajor(version, requested) {
  const versionParts = numericParts(version);
  const requestedParts = numericParts(requested);
  return versionParts.length >= 1 && requestedParts.length >= 1 && versionParts[0] === requestedParts[0];
}

function numericParts(version) {
  const match = /^v?(\d+(?:\.\d+)*)/.exec(String(version));
  return match ? match[1].split(".").map(Number) : [];
}
