# Export Schema v1

## 目的

Export Schemaは、プロジェクトデータを設計書テンプレートへ渡すための共通データ仕様です。

アプリ内部の保存形式は、画面上の座標や編集途中の情報を含みます。一方でテンプレートは、サーバー一覧、IPアドレス一覧、接続一覧など、設計書として意味のある整理済みデータだけを参照します。この分離により、アプリ本体の実装変更がテンプレートを不要に壊さないことを目指します。

## 対象範囲

Export Schema v1は、MVPで扱う次の出力を対象とします。

- サーバー一覧
- ネットワーク機器一覧
- IPアドレス一覧
- 接続一覧
- ミドルウェア一覧
- 基本チェック結果一覧
- 全体構成図の出力情報

初期MVPではCSV出力に利用します。将来はExcel、Word、PDF、Markdownのテンプレートが同じSchemaを利用します。

## 基本原則

- テンプレートはアプリ内部のJSON保存形式を直接参照しない。
- Schemaに含める値は、利用者が読める名前と単位を備えた設計書向けの値にする。
- 配列は、テンプレートで繰り返し表を作れる単位で用意する。
- IDは関連付けに利用できるが、通常は設計書に表示しない。
- 未入力値は `null` ではなく空文字列として出力する。
- 将来の項目追加は許容するが、既存の項目名・意味・型はv1の間は変更しない。
- テンプレートは未知の項目を無視できるものとする。

## バージョン管理

