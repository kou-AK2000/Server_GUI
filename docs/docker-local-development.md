# Docker Desktopによるローカル開発環境

## 1. 目的

この手順は、OrdenのPhase 2（クラウド保存）の開発・検証を自分のMac上で行うためのものです。Docker DesktopでPostgreSQLだけを起動し、APIとブラウザアプリはNode.jsで実行します。

本番サーバーを構築する手順ではありません。本番では、正式な認証、HTTPS、秘密情報管理、バックアップ、監視を別途実装・設定します。

## 2. ローカル構成

```text
ブラウザ
  └─ Orden Webアプリ（Vite / React）: http://127.0.0.1:5176 など
       ├─ IndexedDB：ローカル下書き・キャッシュ
       └─ HTTP API：http://127.0.0.1:8787
            └─ PostgreSQL（Docker）：127.0.0.1:5432
```

- PostgreSQLのポートは`127.0.0.1`だけへ公開します。LANやインターネットから直接接続できません。
- 構成図・レベル1〜4の設計データは、既存のOrden JSON形式のままPostgreSQLの`JSONB`列に保存します。
- JSON書出し／読込とIndexedDB保存は、クラウド保存とは独立して継続利用できます。

## 3. 必要なもの

- Mac
- Docker Desktop
- Node.js 22.12以降
- このリポジトリのローカルコピー

動作確認コマンドです。

```bash
docker version
docker compose version
node --version
```

## 4. 初回セットアップ

リポジトリのルートで実行します。

```bash
cd "/Users/kou/Documents/ChatGPT/サーバー設計GUIアプリ"

cp server/.env.example server/.env
cp app/.env.example app/.env

docker compose up -d postgres
npm install
npm run api:migrate
```

`server/.env`と`app/.env`はローカル専用設定であり、Gitにコミットしません。

### 4.1 設定ファイルの役割

| ファイル | 役割 |
|---|---|
| `docker-compose.yml` | PostgreSQL 16コンテナとローカル用ボリューム |
| `server/.env` | APIからDBへの接続情報、開発時の接続元URL |
| `app/.env` | ブラウザアプリが接続するAPI URLと開発用ID |
| `server/migrations/001_initial.sql` | Workspace、Project、Diagram、権限、履歴テーブル |

## 5. 起動方法

ターミナルを2つ使います。

### ターミナル1：API

```bash
cd "/Users/kou/Documents/ChatGPT/サーバー設計GUIアプリ"
npm run api:dev
```

APIの確認先は次です。

```text
http://127.0.0.1:8787/health
```

`{"status":"ok"}`が表示されれば、APIとPostgreSQLの接続は正常です。

### ターミナル2：Orden画面

```bash
cd "/Users/kou/Documents/ChatGPT/サーバー設計GUIアプリ/app"
npm run dev -- --host 127.0.0.1
```

画面に表示されたURLをブラウザで開きます。Viteは5173番ポートを優先しますが、使用中なら5174、5175のように別ポートを使います。

その場合は、`server/.env`の`ORDEN_ALLOWED_ORIGIN`を実際のURLに合わせ、APIを再起動してください。

```text
ORDEN_ALLOWED_ORIGIN=http://127.0.0.1:5176
```

## 6. クラウド保存の確認

1. Ordenをブラウザで開く。
2. Fileメニューを開く。
3. **クラウドへ保存**を選ぶ。
4. 初回のみ、開発用のWorkspace、Project、Diagramが自動作成される。
5. 構成図を変更して再度保存する。
6. File → **クラウドから開く**で保存済みの構成図を開く。

保存時、現在のリビジョンとサーバー側のリビジョンが異なる場合は保存を拒否します。これは、Phase 3の同時編集を導入する前に意図しない上書きを防ぐためです。

## 7. 日常操作

| 操作 | コマンド |
|---|---|
| PostgreSQLを起動 | `docker compose up -d postgres` |
| PostgreSQLの状態確認 | `docker compose ps` |
| PostgreSQLを停止 | `docker compose stop postgres` |
| APIを起動 | `npm run api:dev` |
| APIの型チェック | `npm run api:typecheck` |
| DBスキーマを適用 | `npm run api:migrate` |
| フロントエンドを起動 | `cd app && npm run dev -- --host 127.0.0.1` |

`docker compose stop`はデータを消しません。データはDockerボリューム`orden-postgres-data`へ保持されます。

## 8. データを初期化する場合

開発用DBを完全に作り直す場合だけ、次を実行します。Workspace、Project、Diagram、履歴はすべて消えます。

```bash
docker compose down -v
docker compose up -d postgres
npm run api:migrate
```

実在する設計データを扱う前に、必ずJSON書出しでバックアップしてください。

## 9. セキュリティ上の注意

- `ORDEN_DEV_AUTH=true`と`X-Orden-Dev-*`ヘッダーは**開発専用**です。本番へ配置してはいけません。
- `docker-compose.yml`内のDBパスワードはローカル検証用です。本番では環境変数・Secret Managerなどで個別に管理します。
- 本番では、OIDCまたは社内SSO、HTTPS、サーバー側セッション、監査ログ、DBバックアップ、暗号化を導入します。
- JSON、DB、ログにはパスワード、APIキー、秘密鍵を保存しません。
- `server/.env`と`app/.env`は`.gitignore`によりGit管理されません。

## 10. よくある問題

### Dockerが起動していない

Docker Desktopを起動後、次を実行します。

```bash
docker compose up -d postgres
```

### `クラウドへ保存`が表示されない

`app/.env`が存在するか確認し、Viteをいったん停止して再起動します。

```bash
test -f app/.env && echo "app/.env exists"
```

### ブラウザで保存に失敗する

APIのヘルスチェックを確認します。

```bash
curl http://127.0.0.1:8787/health
```

Viteのポートと`server/.env`の`ORDEN_ALLOWED_ORIGIN`が一致していることも確認します。

### PostgreSQLを停止・再起動したい

```bash
docker compose stop postgres
docker compose up -d postgres
```
