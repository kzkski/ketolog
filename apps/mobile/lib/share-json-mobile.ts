import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

/** UTF-8 JSON を一時ファイルに書き、OS の共有シートで渡す */
export async function shareUtf8JsonFile(
  filename: string,
  contents: string
): Promise<{ error: string | null }> {
  try {
    const base = FileSystem.cacheDirectory;
    if (!base) return { error: "一時ファイル用の場所を確保できませんでした" };
    const safeName = filename.replace(/[/\\]/g, "-");
    const path = `${base}${safeName}`;
    await FileSystem.writeAsStringAsync(path, contents);
    const ok = await Sharing.isAvailableAsync();
    if (!ok) return { error: "共有がこの端末で利用できません" };
    await Sharing.shareAsync(path, {
      mimeType: "application/json",
      UTI: "public.json",
      dialogTitle: safeName,
    });
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "共有に失敗しました" };
  }
}
