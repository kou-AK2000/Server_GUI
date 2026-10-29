# Excel export template specification v1

## 目的

組織ごとに異なる設計書のExcel書式を保ちつつ、Ordenの設計情報を一貫したデータ構造から出力します。標準のExcel出力は置き換えません。テンプレート出力は追加の選択肢です。

## テンプレートパック

テンプレートパックは、次の構成を推奨します。

```text
organization-infra-template-v1/
├─ manifest.json
├─ mapping.json
├─ template.xlsx
└─ README.md
```

- `template.xlsx`: 既存の書式、ロゴ、固定文章、列幅、罫線を保持する帳票
- `mapping.json`: Ordenデータをどこへ配置するかの宣言
- `manifest.json`: 配布・一覧表示・互換性確認に使うメタデータ。初期版のアプリ画面では読み込み必須ではありません
- `README.md`: 組織内の利用方法と変更履歴

テンプレートは **.xlsxのみ** を対象にします。`.xlsm`、VBAマクロ、任意JavaScript、外部接続は初期版の対象外です。

## mapping.json

```json
{
  "schemaVersion": "1.0",
  "templateId": "example-infra-v1",
  "templateVersion": "1.0.0",
  "sheets": []
}
```

| 項目 | 説明 |
|---|---|
| `schemaVersion` | マッピング仕様のバージョン。初期版は `1.0`。 |
| `templateId` | テンプレートを識別する安定したID。英数字、`-`、`_` を推奨。 |
| `templateVersion` | 帳票の版。帳票レイアウトを変更したら更新。 |
| `sheets` | シートごとのセル、一覧、画像の配置設定。 |

### 固定セル

```json
{
  "name": "表紙",
  "cells": [
    { "address": "B3", "value": "project.name" },
    { "address": "B4", "value": "systemPolicy.architecturePolicy" }
  ]
}
```

`address` はExcelセル番地、`value` はExport Schemaのドット区切りパスです。パスの式評価や関数実行は行いません。

### 繰り返し一覧

```json
{
  "headerCell": "A6",
  "dataCell": "A7",
  "source": "servers",
  "columns": [
    { "header": "サーバー名", "value": "displayName" },
    { "header": "IPアドレス", "value": "ipAddress" }
  ]
}
```

`headerCell` を指定すると、列名を出力します。`dataCell` は最初のデータ行の左上です。値は右・下へ連続して配置され、あらかじめテンプレートに設定した書式を維持します。

初期版の `source` は次に限定します。

- `servers`
- `components`
- `ipAddresses`
- `connections`
- `middleware`
- `validationResults`

### 構成図画像

```json
{
  "source": "diagrams.level1",
  "cell": "B4",
  "width": 760
}
```

初期版ではレベル1全体構成図をPNGとして配置できます。`height` を省略すると元の縦横比を維持します。

## 利用手順

1. 組織の設計書を複製し、`template.xlsx` として保存します。
2. `mapping.json` にシート名、セル番地、一覧の開始位置を記載します。
3. Ordenの「ファイル」→「エクスポート」→「Excelテンプレート（.xlsx）…」から2ファイルを選択します。
4. 出力結果をExcelで開き、印刷範囲や既存の数式が意図どおりか確認します。

## 互換性と運用ルール

- `docs/export-schema-v1.md` を共通データ契約とします。テンプレートはアプリ内部の保存JSONへ直接依存しません。
- シート名やセル位置だけを変えた場合も、`templateVersion` を更新します。
- テンプレートはGitで管理し、変更理由・レビュー・対象組織をREADMEに残します。
- 互換性を壊すExport Schema変更は新しいメジャー版で行います。
- 初期版では、テンプレートが確保したデータ行の書式だけを維持します。大量データ用の動的な行挿入、複雑な帳票分岐、Word/PDF出力は次の段階で追加します。
