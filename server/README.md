# Orden API（Phase 2 基盤）

Ordenの構成図データを共有保存するためのNode.js / TypeScript APIです。構成図本体は既存のOrden JSON形式のままPostgreSQLの`JSONB`へ保存し、DBはワークスペース、権限、履歴、リビジョンを管理します。

## 現在含むもの

- Workspace → Project → Diagram の管理API
- `viewer` / `editor` / `owner` のワークスペース権限チェック
- JSONBによる構成図保存
- リビジョン履歴と、保存時の競合検出（HTTP 409）
- 秘密情報らしいフィールド名を含むJSONの保存拒否
- 本番で有効化できない、明示的な開発用IDヘッダー認証

## 重要：本番認証は未実装

`ORDEN_DEV_AUTH=true`はローカル動作確認専用です。HTTPヘッダーを信頼するため、公開環境で使ってはいけません。公開前にOIDC（Microsoft Entra ID、Google Workspace、Auth0等）または社内SSOを接続し、このアダプターを置き換えます。

## 開発時の起動

1. PostgreSQLを用意します。Docker Desktopを使う場合は、リポジトリのルートで`docker compose up -d postgres`を実行します。
2. `.env.example`を`.env`へコピーし、`DATABASE_URL`を実際の接続先に変更します。
3. ルートで次を実行します。

```bash
npm run api:migrate
npm run api:dev
```

ヘルスチェックは`GET http://127.0.0.1:8787/health`です。

フロントエンドに開発用の「クラウドへ保存／クラウドから開く」を表示するには、`app/.env.example`を`app/.env`へコピーしてからViteを再起動します。`server/.env`の`ORDEN_ALLOWED_ORIGIN`と、実際にViteを開いたURL（例：`http://127.0.0.1:5173`）を一致させてください。

開発APIを呼び出す場合だけ、次のヘッダーを付けます。

```text
X-Orden-Dev-User-Id: UUID
X-Orden-Dev-User-Email: developer@example.test
X-Orden-Dev-Display-Name: Developer
```

## APIの境界

開発環境では、ブラウザ側のFileメニューから「クラウドへ保存／クラウドから開く」を利用できます。本番では、開発用IDヘッダーを正式な認証セッションへ置き換えます。JSON入出力とIndexedDB保存は引き続き独立して使えます。

Docker Desktopを使った初回セットアップ、起動・停止、トラブルシューティングは[ローカル開発環境手順](../docs/docker-local-development.md)を参照してください。
