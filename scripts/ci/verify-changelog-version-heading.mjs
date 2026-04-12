#!/usr/bin/env node
/**
 * PR 用: ベースブランチと比べて package.json の version が変わったとき、
 * CHANGELOG.md に同じ版の見出し（## [x.y.z]）があることを確認する。
 *
 * 環境変数 BASE_REF: GitHub の base ブランチ名（例: main）。未設定時は main。
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const baseRef = process.env.BASE_REF || "main";

execSync(`git fetch origin ${baseRef}:refs/remotes/origin/${baseRef}`, {
  stdio: "inherit",
});

const basePkg = execSync(`git show origin/${baseRef}:package.json`, {
  encoding: "utf8",
});
const headPkg = readFileSync("package.json", "utf8");
const baseVer = JSON.parse(basePkg).version;
const headVer = JSON.parse(headPkg).version;

if (baseVer === headVer) {
  console.log(
    `package.json version unchanged (${headVer}); skip CHANGELOG heading check.`,
  );
  process.exit(0);
}

console.log(`package.json version changed: ${baseVer} -> ${headVer}`);

const changelog = readFileSync("CHANGELOG.md", "utf8");
const escaped = headVer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const re = new RegExp(`^## \\[${escaped}\\]`, "m");
if (!re.test(changelog)) {
  console.error(
    `ERROR: CHANGELOG.md must include a release heading: ## [${headVer}] - YYYY-MM-DD`,
  );
  process.exit(1);
}

console.log(`OK: found ## [${headVer}] in CHANGELOG.md`);
