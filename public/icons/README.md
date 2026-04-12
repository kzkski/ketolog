# PWA 用アイコン

マスターは 1024×1024 の円形 KETOLOG ロゴ（PNG）。`sips` で次のサイズにリサイズして配置しています。

| ファイル | サイズ |
|----------|--------|
| `icon-512.png` | 512×512 |
| `icon-192.png` | 192×192 |
| `icon-header.png` | 160×160（512 から縮小。今日ページヘッダー用。表示は約 40–44px で 2–3x DPR 向け） |

Web App Manifest（`src/app/manifest.ts`）から `/icons/icon-512.png` と `/icons/icon-192.png` を参照しています（[#88](https://github.com/kzkski/ketolog/issues/88)）。
