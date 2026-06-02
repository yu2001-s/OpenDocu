#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const DEFAULT_OUT = path.join(ROOT, "dist", "opendocu");

async function main() {
  const outDir = path.resolve(parseOutDir(process.argv.slice(2)));

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  await copyPath(".codex-plugin", ".codex-plugin", outDir);
  await copyPath(".claude-plugin", ".claude-plugin", outDir);
  await copyPath("bin", "bin", outDir);
  await copyPath("commands", "commands", outDir);
  await copyPath("src", "dist/src", outDir);
  await copyPath("LICENSE", "LICENSE", outDir);

  await copyBundledSkill(outDir);

  console.log(
    JSON.stringify(
      {
        bundle: path.relative(ROOT, outDir),
        status: "built",
      },
      null,
      2,
    ),
  );
}

function parseOutDir(args) {
  const outIndex = args.indexOf("--out");
  if (outIndex === -1) {
    return DEFAULT_OUT;
  }
  const value = args[outIndex + 1];
  if (!value) {
    throw new Error("--out requires a path");
  }
  return value;
}

async function copyPath(fromRelative, toRelative, outDir) {
  const fromPath = path.join(ROOT, fromRelative);
  const toPath = path.join(outDir, toRelative);
  await fs.mkdir(path.dirname(toPath), { recursive: true });
  await fs.cp(fromPath, toPath, { recursive: true });
}

async function copyBundledSkill(outDir) {
  const skillRoot = path.join(outDir, "skills", "opendocu");
  await fs.mkdir(path.join(skillRoot, "agents"), { recursive: true });

  const sourceSkill = await fs.readFile(path.join(ROOT, "skills", "opendocu", "SKILL.md"), "utf8");
  await fs.writeFile(path.join(skillRoot, "SKILL.md"), makeSelfContainedSkill(sourceSkill), "utf8");

  await fs.cp(
    path.join(ROOT, "skills", "opendocu", "agents", "openai.yaml"),
    path.join(skillRoot, "agents", "openai.yaml"),
  );
}

function makeSelfContainedSkill(content) {
  return content.replace(
    /\n## Load References As Needed\n[\s\S]*?(?=\n## Hard Rules\n)/,
    `
## Bundle Note

Installed plugin bundles are self-contained. When this skill is loaded from the full source checkout and deeper \`references/\` files are present, use them for edge cases; otherwise follow this workflow and the hard rules below.

`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
