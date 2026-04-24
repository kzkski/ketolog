/**
 * Web `loadPresets` / `public/presets` と同じファイルをバンドルし、オフラインでもプリセット選択が使える。
 * 新規プリセット追加時は `public/presets/*.json` とこのマップを揃えること。
 */
import convenienceKeto from "../../../public/presets/convenience-keto.json";
import externalIzakayaKeto from "../../../public/presets/external-izakaya-keto.json";
import externalSteakKeto from "../../../public/presets/external-steak-keto.json";
import externalYakinikuKeto from "../../../public/presets/external-yakiniku-keto.json";
import externalYakitoriKeto from "../../../public/presets/external-yakitori-keto.json";
import homemadeKeto from "../../../public/presets/homemade-keto.json";
import kfcOriginalChicken from "../../../public/presets/kfc-original-chicken.json";

export type PresetMetaMobile = { name: string; file: string; itemCount: number };

const BUNDLED: Record<string, { name: string; menuItems: unknown[] }> = {
  "convenience-keto.json": convenienceKeto as { name: string; menuItems: unknown[] },
  "external-izakaya-keto.json": externalIzakayaKeto as { name: string; menuItems: unknown[] },
  "external-steak-keto.json": externalSteakKeto as { name: string; menuItems: unknown[] },
  "external-yakiniku-keto.json": externalYakinikuKeto as { name: string; menuItems: unknown[] },
  "external-yakitori-keto.json": externalYakitoriKeto as { name: string; menuItems: unknown[] },
  "homemade-keto.json": homemadeKeto as { name: string; menuItems: unknown[] },
  "kfc-original-chicken.json": kfcOriginalChicken as { name: string; menuItems: unknown[] },
};

/** `loadPresets` と同じソート（ファイル名の localeCompare） */
export const RESTAURANT_PRESET_LIST: PresetMetaMobile[] = Object.keys(BUNDLED)
  .sort((a, b) => a.localeCompare(b))
  .map((file) => {
    const j = BUNDLED[file];
    return { name: j.name, file, itemCount: j.menuItems.length };
  });

function ketologWebOrigin(): string | null {
  const raw = process.env.EXPO_PUBLIC_KETOLOG_WEB_ORIGIN?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/**
 * まず同梱 JSON を返す。無いファイルの場合のみ `EXPO_PUBLIC_KETOLOG_WEB_ORIGIN/presets/:file` を fetch（オンライン時）。
 */
export async function loadPresetJsonText(file: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const bundled = BUNDLED[file];
  if (bundled) {
    return { ok: true, text: JSON.stringify(bundled) };
  }
  const origin = ketologWebOrigin();
  if (!origin) {
    return { ok: false, error: "このプリセットはアプリに同梱されていません。EXPO_PUBLIC_KETOLOG_WEB_ORIGIN を設定するか、アプリを更新してください。" };
  }
  try {
    const res = await fetch(`${origin}/presets/${encodeURIComponent(file)}`);
    if (!res.ok) return { ok: false, error: `取得に失敗しました (HTTP ${res.status})` };
    return { ok: true, text: await res.text() };
  } catch {
    return { ok: false, error: "取得に失敗しました。ネットワークを確認してください。" };
  }
}
