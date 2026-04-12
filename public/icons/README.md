# PWA 用アイコン

マスターは 1024×1024 の円形 KETOLOG ロゴ（PNG）。`sips` で次のサイズにリサイズして配置しています。

| ファイル | サイズ |
|----------|--------|
| `icon-512.png` | 512×512 |
| `icon-192.png` | 192×192 |
| `icon-header-44.png` | 44×44（今日ページヘッダー用。CSS でも 44px＝`h-11` で 1:1。デザインで書き出した同寸の PNG があればこのファイルを差し替えてよい） |

Web App Manifest からは `/icons/icon-512.png` と `/icons/icon-192.png` を参照する想定です（[#88](https://github.com/kzkski/ketolog/issues/88)）。
