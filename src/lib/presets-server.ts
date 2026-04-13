import fs from "fs";
import path from "path";

export type PresetMeta = { name: string; file: string; itemCount: number };

let presetsCache: PresetMeta[] | null = null;

/** `public/presets` の一覧。プロセス内で 1 回だけ読み込む。 */
export function loadPresets(): PresetMeta[] {
  if (presetsCache) return presetsCache;

  const dir = path.join(process.cwd(), "public", "presets");
  presetsCache = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      const json = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      return { name: json.name as string, file, itemCount: (json.menuItems as unknown[]).length };
    })
    .sort((a, b) => a.file.localeCompare(b.file));

  return presetsCache;
}
