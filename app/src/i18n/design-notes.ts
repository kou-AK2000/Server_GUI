import type { Locale } from './index'

export const designNoteCopy: Record<Locale, { title: string; placeholder: string; descriptions: Record<string, string> }> = {
  ja: {
    title: '設計メモ',
    placeholder: '例: この構成を選んだ理由、共有したい前提、検討中の事項を記載します。',
    descriptions: {},
  },
  en: {
    title: 'Design notes',
    placeholder: 'Example: Explain why this design was selected, assumptions to share, and items under review.',
    descriptions: {
      'システム全体の方針、判断理由、顧客・営業へ共有したい背景を残します。': 'Record system-wide policies, decision rationale, and context to share with customers and sales teams.',
      'システム全体に関する判断理由、前提、未確定事項を残します。': 'Record system-wide rationale, assumptions, and open items.',
      'サーバー・クラウド配置・構成の判断理由や注意点を残します。': 'Record rationale and considerations for server, cloud, and configuration choices.',
      'サービス構成の理由、運用上の注意、依存関係を残します。': 'Record service design rationale, operational notes, and dependencies.',
      '設定値の意図、変更時の注意、未確定事項を残します。': 'Record the intent of settings, change considerations, and open items.',
    },
  },
}
