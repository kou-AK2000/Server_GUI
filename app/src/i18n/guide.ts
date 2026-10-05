import type { Locale } from './index'

export type GuideSection = { title: string; entries: Array<{ label: string; description: string }> }

const ja: GuideSection[] = [
  { title: '構成図の操作', entries: [{ label: '部品の追加', description: '左の部品一覧からドラッグ＆ドロップ、またはクリックします。' }, { label: '部品の移動', description: '部品をドラッグします。グリッドと他部品の中心線へ吸着します。' }, { label: '接続', description: '接続モードで支点をドラッグ、または⌘／Ctrlを押しながら2部品を選択します。' }, { label: '線の編集', description: '線を選択し、経路・始点・終点をドラッグします。' }] },
  { title: 'レベル構成', entries: [{ label: 'レベル1：全体構成図', description: 'システム全体の部品と接続を把握します。主な閲覧者：営業、顧客、管理者。' }, { label: 'レベル2：サーバー詳細図', description: 'サーバー／VMごとのOS、リソース、ネットワーク、運用情報を整理します。' }, { label: 'レベル3：MW・サービス詳細', description: 'サービスの用途、ランタイム、実行方式、ポートなどを整理します。' }, { label: 'レベル4：設定・パラメータ', description: 'OS、ネットワーク、セキュリティ、サービスの詳細値と方針を管理します。' }] },
  { title: '設計情報', entries: [{ label: '詳細を開く', description: 'サーバーをダブルクリック、またはプロパティから詳細図を開きます。' }, { label: '整合性チェック', description: 'メニューバーから開き、結果を選ぶと該当部品へ移動します。' }] },
  { title: '保存・書き出し', entries: [{ label: 'ブラウザ保存', description: '現在のブラウザ内にシステムセットを保存します。' }, { label: '共有・バックアップ', description: 'JSONを書き出し、別の環境ではJSONを開きます。' }, { label: '一覧出力', description: '書き出しメニューからCSVまたはExcelを作成します。' }] },
  { title: 'キーボード操作', entries: [{ label: '元に戻す', description: '⌘Z または Ctrl+Z' }, { label: 'やり直す', description: '⌘⇧Z または Ctrl+Y' }, { label: '削除', description: '選択中の部品・接続をDeleteキーで削除します。' }] },
]

const en: GuideSection[] = [
  { title: 'Diagram operations', entries: [{ label: 'Add components', description: 'Drag from Components, or click an item to add it.' }, { label: 'Move components', description: 'Drag a component. It snaps to the grid and other component center lines.' }, { label: 'Connect', description: 'Drag a handle in connection mode, or select two components with ⌘ / Ctrl held.' }, { label: 'Edit lines', description: 'Select a line and drag its route, source, or target.' }] },
  { title: 'Level structure', entries: [{ label: 'Level 1: System overview', description: 'Shows the system’s components and connections for sales, customers, and administrators.' }, { label: 'Level 2: Server detail', description: 'Organizes OS, resources, network, and operations per server or VM.' }, { label: 'Level 3: Middleware and services', description: 'Organizes service category, runtime, execution method, and ports.' }, { label: 'Level 4: Settings and parameters', description: 'Manages detailed OS, network, security, and service settings.' }] },
  { title: 'Design information', entries: [{ label: 'Open details', description: 'Double-click a server, or open its detail diagram from Properties.' }, { label: 'Validation', description: 'Open it from the menu and select a result to jump to the component.' }] },
  { title: 'Save and export', entries: [{ label: 'Browser save', description: 'Saves the current system set in this browser.' }, { label: 'Sharing and backup', description: 'Export JSON and open it in another environment.' }, { label: 'Lists', description: 'Export CSV or Excel from the Export menu.' }] },
  { title: 'Keyboard shortcuts', entries: [{ label: 'Undo', description: '⌘Z or Ctrl+Z' }, { label: 'Redo', description: '⌘⇧Z or Ctrl+Y' }, { label: 'Delete', description: 'Use the Delete key for selected components or connections.' }] },
]

export const userGuide: Record<Locale, GuideSection[]> = { ja, en }
