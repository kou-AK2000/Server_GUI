# 共通データモデル

## 目的

構成図、属性編集、整合性チェック、保存、一覧表示、CSV出力が、同じプロジェクトデータを参照するための最小データモデルを定義します。

初期MVPでは、プロジェクト全体を単一のJSONファイルとして書き出せます。また、ブラウザ内の保存領域にも保存できます。画面上の位置や見た目と、サーバー・ネットワークの設計情報を別々に管理しながら、同じ部品IDで関連付けます。

## 設計原則

- すべての主要データには、変更されない一意なIDを付ける。
- 画面上の表示名と、ホスト名・IPアドレスなどの設計情報を混同しない。
- 接続は線の見た目ではなく、接続元・接続先を参照するデータとして保持する。
- 未入力値は空文字列または空配列として保存し、チェック機能が判断する。
- JSONファイル内に実環境の認証情報や秘密情報を保存しない。
- MVPでは属性を固定し、任意属性や組織独自属性は次フェーズで扱う。

## データ全体像

```text
Project
├─ diagrams[]
├─ components[]
│  ├─ serverDetail
│  └─ middleware[]
└─ connections[]

ValidationResult[]
└─ Projectを入力として都度計算する。保存時の正本にはしない。
```

## 1. Project

プロジェクト全体を表します。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `schemaVersion` | string | はい | 保存形式のバージョン。初期値は `1.0`。 |
| `id` | string | はい | プロジェクトID。UUID形式を想定。 |
| `name` | string | はい | プロジェクト名。 |
| `description` | string | いいえ | プロジェクトの説明。 |
| `createdAt` | string | はい | ISO 8601形式の作成日時。 |
| `updatedAt` | string | はい | ISO 8601形式の更新日時。 |
| `diagrams` | Diagram[] | はい | 構成図の配列。MVPでは全体構成図を1件作成する。 |
| `components` | Component[] | はい | 構成要素の配列。 |
| `connections` | Connection[] | はい | 接続情報の配列。 |

プロジェクト（例：`販売管理システム`）を、レベル1の全体構成図と、そこから参照するレベル2〜4の情報を含む1セットとして扱います。ブラウザ保存ではこのProject単位で保存・切替します。

## 2. Diagram

構成図のキャンバスを表します。MVPでは `type: overall` の図を1件だけ利用します。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `id` | string | はい | 構成図ID。 |
| `name` | string | はい | 構成図の表示名。例：`全体構成図`。 |
| `type` | string | はい | MVPでは `overall` 固定。将来は `server-detail` などを追加する。 |
| `width` | number | はい | 保存時のキャンバス幅。 |
| `height` | number | はい | 保存時のキャンバス高。 |

## 3. Component

構成図に配置する部品を表します。サーバーとネットワーク機器を共通の構造で管理し、種別ごとの詳細属性だけを分けます。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `id` | string | はい | 部品ID。接続や詳細情報の参照に使用する。 |
| `diagramId` | string | はい | 配置先の構成図ID。 |
| `type` | ComponentType | はい | 部品種別。 |
| `displayName` | string | はい | 構成図上に表示する名称。例：`Webサーバー`。 |
| `iconKey` | string | はい | 部品に表示するFont Awesome Freeアイコンの識別子。 |
| `color` | string | はい | 部品枠・アイコンに使う色（CSSカラー値）。 |
| `position` | Position | はい | キャンバス上の座標。 |
| `notes` | string | いいえ | 部品に関する補足。 |
| `serverDetail` | ServerDetail | 条件付き | `type: server` の場合に設定する。 |
| `networkDetail` | NetworkDetail | 条件付き | ネットワーク機器の場合に設定する。 |
| `middleware` | Middleware[] | はい | サーバーに登録したミドルウェア。サーバー以外では空配列。 |

### ComponentType

MVPで利用できる部品種別です。

```text
server
l2-switch
router
firewall
custom
```

`custom` は、標準部品にない機器・サービスを利用者が追加するための種別です。初期版では、部品名・アイコン・色を編集できます。アイコンはFont Awesome Freeのうちアプリ側で用意した選択肢から選びます。任意SVGや画像ファイルをそのままプロジェクトに取り込む機能は、保存形式・ライセンス確認を設計してから追加します。

### Position

```text
Position
├─ x: number  # キャンバス左端からのX座標
└─ y: number  # キャンバス上端からのY座標
```

## 4. ServerDetail

