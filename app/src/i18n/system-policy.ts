import type { Locale } from './index'

export const systemPolicyExamples: Record<Locale, Record<string, string>> = {
  ja: { architecturePolicy: '例: ハイブリッド構成 / クラウド優先', sharedNetwork: '例: 社内基幹NW / 共通VPC', governance: '例: 情報システム部 / 運用ベンダー', availabilityPolicy: '例: 重要系は冗長化、その他は単一系', boundaryPolicy: '例: FW経由で外部SaaSと連携', notes: '例: 個別の配置先はレベル2を正とする' },
  en: { architecturePolicy: 'Example: Hybrid architecture / cloud first', sharedNetwork: 'Example: Corporate network / shared VPC', governance: 'Example: IT department / operations vendor', availabilityPolicy: 'Example: Redundant for critical systems; single instance otherwise', boundaryPolicy: 'Example: Integrate with external SaaS through a firewall', notes: 'Example: Level 2 is the source of truth for individual placements' },
}
