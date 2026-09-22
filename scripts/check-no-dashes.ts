// Fails if any tracked OR new (untracked, non-ignored) file contains an em dash
// (U+2014) or en dash (U+2013). Covering untracked files matters: it catches a
// dash in code that hasn't been committed yet, which `git ls-files` alone misses.
// Run via `bun run check:dashes`. Wired into `bun run check`.
// See CLAUDE.md "Punctuation" rule.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Built from code points rather than written out, so the rule-enforcer file
// does not trip its own rule. A string escape would not survive Prettier.
const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);

// Generated output and vendored component source are not ours to police.
const EXEMPT_PREFIXES = [
  "src/lib/paraglide/",
  "src/lib/components/ui/",
  "static/corpus/",
  "bun.lock",
];

// Lines that document the rule itself naturally include the forbidden characters.
function isAllowedException(line: string): boolean {
  return line.includes("Never use em dashes");
}

function isExempt(file: string): boolean {
  for (const prefix of EXEMPT_PREFIXES) {
    if (file.startsWith(prefix)) return true;
  }
  return false;
}

// --cached: tracked files; --others + --exclude-standard: untracked files that
// aren't gitignored. Together they cover the whole working tree we care about.
const filesOutput = execSync("git ls-files --cached --others --exclude-standard", {
  encoding: "utf-8",
});
const files = filesOutput.split("\n").filter(Boolean);

const violations: string[] = [];

for (const file of files) {
  if (isExempt(file)) continue;

  let content: string;
  try {
    content = readFileSync(file, "utf-8");
  } catch {
    continue;
  }
  if (!content.includes(EM_DASH) && !content.includes(EN_DASH)) continue;

  for (const [index, line] of content.split("\n").entries()) {
    if (!line.includes(EM_DASH) && !line.includes(EN_DASH)) continue;
    if (isAllowedException(line)) continue;
    violations.push(`  ${file}:${(index + 1).toString()}: ${line.trim()}`);
  }
}

if (violations.length > 0) {
  console.error("Em or en dashes found (CLAUDE.md punctuation rule):");
  for (const v of violations) console.error(v);
  process.exit(1);
}