サーバー固有の設計情報です。`Component.type` が `server` の場合に利用します。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `hostname` | string | MVPチェック対象 | ホスト名。 |
| `ipAddress` | string | MVPチェック対象 | IPv4アドレス。 |
| `osName` | string | いいえ | OS名。例：`RHEL`。 |
| `osVersion` | string | いいえ | OSバージョン。例：`9.6`。 |
| `cpu` | string | いいえ | CPU仕様。例：`8 vCPU`。 |
| `memory` | string | いいえ | メモリ容量。例：`16 GB`。 |
| `disk` | string | いいえ | ディスク容量。例：`200 GB`。 |
| `purpose` | string | いいえ | 用途。例：`Webサーバー`。 |

容量の単位やCPUコア数は、初期版では表示・入力の柔軟性を優先して文字列で持ちます。計算や集計が必要になった時点で、数値と単位へ分割します。

## 5. NetworkDetail

ネットワーク機器固有の設計情報です。`l2-switch`、`router`、`firewall` の場合に利用します。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `managementIpAddress` | string | いいえ | 管理用IPアドレス。 |
| `purpose` | string | いいえ | 用途。例：`DMZ用L2スイッチ`。 |

## 6. Middleware

サーバーに登録するミドルウェアです。ミドルウェアは構成図の独立部品ではなく、サーバーに紐付く詳細データとして扱います。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `id` | string | はい | ミドルウェアID。 |
| `name` | string | はい | 名称。例：`Nginx`。 |
| `version` | string | いいえ | バージョン。 |
| `port` | string | いいえ | 利用ポート。例：`80, 443`。 |
| `configurationNote` | string | いいえ | 設定に関するメモ。 |

## 7. Connection

2つの部品間の接続を表します。接続線の描画位置は画面側で扱い、設計上の接続関係はこのデータを正本とします。

| 項目 | 型 | 必須 | 説明 |
|---|---|---:|---|
| `id` | string | はい | 接続ID。 |
| `sourceComponentId` | string | はい | 接続元の部品ID。 |
| `targetComponentId` | string | はい | 接続先の部品ID。 |
| `connectionType` | string | いいえ | 種別。初期値は `network`。 |
| `sourceInterface` | string | いいえ | 接続元インターフェース。例：`eth0`。 |
| `targetInterface` | string | いいえ | 接続先インターフェース。例：`Gi0/1`。 |
| `notes` | string | いいえ | 接続に関する補足。 |

同じ部品の組み合わせでも、インターフェースが異なれば別の接続として登録できます。

## 8. ValidationResult

チェック結果を画面に表示するための計算結果です。JSON保存の正本には含めず、`Project`から再計算します。

| 項目 | 型 | 説明 |
|---|---|---|
| `id` | string | チェック結果ID。 |
| `ruleId` | string | チェックルールID。例：`server.ip.duplicate`。 |
| `severity` | string | `warning` または `info`。 |
| `message` | string | 利用者向けのメッセージ。 |
| `componentIds` | string[] | 関連する部品ID。 |

## JSON例

```json
{
  "schemaVersion": "1.0",
  "id": "project-demo-001",
  "name": "3層構成サンプル",
  "description": "プロトタイプ確認用のダミー構成",
  "createdAt": "2026-09-10T10:00:00+09:00",
  "updatedAt": "2026-09-10T10:00:00+09:00",
  "diagrams": [
    {
      "id": "diagram-overall-001",
      "name": "全体構成図",
      "type": "overall",
      "width": 1600,
      "height": 900
    }
  ],
  "components": [
    {
      "id": "server-web-001",
      "diagramId": "diagram-overall-001",
      "type": "server",
      "displayName": "Webサーバー",
      "position": { "x": 180, "y": 180 },
      "notes": "DMZに配置",
      "serverDetail": {
        "hostname": "web01",
        "ipAddress": "192.168.10.11",
        "osName": "RHEL",
        "osVersion": "9.6",
        "cpu": "4 vCPU",
        "memory": "8 GB",
        "disk": "100 GB",
        "purpose": "Webサーバー"
      },
      "networkDetail": null,
      "middleware": [
        {
          "id": "middleware-nginx-001",
          "name": "Nginx",
          "version": "1.24",
          "port": "80, 443",
          "configurationNote": "TLS終端を担当"
        }
      ]
    }
  ],
  "connections": []
}
```

## MVP後の拡張候補

- 標準コンポーネント種別の追加：ロードバランサー、NAS、データベース、クラウドサービス、コンテナ
- IPアドレス、VLAN、インターフェースを独立したデータとして管理
- 詳細図の階層化と親子関係の管理
- CPU、メモリ、ディスクの数値化と集計
- 組織固有の属性定義
- 変更履歴、差分比較、Git連携
- Export Schema v1によるテンプレート向けの正規化データ出力
