#!/usr/bin/env node
/**
 * 文部科学省「日本食品標準成分表（八訂）増補2023」第2章（データ）Excel から
 * `standard_food_items` 用のシード SQL を生成する。
 *
 * 公式ファイル（2026-03-27 時点）:
 *   https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_02.xlsx
 * 対象シート: 表全体（行13以降がデータ）
 * P / F / 糖質相当: 列 J(10) PROT-、列 M(13) FAT-、列 P(16) CHOAVL（利用可能炭水化物・質量計）
 *
 * 使い方:
 *   npm run etl:mext-ch2
 *
 * 環境変数:
 *   MEXT_CH2_XLSX_PATH — ローカル .xlsx を読む場合（未指定時は上記 URL を取得）
 *   MEXT_CH2_OUT — 出力 SQL パス（既定: supabase/migrations/20260412120001_standard_food_items_seed.sql）
 *
 * 正誤表: 調査のとおり第2章本データに反映済みのため通常は本ファイルのみでよい。
 * 将来、正誤表だけ日付が新しく本データが追従していない場合は公式を再取得して本スクリプトを再実行する。
 */

import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const DEFAULT_URL =
  "https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_02.xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUT = path.join(
  ROOT,
  "supabase/migrations/20260412120001_standard_food_items_seed.sql"
);

const SOURCE_VERSION =
  "日本食品標準成分表（八訂）増補2023・第2章データ（2026-03-27版）";

const COL = {
  group: 0,
  foodCode: 1,
  name: 3,
  protein: 9,
  fat: 12,
  carbs: 15,
};

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBuffer(new URL(res.headers.location, url).href)
            .then(resolve)
            .catch(reject);
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

function parseNutrient(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "number" && Number.isFinite(cell)) return cell;
  const s = String(cell).trim();
  if (s === "" || s === "-" || s === "*" || s.toLowerCase() === "tr") return null;
  const stripped = s.replace(/[()]/g, "").trim();
  const n = parseFloat(stripped);
  return Number.isFinite(n) ? n : null;
}

function normalizeName(name) {
  return String(name)
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function sqlNum(n) {
  if (n === null || n === undefined) return "NULL";
  return String(n);
}

async function main() {
  const outPath = process.env.MEXT_CH2_OUT || DEFAULT_OUT;
  const localPath = process.env.MEXT_CH2_XLSX_PATH;

  const buf = localPath
    ? fs.readFileSync(localPath)
    : await fetchBuffer(DEFAULT_URL);

  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets["表全体"];
  if (!sheet) {
    throw new Error('シート「表全体」が見つかりません');
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const values = [];
  for (let i = 12; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[COL.foodCode] == null) continue;
    const foodCode = String(r[COL.foodCode]).trim();
    if (!/^\d{5}$/.test(foodCode)) continue;

    const groupCode = String(r[COL.group] ?? "").trim();
    if (!/^\d{2}$/.test(groupCode)) continue;

    const name = String(r[COL.name] ?? "").trim();
    if (!name) continue;

    const nameNorm = normalizeName(name);
    const p = parseNutrient(r[COL.protein]);
    const f = parseNutrient(r[COL.fat]);
    const c = parseNutrient(r[COL.carbs]);

    values.push(
      `(${sqlStr(foodCode)}, ${sqlStr(groupCode)}, ${sqlStr(name)}, ${sqlStr(
        nameNorm
      )}, ${sqlNum(p)}, ${sqlNum(f)}, ${sqlNum(c)}, ${sqlStr(SOURCE_VERSION)})`
    );
  }

  const header = `-- 自動生成（scripts/etl-mext-ch2.mjs）— ${values.length} 件
-- 先に 20260412120000_standard_food_items.sql を適用済みであること（初回適用時テーブルは空）

INSERT INTO public.standard_food_items (
  food_code,
  group_code,
  name,
  name_normalized,
  protein_per_100g,
  fat_per_100g,
  carbs_per_100g,
  source_version
) VALUES
`;

  const batchSize = 400;
  const parts = [header];
  for (let i = 0; i < values.length; i += batchSize) {
    const chunk = values.slice(i, i + batchSize);
    parts.push(chunk.join(",\n"));
    parts.push(i + batchSize < values.length ? ",\n" : ";\n");
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, parts.join(""), "utf8");
  console.error(`Wrote ${values.length} rows to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
