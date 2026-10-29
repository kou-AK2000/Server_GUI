# Orden export templates

このフォルダは、Ordenの設計情報を組織ごとのExcel帳票へ出力するためのテンプレートパックの置き場です。

初期実装では、次の2ファイルをアプリから選択して出力します。

- `template.xlsx`: 組織の書式、ロゴ、罫線、固定文言を含むExcelファイル
- `mapping.json`: Ordenの出力データを、どのセル・表・画像位置へ配置するか定義するJSONファイル

`orden-standard-v1` はマッピングの最小例です。対応する `template.xlsx` は、組織ごとにシート名とセル位置を揃えて用意します。

テンプレートにはマクロや実行可能なコードを含めません。対応範囲と作成手順は [export-template-spec-v1.md](../docs/export-template-spec-v1.md) を参照してください。
