#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const errors = [];

const packageJson = readJson("package.json");
const pluginJson = readJson(".codex-plugin/plugin.json");
const claudePluginJson = readJson(".claude-plugin/plugin.json");
const constants = fs.readFileSync(path.join(ROOT, "src/constants.mjs"), "utf8");

requiredString(packageJson, "name", "package.json");
requiredString(packageJson, "version", "package.json");
requiredString(pluginJson, "name", ".codex-plugin/plugin.json");
requiredString(pluginJson, "version", ".codex-plugin/plugin.json");
requiredString(pluginJson, "description", ".codex-plugin/plugin.json");
requiredString(claudePluginJson, "name", ".claude-plugin/plugin.json");
requiredString(claudePluginJson, "displayName", ".claude-plugin/plugin.json");
requiredString(claudePluginJson, "version", ".claude-plugin/plugin.json");
requiredString(claudePluginJson, "description", ".claude-plugin/plugin.json");

if (packageJson.version !== pluginJson.version) {
  errors.push(`package/plugin version mismatch: ${packageJson.version} != ${pluginJson.version}`);
}
if (packageJson.version !== claudePluginJson.version) {
  errors.push(`package/Claude plugin version mismatch: ${packageJson.version} != ${claudePluginJson.version}`);
}
if (!constants.includes(`VERSION = "${packageJson.version}"`)) {
  errors.push(`src/constants.mjs VERSION must match package version ${packageJson.version}`);
}

if (!pluginJson.skills || pluginJson.skills !== "./skills/") {
  errors.push("plugin skills path must be ./skills/");
}
if (!claudePluginJson.skills || claudePluginJson.skills !== "./skills/") {
  errors.push("Claude plugin skills path must be ./skills/");
}

if (
  !Array.isArray(pluginJson.interface?.defaultPrompt) ||
  pluginJson.interface.defaultPrompt.length === 0 ||
  !pluginJson.interface.defaultPrompt.every((prompt) => typeof prompt === "string" && prompt.trim())
) {
  errors.push("plugin interface.defaultPrompt must be a non-empty array of strings");
}

for (const field of ["websiteURL", "privacyPolicyURL", "termsOfServiceURL"]) {
  requiredHttpsString(pluginJson.interface || {}, field, ".codex-plugin/plugin.json interface");
}

if (pluginJson.mcpServers || claudePluginJson.mcpServers) {
  errors.push("OpenDocu must not declare MCP servers");
}

for (const scriptName of ["gate:fixture", "gate:normalization", "gate:workflow-sim", "gate:package", "gate:network", "gate:release"]) {
  if (typeof packageJson.scripts?.[scriptName] !== "string" || packageJson.scripts[scriptName].trim() === "") {
    errors.push(`package.json scripts must include ${scriptName}`);
  }
}
for (const scriptName of ["eval:live:plan", "eval:live:score"]) {
  if (typeof packageJson.scripts?.[scriptName] !== "string" || packageJson.scripts[scriptName].trim() === "") {
    errors.push(`package.json scripts must include ${scriptName}`);
  }
}

validatePackageFiles([
  ".codex-plugin/",
  ".claude-plugin/",
  "commands/",
  "skills/",
  "AGENTS.md",
]);
validateSkill("skills/opendocu");
validateCommand("commands/search.md");
validateReadmeInstallPrompt("README.md");
validateLiveEvalDoc("docs/live-agent-eval.md");
validateRetrievalRepairDoc("skills/opendocu/references/retrieval-repair.md");
validateSourceNormalizationDoc("skills/opendocu/references/source-normalization.md");
validateSourceFirstAlignment();
rejectTodoMarkers([
  "AGENTS.md",
  "README.md",
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  "commands/search.md",
  "docs/agent-adapters.md",
  "skills/opendocu/SKILL.md",
  "skills/opendocu/references/retrieval-repair.md",
  "skills/opendocu/references/source-normalization.md",
]);

if (errors.length > 0) {
  console.error("OpenDocu repo validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("OpenDocu repo validation passed");

function readJson(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${relativePath} must be readable JSON: ${error.message}`);
    return {};
  }
}

function requiredString(object, key, file) {
  if (typeof object[key] !== "string" || object[key].trim() === "") {
    errors.push(`${file} field ${key} must be a non-empty string`);
  }
}

function requiredHttpsString(object, key, file) {
  if (typeof object[key] !== "string" || !object[key].startsWith("https://")) {
    errors.push(`${file} field ${key} must be an https:// URL`);
  }
}

function validateSkill(relativePath) {
  const skillPath = path.join(ROOT, relativePath, "SKILL.md");
  let content = "";
  try {
    content = fs.readFileSync(skillPath, "utf8");
  } catch {
    errors.push(`${relativePath}/SKILL.md is missing`);
    return;
  }

  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) {
    errors.push(`${relativePath}/SKILL.md must start with YAML frontmatter`);
    return;
  }

  const fields = Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^([a-zA-Z_-]+):\s*(.*)$/))
      .filter(Boolean)
      .map((lineMatch) => [lineMatch[1], lineMatch[2].replace(/^["']|["']$/g, "")]),
  );
  if (!/^[a-z0-9-]+$/.test(fields.name || "")) {
    errors.push(`${relativePath}/SKILL.md name must be hyphen-case`);
  }
  if (!fields.description || fields.description.length < 40) {
    errors.push(`${relativePath}/SKILL.md description is too short`);
  }
}

function validateCommand(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    errors.push(`${relativePath} is missing`);
    return;
  }

  if (!content.startsWith("---\n")) {
    errors.push(`${relativePath} must start with YAML frontmatter`);
  }
  if (!content.includes("opendocu search") && !content.includes("OpenDocu")) {
    errors.push(`${relativePath} must describe OpenDocu search`);
  }
}

function validateReadmeInstallPrompt(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    errors.push(`${relativePath} is missing`);
    return;
  }

  for (const required of ["Agent install prompt", "Install the OpenDocu coding-agent plugin", "https://github.com/yu2001-s/OpenDocu"]) {
    if (!content.includes(required)) {
      errors.push(`${relativePath} must mention ${required}`);
    }
  }
}

