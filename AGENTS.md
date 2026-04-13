<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## リポジトリ運用（GitHub Flow）

開発の手順・ブランチ名・コミット規約・**`package.json` のバージョン更新タイミング**は、すべて **CONTRIBUTING.md** に従う。

- `main` への直接コミットは禁止。作業ブランチで実装し、PR でマージする。
- Issue がある場合は PR で `closes #<番号>` などと紐づける。
- `feat/` の PR ではマイナー、`fix/` の PR ではパッチを上げる。`docs` / `chore` / `refactor` のみの変更では上げなくてよい（詳細は CONTRIBUTING.md）。
- ブランチ保護のバイパス操作（例: `gh pr merge --admin`）は原則禁止。必要時は実行前に理由と影響を示し、明示承認を得る。

Cursor では **`.cursor/rules/github-flow.mdc`** が常時適用され、上記と同じ方針が補強される。
