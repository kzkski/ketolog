import { Linking } from "react-native";

/**
 * 利用規約・プライバシーポリシー URL 解決（#293 法務導線）。
 * https のみ開く。完全 URL 環境変数があれば origin より優先。
 */
const DEFAULT_TERMS_PATH = "/legal/terms";
const DEFAULT_PRIVACY_PATH = "/legal/privacy";

function trimOrigin(origin: string): string {
  return origin.replace(/\/$/, "");
}

function isValidHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function fullUrlOrNullFromEnv(key: "EXPO_PUBLIC_KETOLOG_LEGAL_TERMS_URL" | "EXPO_PUBLIC_KETOLOG_LEGAL_PRIVACY_URL"):
  | string
  | null {
  const raw = process.env[key];
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  if (t === "" || !isValidHttpsUrl(t)) return null;
  return t;
}

function fromOriginPath(path: string): string | null {
  const raw = process.env.EXPO_PUBLIC_KETOLOG_WEB_ORIGIN;
  if (raw === undefined || raw === null) return null;
  const origin = String(raw).trim();
  if (origin === "" || !isValidHttpsUrl(origin) || !isValidHttpsUrl(`${origin}/`)) return null;
  return `${trimOrigin(origin)}${path.startsWith("/") ? path : `/${path}`}`;
}

/** 表示・オープン用: 解決不可なら null。 */
export function getKetologTermsUrl(): string | null {
  return fullUrlOrNullFromEnv("EXPO_PUBLIC_KETOLOG_LEGAL_TERMS_URL") ?? fromOriginPath(DEFAULT_TERMS_PATH);
}

export function getKetologPrivacyUrl(): string | null {
  return fullUrlOrNullFromEnv("EXPO_PUBLIC_KETOLOG_LEGAL_PRIVACY_URL") ?? fromOriginPath(DEFAULT_PRIVACY_PATH);
}

/** 同一レンダーで複数箇所に分けず使う。 */
export function resolveKetologLegalUrls(): { terms: string | null; privacy: string | null } {
  return { terms: getKetologTermsUrl(), privacy: getKetologPrivacyUrl() };
}

/**
 * 規約類 URL のみ。失敗しても例外は投げない。
 * @param onError UI 用（任意）
 */
export async function openKetologLegalUrl(
  url: string,
  onError?: (message: string) => void
): Promise<void> {
  if (!isValidHttpsUrl(url)) {
    onError?.("有効な https URL ではありません。");
    return;
  }
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) {
      onError?.("このリンクを開けませんでした。");
      return;
    }
    await Linking.openURL(url);
  } catch {
    onError?.("ブラウザを開けませんでした。");
  }
}