function validateLiveEvalDoc(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    errors.push(`${relativePath} is missing`);
    return;
  }

  for (const required of ["npm run eval:live:plan", "npm run eval:live:score", "Do not show query prompts or answer keys"]) {
    if (!content.includes(required)) {
      errors.push(`${relativePath} must mention ${required}`);
    }
  }
}

function validateRetrievalRepairDoc(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    errors.push(`${relativePath} is missing`);
    return;
  }

  for (const required of ["Retrieval repair", "opendocu get", "Replay the original failed search", "Do not create cards from model memory"]) {
    if (!content.includes(required)) {
      errors.push(`${relativePath} must mention ${required}`);
    }
  }
}

function validateSourceNormalizationDoc(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    errors.push(`${relativePath} is missing`);
    return;
  }

  for (const required of ["Source Normalization", "official-doc adapter", "source_format", "source_adapter", "opendocu import"]) {
    if (!content.includes(required)) {
      errors.push(`${relativePath} must mention ${required}`);
    }
  }
}

function validateSourceFirstAlignment() {
  const requiredByFile = {
    "README.md": ["Source docs are the knowledge base", "Semantic cards are retrieval patches"],
    "AGENTS.md": ["Raw official docs are the knowledge base", "replay the failed search"],
    "commands/search.md": ["semantic cards as optional routing hints", "raw docs"],
    "docs/architecture.md": ["targeted retrieval patches", "feedback loop is failure-driven"],
    "docs/validation-gate.md": ["source-first retrieval", "failure-driven semantic-card repair"],
    "docs/validation-report.md": ["failure-driven retrieval repair", "Do not interpret low card counts as failure"],
    "skills/opendocu/SKILL.md": ["run retrieval repair", "Raw official docs are the knowledge base"],
    "skills/opendocu/references/source-normalization.md": ["official-doc adapter", "source-backed Markdown/MDX", "source_format"],
    "skills/opendocu/references/searching.md": ["`opendocu search` and `opendocu get` are different steps", "follow `retrieval-repair.md`"],
    "skills/opendocu/references/semantic-map.md": ["retrieval patches", "Do not attempt to mirror every original doc page"],
    "skills/opendocu/references/validation.md": ["Low semantic-card counts are not a failure", "justified as retrieval patches"],
    "src/cli.mjs": ["Retrieval repair metadata", "optional retrieval patches"],
    "scripts/release_gate.mjs": ["retrieval-repair-initial-miss", "retrieval-repair-replay-routes-raw-doc"],
    "scripts/workflow_sim_gate.mjs": ["repair-initial-search-miss", "repair-replay-routes-raw-doc"],
    "scripts/source_normalization_gate.mjs": ["structured official-source fixture", "source_adapter", "niche-parameter-search"],
    "scripts/live_agent_eval.mjs": ["Raw docs are the knowledge base", "Correct raw-doc retrieval is enough"],
  };

  for (const [relativePath, requiredTerms] of Object.entries(requiredByFile)) {
    const content = readTextIfExists(relativePath);
    if (!content) {
      errors.push(`${relativePath} is missing`);
      continue;
    }
    for (const required of requiredTerms) {
      if (!content.includes(required)) {
        errors.push(`${relativePath} must align with source-first retrieval repair: missing ${required}`);
      }
    }
  }

  const forbiddenPhrases = [
    "Semantic map maintenance",
    "semantic-only query",
    "semantic-card quality",
    "create semantic cards only when useful",
    "maintain semantic cards when aliases",
    "maintain the semantic map well",
  ];
  const filesToScan = [
    "README.md",
    "AGENTS.md",
    "commands/search.md",
    "docs/agent-adapters.md",
    "docs/architecture.md",
    "docs/install.md",
    "docs/validation-gate.md",
    "docs/validation-report.md",
    "docs/live-agent-eval.md",
    "skills/opendocu/SKILL.md",
    "skills/opendocu/references/growing.md",
    "skills/opendocu/references/searching.md",
    "skills/opendocu/references/semantic-map.md",
    "skills/opendocu/references/validation.md",
    "src/cli.mjs",
    "scripts/live_agent_eval.mjs",
  ];

  for (const relativePath of filesToScan) {
    const content = readTextIfExists(relativePath);
    if (!content) {
      continue;
    }
    for (const phrase of forbiddenPhrases) {
      if (content.includes(phrase)) {
        errors.push(`${relativePath} contains outdated source-first wording: ${phrase}`);
      }
    }
  }
}

function validatePackageFiles(entries) {
  const files = Array.isArray(packageJson.files) ? packageJson.files : [];
  for (const entry of entries) {
    if (!files.includes(entry)) {
      errors.push(`package.json files must include ${entry}`);
    }
  }
}

function readTextIfExists(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function rejectTodoMarkers(relativePaths) {
  for (const relativePath of relativePaths) {
    const filePath = path.join(ROOT, relativePath);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    if (content.includes("[TODO:") || content.includes("TODO launch")) {
      errors.push(`${relativePath} contains TODO marker`);
    }
  }
}
