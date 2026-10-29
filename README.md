# Orden

Orden（オルデン）は、スペイン語で「秩序・整頓」を意味します。

インフラ設計で分散しがちな構成図、部品属性、接続情報、サーバー内部のミドルウェア情報を、共通の設計データとして扱うためのプロトタイプです。複雑な設計情報を一貫したデータで整理し、全体像から詳細まで直感的に把握・管理できることを目指します。

## 名称の由来

「Orden」には、構成図・属性・接続関係・設計書を一つの設計データとして整え、情報のばらつきや設計粒度の不一致を減らすというプロダクトの思想を込めています。

## 現在できること

- レベル1：システム全体の構成図の編集
- レベル2〜4：サーバー、サービス、パラメータの段階的な詳細化
- 部品プロパティ、接続先、インターフェース情報の編集
- カスタム部品の追加
- ブラウザ保存、JSON書出し／読込、CSV・Excel出力

## リポジトリ構成

```text
.
├─ app/       # React / TypeScriptによるブラウザアプリ
├─ server/    # Phase 2: Node.js / TypeScript APIとPostgreSQLスキーマ
└─ docs/      # 要件、データモデル、画面仕様、出力仕様
```

## 動かし方

Node.js 22.12以上とpnpmを用意してから、次を実行します。

```bash
cd app
pnpm install --frozen-lockfile
pnpm dev
```

詳細な環境要件とテスト手順は [app/README.md](app/README.md) を参照してください。

## 設計方針

- 構成図、部品属性、接続、チェック、出力は共通データを正本とする
- 設計データはJSONで扱い、将来のGit管理やIaC連携につなげる
- ブラウザ保存は作業用、JSON書出しは共有・バックアップ用にする
- ブラウザ内保存は作業用、サーバー保存ではWorkspace単位の権限・履歴を管理する
- DB・認証・複数人同時編集は段階的に追加する。現在のサーバーAPIは開発用認証までを実装済み

本番公開前に必要な認証、権限、HTTPS、バックアップ、監査、検索の方針は[本番公開に向けた改善・セキュリティロードマップ](docs/production-readiness-roadmap.md)で管理します。

## Phase 2 サーバー基盤（開発中）

`server/`には、PostgreSQLへ現在のOrden JSONをJSONBとして保存するAPI基盤があります。ワークスペース権限、プロジェクト、構成図、履歴、保存競合の検出を担当します。

開発環境では、ブラウザ画面からクラウド保存・読込を確認できます。本番認証は未実装のため、公開前にOIDCまたは社内SSOを接続します。詳細とローカル起動方法は[server/README.md](server/README.md)を参照してください。

ローカル開発では、Docker Desktopがある環境向けに[Docker Compose設定](docker-compose.yml)も用意しています。`docker compose up -d postgres`でPostgreSQLだけを起動し、APIとブラウザアプリはMac上のNode.jsで動かします。初回セットアップから日常操作までの手順は[Docker Desktopによるローカル開発環境](docs/docker-local-development.md)を参照してください。

## 作成者・管理

- 作成者・リポジトリ所有者：Kousuke Akiba
- 企画・要件定義・設計・プロダクト管理：Kousuke Akiba
- 開発ではAI開発支援ツールを活用