すべてのExport Schemaには、Schemaのバージョンと生成日時を含めます。

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-09-10T10:00:00+09:00"
}
```

テンプレートは、対応するSchemaのメジャーバージョンを宣言します。たとえば `1.x` 対応のテンプレートは、v1系の追加項目を無視して利用できます。既存の項目を削除・意味変更する場合はv2を新設します。

## データ全体像

```text
ExportDocument
├─ metadata
├─ project
├─ diagrams[]
├─ servers[]
├─ networkDevices[]
├─ ipAddresses[]
├─ connections[]
├─ middleware[]
└─ validationResults[]
```

## 1. ExportDocument

テンプレートへ渡すデータ全体です。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `schemaVersion` | string | はい | Export Schemaのバージョン。初期値は `1.0`。 |
| `generatedAt` | string | はい | ISO 8601形式の生成日時。 |
| `metadata` | ExportMetadata | はい | 出力処理に関する情報。 |
| `project` | ExportProject | はい | プロジェクト情報。 |
| `diagrams` | ExportDiagram[] | はい | 構成図の出力情報。 |
| `servers` | ExportServer[] | はい | サーバー一覧。 |
| `networkDevices` | ExportNetworkDevice[] | はい | ネットワーク機器一覧。 |
| `ipAddresses` | ExportIpAddress[] | はい | IPアドレス一覧。 |
| `connections` | ExportConnection[] | はい | 接続一覧。 |
| `middleware` | ExportMiddleware[] | はい | ミドルウェア一覧。 |
| `validationResults` | ExportValidationResult[] | はい | 基本チェック結果。 |

## 2. metadata

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `applicationName` | string | はい | 生成元アプリケーション名。 |
| `applicationVersion` | string | はい | 生成元アプリケーションのバージョン。 |
| `templateId` | string | いいえ | 使用したテンプレートID。CSVのようにテンプレートを使わない場合は空文字列。 |
| `templateVersion` | string | いいえ | 使用したテンプレートのバージョン。 |

## 3. project

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `id` | string | はい | プロジェクトID。通常は設計書に表示しない。 |
| `name` | string | はい | プロジェクト名。 |
| `description` | string | はい | プロジェクト説明。未入力時は空文字列。 |
| `createdAt` | string | はい | 作成日時。 |
| `updatedAt` | string | はい | 更新日時。 |

## 4. diagrams

構成図をテンプレートに掲載するための情報です。画像そのものはSchemaに埋め込まず、出力処理が一時的に生成した画像の参照を渡します。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `id` | string | はい | 構成図ID。 |
| `name` | string | はい | 構成図の名称。 |
| `type` | string | はい | `overall` などの構成図種別。 |
| `imageReference` | string | はい | 出力処理内で利用する画像参照。テンプレートパッケージ外へ公開しない。 |

## 5. servers

サーバーを1行ずつ出力するための一覧です。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `id` | string | はい | サーバーの部品ID。 |
| `displayName` | string | はい | 構成図上の表示名。 |
| `hostname` | string | はい | ホスト名。 |
| `ipAddress` | string | はい | 主IPアドレス。 |
| `osName` | string | はい | OS名。 |
| `osVersion` | string | はい | OSバージョン。 |
| `cpu` | string | はい | CPU仕様。 |
| `memory` | string | はい | メモリ容量。 |
| `disk` | string | はい | ディスク容量。 |
| `purpose` | string | はい | 用途。 |
| `notes` | string | はい | 備考。 |

## 6. networkDevices

ネットワーク機器を1行ずつ出力するための一覧です。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `id` | string | はい | 部品ID。 |
| `type` | string | はい | `l2-switch`、`router`、`firewall` のいずれか。 |
| `typeLabel` | string | はい | 表示用の種別名。例：`L2スイッチ`。 |
| `displayName` | string | はい | 構成図上の表示名。 |
| `managementIpAddress` | string | はい | 管理用IPアドレス。 |
| `purpose` | string | はい | 用途。 |
| `notes` | string | はい | 備考。 |

## 7. ipAddresses

IPアドレス管理表を作るための一覧です。MVPでは各部品の主IPまたは管理IPを1件として出力します。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `address` | string | はい | IPアドレス。未入力時は空文字列。 |
| `componentId` | string | はい | 所有する部品ID。 |
| `componentName` | string | はい | 所有する部品の表示名。 |
| `componentType` | string | はい | 所有する部品の表示用種別。 |
| `hostname` | string | はい | サーバーの場合のホスト名。サーバー以外は空文字列。 |
| `purpose` | string | はい | 用途。 |

## 8. connections

物理・論理的な接続一覧を作るためのデータです。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `id` | string | はい | 接続ID。 |
| `sourceComponentId` | string | はい | 接続元部品ID。 |
| `sourceComponentName` | string | はい | 接続元の表示名。 |
| `sourceInterface` | string | はい | 接続元インターフェース。 |
| `targetComponentId` | string | はい | 接続先部品ID。 |
| `targetComponentName` | string | はい | 接続先の表示名。 |
| `targetInterface` | string | はい | 接続先インターフェース。 |
| `connectionType` | string | はい | 接続種別。 |
| `notes` | string | はい | 備考。 |

## 9. middleware

サーバーとミドルウェアの対応表を作るための一覧です。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `id` | string | はい | ミドルウェアID。 |
| `serverId` | string | はい | 所属サーバーの部品ID。 |
| `serverName` | string | はい | 所属サーバーの表示名。 |
| `hostname` | string | はい | 所属サーバーのホスト名。 |
| `name` | string | はい | ミドルウェア名。 |
| `version` | string | はい | バージョン。 |
| `port` | string | はい | 利用ポート。 |
| `configurationNote` | string | はい | 設定メモ。 |

## 10. validationResults

出力時点のチェック結果です。テンプレートはチェック結果を一覧・警告表・サマリーとして利用できます。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `ruleId` | string | はい | ルールID。 |
| `severity` | string | はい | `warning` または `info`。 |
| `message` | string | はい | 利用者向けのメッセージ。 |
| `componentIds` | string[] | はい | 関連する部品ID。 |
| `componentNames` | string[] | はい | 関連する部品の表示名。 |

## JSON例

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-09-10T10:00:00+09:00",
  "metadata": {
    "applicationName": "サーバー構築・設計GUIツール",
    "applicationVersion": "0.1.0",
    "templateId": "",
    "templateVersion": ""
  },
  "project": {
    "id": "project-demo-001",
    "name": "3層構成サンプル",
    "description": "プロトタイプ確認用のダミー構成",
    "createdAt": "2026-09-10T10:00:00+09:00",
    "updatedAt": "2026-09-10T10:00:00+09:00"
  },
  "diagrams": [
    {
      "id": "diagram-overall-001",
      "name": "全体構成図",
      "type": "overall",
      "imageReference": "diagrams/overall.png"
    }
  ],
  "servers": [
    {
      "id": "server-web-001",
      "displayName": "Webサーバー",
      "hostname": "web01",
      "ipAddress": "192.168.10.11",
      "osName": "RHEL",
      "osVersion": "9.6",
      "cpu": "4 vCPU",
      "memory": "8 GB",
      "disk": "100 GB",
      "purpose": "Webサーバー",
      "notes": "DMZに配置"
    }
  ],
  "networkDevices": [],
  "ipAddresses": [],
  "connections": [],
  "middleware": [],
  "validationResults": []
}
```

## テンプレートが守るべきこと

- 対応するSchemaバージョンをテンプレートの設定ファイルへ明記する。
- 指定されていない項目を要求しない。
- 空文字列の項目は、空欄またはテンプレート側で定義した未設定表示として扱う。
- `id` や `imageReference` を外部サービスへ送信しない。
- 秘密情報を扱う項目を独自に追加しない。

## v1で扱わないこと

- テンプレートの具体的なファイル構成や記法
- 任意コードを実行するプラグイン仕様
- Word、Excel、PDFの個別出力エンジン仕様
- 多階層構成図の画像出力
- VLAN、サブネット、複数IP、ストレージ、クラウドリソースの詳細データ

これらは、MVPで共通データモデルとCSV出力の成立を確認してから別仕様として追加します。
