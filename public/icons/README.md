# PWA 用アイコン

[Issue #88](https://github.com/kzkski/ketolog/issues/88) で合意した **円形 KETOLOG ロゴ**の PNG を、次のファイル名でこのディレクトリに配置してください。

| ファイル | 用途 |
|----------|------|
| `icon-512.png` | 512×512（マスターを正方形に整えたもの） |
| `icon-192.png` | 192×192（同素材からリサイズ） |

実装では Web App Manifest から `/icons/icon-512.png` および `/icons/icon-192.png` を参照する想定です。maskable 用に余白を増やした別画像が必要になった場合は、同 Issue で追記します。
