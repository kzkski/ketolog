import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

export type PickJsonTextResult =
  | { ok: true; text: string }
  | { ok: false; canceled: true }
  | { ok: false; error: string };

export async function pickJsonFileText(): Promise<PickJsonTextResult> {
  const r = await DocumentPicker.getDocumentAsync({
    type: "application/json",
    copyToCacheDirectory: true,
  });
  if (r.canceled) return { ok: false, canceled: true };
  const asset = r.assets[0];
  if (!asset?.uri) return { ok: false, error: "ファイルを読み取れませんでした" };
  try {
    const text = await FileSystem.readAsStringAsync(asset.uri);
    return { ok: true, text };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "ファイルの読み込みに失敗しました",
    };
  }
}
