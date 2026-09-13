import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import {
  addEdge,
  Background,
  BaseEdge,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { Worksheet } from 'exceljs'
import { faBox, faCloud, faDatabase, faHardDrive, faNetworkWired, faRoute, faServer, faShieldHalved } from '@fortawesome/free-solid-svg-icons'

type DeviceKind = 'server' | 'network' | 'l2-switch' | 'router' | 'firewall' | 'database' | 'storage' | 'cloud' | 'custom'
type IconKey = 'server' | 'network' | 'router' | 'shield' | 'database' | 'storage' | 'cloud' | 'box'
type EditableField = 'displayName' | 'hostname' | 'ipAddress' | 'osName' | 'osVersion' | 'cpu' | 'memory' | 'disk' | 'purpose' | 'managementIpAddress' | 'notes' | 'deploymentType' | 'platformProvider' | 'platformLocation' | 'platformResource' | 'platformDetail' | 'layoutSlot' | 'level2Note' | 'level4Note'
type Middleware = { id: string; name: string; version: string; port: string; runtime: string; framework: string; executionMethod: string; repository: string; configurationPath: string; configurationNote: string; level3Note: string }
type MiddlewareField = Exclude<keyof Middleware, 'id'>
type View =
  | { level: 1 }
  | { level: 2; serverId: string }
  | { level: 3; serverId: string; middlewareId: string }
  | { level: 4; serverId: string; middlewareId?: string }

type DeviceData = {
  label: string
  kind: DeviceKind
  displayName: string
  hostname: string
  ipAddress: string
  osName: string
  osVersion: string
  cpu: string
  memory: string
  disk: string
  purpose: string
  managementIpAddress: string
  notes: string
  deploymentType: string
  platformProvider: string
  platformLocation: string
  platformResource: string
  platformDetail: string
  layoutSlot: string
  level2Note: string
  level4Note: string
  middleware: Middleware[]
  iconKey: IconKey
  color: string
}

type SystemPolicy = {
  architecturePolicy: string
  sharedNetwork: string
  governance: string
  availabilityPolicy: string
  boundaryPolicy: string
  notes: string
  designNote: string
}

type Selection = { type: 'node'; id: string } | { type: 'edge'; id: string } | null
type Validation = { severity: 'warning' | 'info'; message: string; nodeIds: string[] }
type ConnectionData = { connectionType: string; sourceInterface: string; targetInterface: string; notes: string; waypoint?: { x: number; y: number }; manualHandles?: boolean; routeOffset?: number; routeAnchorMode?: 'source' | 'target' | 'middle'; manualRoute?: { x: number; y: number } }
type ConnectionField = Exclude<keyof ConnectionData, 'waypoint' | 'manualHandles' | 'routeOffset' | 'routeAnchorMode' | 'manualRoute'>
type StoredProject = { schemaVersion: '1.4'; id: string; name: string; systemPolicy: SystemPolicy; layoutTemplate: LayoutTemplateId; nodes: Node<DeviceData>[]; edges: Edge<ConnectionData>[]; updatedAt: string }
type HistorySnapshot = { projectId: string; projectName: string; systemPolicy: SystemPolicy; layoutTemplate: LayoutTemplateId; nodes: Node<DeviceData>[]; edges: Edge<ConnectionData>[] }
type HistoryState = { undo: HistorySnapshot[]; redo: HistorySnapshot[]; current: HistorySnapshot }
type LayoutTemplateId = 'blank' | 'hierarchy' | 'zone' | 'cloud' | 'hub'
type LayoutTemplate = { id: LayoutTemplateId; name: string; description: string; preview: Array<{ kind: DeviceKind; x: number; y: number }> }

function historyNodes(nodes: Node<DeviceData>[]) {
  return nodes.map(({ selected: _selected, dragging: _dragging, measured: _measured, className: _className, ...node }) => structuredClone(node)) as Node<DeviceData>[]
}

function historyEdges(edges: Edge<ConnectionData>[]) {
  return edges.map(({ selected: _selected, ...edge }) => structuredClone(edge)) as Edge<ConnectionData>[]
}

const browserStorageKey = 'server-design-gui.projects.v1'
const emptySystemPolicy = (): SystemPolicy => ({ architecturePolicy: '', sharedNetwork: '', governance: '', availabilityPolicy: '', boundaryPolicy: '', notes: '', designNote: '' })
const isLayoutTemplateId = (value: unknown): value is LayoutTemplateId => ['blank', 'hierarchy', 'zone', 'cloud', 'hub'].includes(String(value))

function normalizeSystemPolicy(value: Record<string, unknown> | undefined): SystemPolicy {
  if (!value) return emptySystemPolicy()
  return {
    architecturePolicy: typeof value.architecturePolicy === 'string' ? value.architecturePolicy : typeof value.environmentType === 'string' ? value.environmentType : '',
    sharedNetwork: typeof value.sharedNetwork === 'string' ? value.sharedNetwork : typeof value.networkName === 'string' ? value.networkName : '',
    governance: typeof value.governance === 'string' ? value.governance : typeof value.accountOrOrg === 'string' ? value.accountOrOrg : '',
    availabilityPolicy: typeof value.availabilityPolicy === 'string' ? value.availabilityPolicy : '',
    boundaryPolicy: typeof value.boundaryPolicy === 'string' ? value.boundaryPolicy : typeof value.provider === 'string' ? value.provider : '',
    notes: typeof value.notes === 'string' ? value.notes : typeof value.regionOrSite === 'string' ? value.regionOrSite : '',
    designNote: typeof value.designNote === 'string' ? value.designNote : '',
  }
}

const deploymentOptions = ['物理サーバー（オンプレ）', '仮想マシン', 'クラウドVM', 'コンテナ／Kubernetes', 'PaaS／SaaS'] as const

function deploymentProfile(type: string) {
  switch (type) {
    case '物理サーバー（オンプレ）': return { provider: 'DC・拠点', location: 'ラック・設置場所', resource: '筐体・機器名', detail: '資産・保守情報', examples: ['例: 東京DC', '例: R03 / 12U', '例: Dell PowerEdge R760', '例: 資産番号 / 保守契約'] }
    case '仮想マシン': return { provider: '仮想化基盤', location: 'クラスタ', resource: '物理ホスト', detail: 'VM名', examples: ['例: VMware vSphere', '例: prod-cluster', '例: esxi-01', '例: web01'] }
    case 'クラウドVM': return { provider: 'クラウド事業者・アカウント', location: 'リージョン・AZ', resource: 'サービス・インスタンス', detail: 'インスタンスタイプ', examples: ['例: AWS / production account', '例: ap-northeast-1a', '例: EC2 i-0123456789', '例: t3.large'] }
    case 'コンテナ／Kubernetes': return { provider: 'コンテナ基盤', location: 'クラスタ', resource: 'namespace・ワークロード', detail: 'イメージ・レプリカ数', examples: ['例: Amazon EKS', '例: prod-eks', '例: production / web-api', '例: registry/web:1.2 / 3 replicas'] }
    case 'PaaS／SaaS': return { provider: '提供事業者・サービス', location: 'テナント・リージョン', resource: '契約プラン・リソース', detail: '責任分界・契約メモ', examples: ['例: Salesforce', '例: tenant-a / 東京', '例: Enterprise plan', '例: ベンダー運用範囲'] }
    default: return { provider: 'クラウド／仮想化基盤', location: 'リージョン・拠点', resource: 'リソース・クラスタ', detail: '補足情報', examples: ['例: AWS / VMware vSphere', '例: ap-northeast-1 / 東京DC', '例: EC2 i-xxxx / EKS cluster', '例: 任意の補足情報'] }
  }
}

const kindLabels: Record<DeviceKind, string> = {
  server: 'サーバー',
  network: 'ネットワーク',
  'l2-switch': 'L2スイッチ',
  router: 'ルーター',
  firewall: 'ファイアウォール',
  database: 'データベース',
  storage: 'ストレージ',
  cloud: 'クラウドサービス',
  custom: 'カスタム部品',
}

const kindColors: Record<DeviceKind, string> = {
  server: '#2563eb',
  network: '#0891b2',
  'l2-switch': '#0f766e',
  router: '#7c3aed',
  firewall: '#dc2626',
  database: '#7c3aed',
  storage: '#b45309',
  cloud: '#0284c7',
  custom: '#475569',
}

const iconDefinitions: Record<IconKey, IconDefinition> = {
  server: faServer,
  network: faNetworkWired,
  router: faRoute,
  shield: faShieldHalved,
  database: faDatabase,
  storage: faHardDrive,
  cloud: faCloud,
  box: faBox,
}

const iconLabels: Record<IconKey, string> = {
  server: 'サーバー',
  network: 'ネットワーク',
  router: 'ルーター',
  shield: 'セキュリティ',
  database: 'データベース',
  storage: 'ストレージ',
  cloud: 'クラウド',
  box: '汎用ボックス',
}

const defaultIcon: Record<DeviceKind, IconKey> = {
  server: 'server',
  network: 'network',
  'l2-switch': 'network',
  router: 'router',
  firewall: 'shield',
  database: 'database',
  storage: 'storage',
  cloud: 'cloud',
  custom: 'box',
}

function iconFor(data: Pick<DeviceData, 'kind'> & Partial<Pick<DeviceData, 'iconKey'>>) {
  return iconDefinitions[data.iconKey ?? defaultIcon[data.kind]]
}

function middlewareData(values: Partial<Middleware> = {}): Middleware {
  return { id: values.id ?? crypto.randomUUID(), name: '', version: '', port: '', runtime: '', framework: '', executionMethod: '', repository: '', configurationPath: '', configurationNote: '', level3Note: '', ...values }
}

function deviceData(kind: DeviceKind, displayName: string, values: Partial<Omit<DeviceData, 'middleware'>> & { middleware?: Partial<Middleware>[] } = {}): DeviceData {
  return {
    label: displayName,
    kind,
    displayName,
    hostname: '',
    ipAddress: '',
    osName: '',
    osVersion: '',
    cpu: '',
    memory: '',
    disk: '',
    purpose: '',
    managementIpAddress: '',
    notes: '',
    deploymentType: '',
    platformProvider: '',
    platformLocation: '',
    platformResource: '',
    platformDetail: '',
    layoutSlot: '',
    level2Note: '',
    level4Note: '',
    iconKey: defaultIcon[kind],
    color: kindColors[kind],
    ...values,
    middleware: (values.middleware ?? []).map((item) => middlewareData(item)),
  }
}

const initialNodes: Node<DeviceData>[] = [
  {
    id: 'web01',
    type: 'device',
    position: { x: 90, y: 120 },
    data: deviceData('server', 'Webサーバー', { hostname: 'web01', ipAddress: '192.168.10.11', osName: 'RHEL', osVersion: '9.6', cpu: '4 vCPU', memory: '8 GB', disk: '100 GB', purpose: 'Webサーバー', deploymentType: '仮想マシン', platformProvider: 'VMware vSphere', platformLocation: 'prod-cluster', platformResource: 'esxi-01', platformDetail: 'web01', middleware: [{ id: 'nginx-web01', name: 'Nginx', version: '1.24', port: '80, 443', runtime: 'Nginx 1.24', executionMethod: 'systemd', configurationPath: '/etc/nginx/nginx.conf', configurationNote: 'TLS終端と静的コンテンツ配信' }, { id: 'php-fpm-web01', name: 'PHP-FPM', version: '8.3', port: '9000', runtime: 'PHP 8.3', executionMethod: 'systemd', configurationPath: '/etc/php-fpm.d/www.conf', configurationNote: 'Webアプリケーション実行' }] }),
    style: { borderColor: kindColors.server },
  },
  {
    id: 'app01',
    type: 'device',
    position: { x: 390, y: 120 },
    data: deviceData('server', 'APサーバー', { hostname: 'app01', ipAddress: '192.168.20.11', osName: 'RHEL', osVersion: '9.6', cpu: '4 vCPU', memory: '8 GB', disk: '100 GB', purpose: 'アプリケーションサーバー', deploymentType: '仮想マシン', platformProvider: 'VMware vSphere', platformLocation: 'prod-cluster', platformResource: 'esxi-02', platformDetail: 'app01', middleware: [{ id: 'java-app01', name: 'Java Runtime', version: '21', port: '8080', runtime: 'Java 21', executionMethod: 'systemd', configurationNote: 'アプリケーション実行環境' }] }),
    style: { borderColor: kindColors.server },
  },
  {
    id: 'db01',
    type: 'device',
    position: { x: 690, y: 120 },
    data: deviceData('server', 'DBサーバー', { hostname: 'db01', ipAddress: '192.168.30.11', osName: 'RHEL', osVersion: '9.6', cpu: '8 vCPU', memory: '16 GB', disk: '200 GB', purpose: 'データベースサーバー', deploymentType: '仮想マシン', platformProvider: 'VMware vSphere', platformLocation: 'prod-cluster', platformResource: 'esxi-03', platformDetail: 'db01', middleware: [{ id: 'postgres-db01', name: 'PostgreSQL', version: '16', port: '5432', runtime: 'PostgreSQL 16', executionMethod: 'systemd', configurationPath: '/var/lib/pgsql/data/postgresql.conf', configurationNote: '業務データベース' }] }),
    style: { borderColor: kindColors.server },
  },
  {
    id: 'sw01',
    type: 'device',
    position: { x: 390, y: 320 },
    data: deviceData('l2-switch', 'L2スイッチ', { managementIpAddress: '192.168.1.10', purpose: 'サーバー接続用' }),
    style: { borderColor: kindColors['l2-switch'] },
  },
  {
    id: 'router01',
    type: 'device',
    position: { x: 690, y: 320 },
    data: deviceData('router', 'ルーター', { managementIpAddress: '192.168.1.1', purpose: '外部接続用' }),
    style: { borderColor: kindColors.router },
  },
]

const defaultConnectionData = (): ConnectionData => ({ connectionType: 'network', sourceInterface: '', targetInterface: '', notes: '' })

const initialEdges: Edge<ConnectionData>[] = [
  { id: 'web-sw', source: 'web01', target: 'sw01', sourceHandle: 'source-bottom', targetHandle: 'target-top', type: 'editable', data: defaultConnectionData() },
  { id: 'app-sw', source: 'app01', target: 'sw01', sourceHandle: 'source-bottom', targetHandle: 'target-top', type: 'editable', data: defaultConnectionData() },
  { id: 'db-sw', source: 'db01', target: 'sw01', sourceHandle: 'source-left', targetHandle: 'target-right', type: 'editable', data: defaultConnectionData() },
  { id: 'sw-router', source: 'sw01', target: 'router01', sourceHandle: 'source-right', targetHandle: 'target-left', type: 'editable', data: defaultConnectionData() },
]

const layoutTemplates: LayoutTemplate[] = [
  { id: 'hierarchy', name: '階層型', description: 'インターネットから各サーバーへ、上から下へ流れる一般的な構成です。', preview: [{ kind: 'cloud', x: 50, y: 4 }, { kind: 'firewall', x: 50, y: 27 }, { kind: 'router', x: 50, y: 49 }, { kind: 'server', x: 18, y: 75 }, { kind: 'server', x: 50, y: 75 }, { kind: 'database', x: 82, y: 75 }] },
  { id: 'zone', name: 'ゾーン型', description: 'DMZ・アプリケーション・データベースの境界を意識した構成です。', preview: [{ kind: 'cloud', x: 8, y: 50 }, { kind: 'firewall', x: 29, y: 50 }, { kind: 'server', x: 49, y: 33 }, { kind: 'server', x: 49, y: 67 }, { kind: 'server', x: 69, y: 50 }, { kind: 'database', x: 89, y: 50 }] },
  { id: 'cloud', name: 'クラウド型', description: 'クラウド、VPC、公開・アプリ・データ層を意識した構成です。', preview: [{ kind: 'cloud', x: 50, y: 8 }, { kind: 'firewall', x: 23, y: 53 }, { kind: 'router', x: 39, y: 53 }, { kind: 'server', x: 62, y: 38 }, { kind: 'database', x: 80, y: 65 }] },
  { id: 'hub', name: 'ハブ＆スポーク型', description: '共通基盤を中心に、複数システムや拠点をつなぐ構成です。', preview: [{ kind: 'cloud', x: 50, y: 6 }, { kind: 'server', x: 50, y: 51 }, { kind: 'server', x: 15, y: 28 }, { kind: 'server', x: 15, y: 76 }, { kind: 'server', x: 85, y: 28 }, { kind: 'database', x: 85, y: 76 }] },
  { id: 'blank', name: '空白から開始', description: '部品も接続もない状態から、自由に構成図を作成します。', preview: [] },
]

function templateNode(id: string, kind: DeviceKind, displayName: string, x: number, y: number, values: Partial<Omit<DeviceData, 'middleware'>> & { middleware?: Partial<Middleware>[] } = {}): Node<DeviceData> {
  return { id, type: 'device', position: { x, y }, data: deviceData(kind, displayName, values), style: { borderColor: kindColors[kind] } }
}

function templateEdge(id: string, source: string, target: string): Edge<ConnectionData> {
  return { id, source, target, sourceHandle: 'source-right', targetHandle: 'target-left', type: 'editable', data: defaultConnectionData() }
}

function createTemplateDiagram(templateId: LayoutTemplateId) {
  const id = (name: string) => `${templateId}-${name}-${crypto.randomUUID()}`
  if (templateId === 'blank') return { nodes: [] as Node<DeviceData>[], edges: [] as Edge<ConnectionData>[] }
  if (templateId === 'hierarchy') {
    const internet = id('internet'), firewall = id('firewall'), router = id('router'), web = id('web'), app = id('app'), database = id('database')
    return {
      nodes: [templateNode(internet, 'cloud', 'インターネット', 430, 40), templateNode(firewall, 'firewall', 'ファイアウォール', 430, 160), templateNode(router, 'router', 'ルーター', 430, 280), templateNode(web, 'server', 'Webサーバー', 120, 420, { purpose: 'Web層' }), templateNode(app, 'server', 'APサーバー', 430, 420, { purpose: 'アプリケーション層' }), templateNode(database, 'database', 'データベース', 740, 420, { purpose: 'データ層' })],
      edges: [templateEdge(id('edge'), internet, firewall), templateEdge(id('edge'), firewall, router), templateEdge(id('edge'), router, web), templateEdge(id('edge'), router, app), templateEdge(id('edge'), router, database)],
    }
  }
  if (templateId === 'zone') {
    const internet = id('internet'), firewall = id('firewall'), web = id('web'), reverseProxy = id('reverse-proxy'), app = id('app'), database = id('database')
    return {
      nodes: [templateNode(internet, 'cloud', 'インターネット', 40, 270), templateNode(firewall, 'firewall', 'DMZ ファイアウォール', 240, 270), templateNode(web, 'server', 'DMZ Webサーバー', 440, 150, { purpose: 'DMZゾーン' }), templateNode(reverseProxy, 'server', 'リバースプロキシ', 440, 390, { purpose: 'DMZゾーン' }), templateNode(app, 'server', 'アプリケーションサーバー', 690, 270, { purpose: 'アプリケーションゾーン' }), templateNode(database, 'database', 'データベース', 940, 270, { purpose: 'データベースゾーン' })],
      edges: [templateEdge(id('edge'), internet, firewall), templateEdge(id('edge'), firewall, web), templateEdge(id('edge'), firewall, reverseProxy), templateEdge(id('edge'), web, app), templateEdge(id('edge'), reverseProxy, app), templateEdge(id('edge'), app, database)],
    }
  }
  if (templateId === 'cloud') {
    const cloud = id('cloud'), internet = id('internet'), firewall = id('firewall'), router = id('router'), web = id('web'), app = id('app'), database = id('database')
    return {
      nodes: [templateNode(cloud, 'cloud', 'クラウド / VPC', 490, 40, { purpose: 'クラウド基盤' }), templateNode(internet, 'cloud', 'インターネット', 50, 300), templateNode(firewall, 'firewall', 'WAF / ファイアウォール', 260, 300, { purpose: 'パブリックサブネット' }), templateNode(router, 'router', 'ルーター / GW', 470, 300, { purpose: 'VPCネットワーク' }), templateNode(web, 'server', 'Webサーバー', 680, 160, { deploymentType: 'クラウドVM', purpose: 'アプリケーションサブネット' }), templateNode(app, 'server', 'APサーバー', 680, 390, { deploymentType: 'クラウドVM', purpose: 'アプリケーションサブネット' }), templateNode(database, 'database', 'マネージドDB', 930, 275, { deploymentType: 'PaaS／SaaS', purpose: 'データベースサブネット' })],
      edges: [templateEdge(id('edge'), internet, firewall), templateEdge(id('edge'), firewall, router), templateEdge(id('edge'), cloud, router), templateEdge(id('edge'), router, web), templateEdge(id('edge'), router, app), templateEdge(id('edge'), web, database), templateEdge(id('edge'), app, database)],
    }
  }
  const internet = id('internet'), hub = id('hub'), sales = id('sales'), hr = id('hr'), core = id('core'), analytics = id('analytics'), backup = id('backup')
  return {
    nodes: [templateNode(internet, 'cloud', 'インターネット', 450, 35), templateNode(hub, 'server', '共通基盤', 450, 300, { purpose: '認証・監視・共通サービス' }), templateNode(sales, 'server', '営業システム', 100, 150), templateNode(hr, 'server', '人事システム', 100, 450), templateNode(core, 'server', '基幹システム', 800, 150), templateNode(analytics, 'database', '分析基盤', 800, 300), templateNode(backup, 'storage', 'バックアップ', 800, 450)],
    edges: [templateEdge(id('edge'), internet, hub), templateEdge(id('edge'), hub, sales), templateEdge(id('edge'), hub, hr), templateEdge(id('edge'), hub, core), templateEdge(id('edge'), hub, analytics), templateEdge(id('edge'), hub, backup)],
  }
}

function defaultLayoutSlot(template: LayoutTemplateId, node: Pick<Node<DeviceData>, 'data'>) {
  const text = `${node.data.displayName} ${node.data.purpose}`.toLowerCase()
  if (template === 'zone') {
    if (node.data.kind === 'cloud' || /インターネット/.test(text)) return 'external'
    if (node.data.kind === 'firewall') return 'boundary'
    if (node.data.kind === 'database' || /database|db|データ/.test(text)) return 'data'
    if (/dmz|リバースプロキシ|web/.test(text)) return /web/.test(text) ? 'dmz-top' : 'dmz-bottom'
    return 'application'
  }
  if (template === 'cloud') {
    if (node.data.kind === 'cloud' && !/インターネット/.test(text)) return 'cloud'
    if (node.data.kind === 'cloud' || /インターネット/.test(text)) return 'external'
    if (node.data.kind === 'firewall') return 'boundary'
    if (node.data.kind === 'router' || /waf|gateway|gw/.test(text)) return 'gateway'
    if (node.data.kind === 'database' || /database|db|データ/.test(text)) return 'data'
    return /web/.test(text) ? 'service-top' : 'service-bottom'
  }
  if (template === 'hub') {
    if (/共通|ハブ|基盤/.test(node.data.displayName)) return 'hub'
    if (node.data.kind === 'cloud' || /インターネット/.test(text)) return 'top'
    if (node.data.kind === 'database' || /分析|db|データ/.test(text)) return 'right'
    return 'spoke'
  }
  if (template === 'hierarchy') {
    if (node.data.kind === 'cloud') return 'entry'
    if (node.data.kind === 'firewall') return 'boundary'
    if (node.data.kind === 'router' || node.data.kind === 'network' || node.data.kind === 'l2-switch') return 'network'
    if (node.data.kind === 'database' || node.data.kind === 'storage') return 'data'
    return 'service'
  }
  return ''
}

function layoutSlotOptions(template: LayoutTemplateId) {
  const labels: Record<LayoutTemplateId, Array<[string, string]>> = {
    blank: [['', '自由配置']],
    hierarchy: [['entry', '入口'], ['boundary', '境界'], ['network', 'ネットワーク'], ['service', 'サービス'], ['data', 'データ']],
    zone: [['external', '外部'], ['boundary', '境界'], ['dmz-top', 'DMZ 上段'], ['dmz-bottom', 'DMZ 下段'], ['application', 'アプリケーション'], ['data', 'データベース']],
    cloud: [['cloud', 'クラウド基盤'], ['external', '外部'], ['boundary', '境界'], ['gateway', 'ゲートウェイ'], ['service-top', 'アプリ上段'], ['service-bottom', 'アプリ下段'], ['data', 'データ']],
    hub: [['hub', '中心基盤'], ['top', '上部スポーク'], ['right', '右側スポーク'], ['spoke', 'その他スポーク']],
  }
  return labels[template]
}

function arrangeNodesForTemplate(template: LayoutTemplateId, nodes: Node<DeviceData>[], edges: Edge<ConnectionData>[]) {
  if (template === 'hub') {
    const degrees = new Map(nodes.map((node) => [node.id, edges.filter((edge) => edge.source === node.id || edge.target === node.id).length]))
    const hub = nodes.find((node) => /共通|ハブ|基盤/.test(node.data.displayName)) ?? [...nodes].sort((a, b) => (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0))[0]
    if (!hub) return nodes
    const resolvedSlot = (node: Node<DeviceData>) => node.id === hub.id ? 'hub' : (node.data.layoutSlot || defaultLayoutSlot('hub', node)) === 'hub' ? 'spoke' : node.data.layoutSlot || defaultLayoutSlot('hub', node)
    const remaining = nodes.filter((node) => resolvedSlot(node) === 'spoke').sort((a, b) => a.data.displayName.localeCompare(b.data.displayName, 'ja'))
    const topNodes = nodes.filter((node) => resolvedSlot(node) === 'top').sort((a, b) => a.data.displayName.localeCompare(b.data.displayName, 'ja'))
    const rightNodes = nodes.filter((node) => resolvedSlot(node) === 'right').sort((a, b) => a.data.displayName.localeCompare(b.data.displayName, 'ja'))
    return nodes.map((node) => {
      const slot = resolvedSlot(node)
      const data = { ...node.data, layoutSlot: slot }
      if (slot === 'hub') return { ...node, data, position: { x: 470, y: 300 } }
      if (slot === 'right') { const index = rightNodes.findIndex((item) => item.id === node.id); return { ...node, data, position: { x: 850, y: 300 + (index - (rightNodes.length - 1) / 2) * 150 } } }
      if (slot === 'top') { const index = topNodes.findIndex((item) => item.id === node.id); return { ...node, data, position: { x: 470 + (index - (topNodes.length - 1) / 2) * 220, y: 50 } } }
      const index = remaining.findIndex((item) => item.id === node.id)
      const slots = [{ x: 70, y: 70 }, { x: 70, y: 250 }, { x: 70, y: 430 }, { x: 70, y: 610 }, { x: 470, y: 650 }, { x: 870, y: 70 }, { x: 870, y: 430 }, { x: 870, y: 610 }]
      if (index < slots.length) return { ...node, data, position: slots[index] }
      const ring = Math.floor((index - slots.length) / 8) + 1
      const ringIndex = (index - slots.length) % 8
      const angle = (Math.PI * 2 * ringIndex) / 8 + Math.PI / 8
      return { ...node, data, position: { x: Math.round(470 + Math.cos(angle) * (440 + ring * 180)), y: Math.round(300 + Math.sin(angle) * (300 + ring * 140)) } }
    })
  }

  if (template === 'zone') {
    const resolved = nodes.map((node) => ({ node, slot: node.data.layoutSlot || defaultLayoutSlot('zone', node) }))
    const groups = new Map<string, Node<DeviceData>[]>()
    resolved.forEach(({ node, slot }) => groups.set(slot, [...(groups.get(slot) ?? []), node]))
    return nodes.map((node) => {
      const slot = node.data.layoutSlot || defaultLayoutSlot('zone', node)
      const data = { ...node.data, layoutSlot: slot }
      const positions: Record<string, { x: number; y: number }> = { external: { x: 50, y: 300 }, boundary: { x: 280, y: 300 }, 'dmz-top': { x: 390, y: 145 }, 'dmz-bottom': { x: 390, y: 455 }, application: { x: 590, y: 300 }, data: { x: 860, y: 300 } }
      const base = positions[slot] ?? positions.application
      const siblings = (groups.get(slot) ?? []).sort((a, b) => a.data.displayName.localeCompare(b.data.displayName, 'ja'))
      const index = siblings.findIndex((item) => item.id === node.id)
      const y = base.y + (siblings.length === 1 ? 0 : (index - (siblings.length - 1) / 2) * 150)
      return { ...node, data, position: { x: base.x, y } }
    })
  }

  if (template === 'cloud') {
    const resolved = nodes.map((node) => ({ node, slot: node.data.layoutSlot || defaultLayoutSlot('cloud', node) }))
    const groups = new Map<string, Node<DeviceData>[]>()
    resolved.forEach(({ node, slot }) => groups.set(slot, [...(groups.get(slot) ?? []), node]))
    return nodes.map((node) => {
      const slot = node.data.layoutSlot || defaultLayoutSlot('cloud', node)
      const data = { ...node.data, layoutSlot: slot }
      const positions: Record<string, { x: number; y: number }> = { cloud: { x: 470, y: 40 }, external: { x: 50, y: 300 }, boundary: { x: 260, y: 300 }, gateway: { x: 470, y: 300 }, 'service-top': { x: 690, y: 145 }, 'service-bottom': { x: 690, y: 455 }, data: { x: 940, y: 300 } }
      const base = positions[slot] ?? positions['service-bottom']
      const siblings = (groups.get(slot) ?? []).sort((a, b) => a.data.displayName.localeCompare(b.data.displayName, 'ja'))
      const index = siblings.findIndex((item) => item.id === node.id)
      const y = base.y + (siblings.length === 1 ? 0 : (index - (siblings.length - 1) / 2) * 150)
      return { ...node, data, position: { x: base.x, y } }
    })
  }

  if (template === 'hierarchy') {
    const columns: Record<string, number> = { entry: 70, boundary: 300, network: 530, service: 760, data: 990 }
    const groups = new Map<string, Node<DeviceData>[]>()
    nodes.forEach((node) => {
      const slot = node.data.layoutSlot || defaultLayoutSlot('hierarchy', node)
      groups.set(slot, [...(groups.get(slot) ?? []), node])
    })
    return nodes.map((node) => {
      const slot = node.data.layoutSlot || defaultLayoutSlot('hierarchy', node)
      const siblings = (groups.get(slot) ?? []).sort((a, b) => a.data.displayName.localeCompare(b.data.displayName, 'ja'))
      const index = siblings.findIndex((item) => item.id === node.id)
      const y = siblings.length === 1 ? 300 : 175 + index * Math.max(150, 300 / Math.max(siblings.length - 1, 1))
      return { ...node, data: { ...node.data, layoutSlot: slot }, position: { x: columns[slot] ?? columns.service, y } }
    })
  }

  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  const depth = new Map(nodes.map((node) => [node.id, 0]))
  edges.forEach((edge) => indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1))
  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id)
  const visited = new Set<string>()
  while (queue.length) {
    const sourceId = queue.shift()!
    if (visited.has(sourceId)) continue
    visited.add(sourceId)
    edges.filter((edge) => edge.source === sourceId).forEach((edge) => {
      depth.set(edge.target, Math.max(depth.get(edge.target) ?? 0, (depth.get(sourceId) ?? 0) + 1))
      indegree.set(edge.target, (indegree.get(edge.target) ?? 1) - 1)
      if ((indegree.get(edge.target) ?? 0) <= 0) queue.push(edge.target)
    })
  }
  const lastDepth = Math.max(...depth.values(), 0)
  nodes.filter((node) => !visited.has(node.id)).forEach((node, index) => depth.set(node.id, lastDepth + index + 1))
  const layers = new Map<number, Node<DeviceData>[]>()
  nodes.forEach((node) => { const layer = depth.get(node.id) ?? 0; layers.set(layer, [...(layers.get(layer) ?? []), node]) })
  return nodes.map((node) => {
    const layer = depth.get(node.id) ?? 0
    const siblings = [...(layers.get(layer) ?? [])].sort((a, b) => a.position.y - b.position.y || a.data.displayName.localeCompare(b.data.displayName, 'ja'))
    return { ...node, position: { x: 100 + layer * 300, y: 110 + siblings.findIndex((item) => item.id === node.id) * 150 } }
  })
}

function DeviceNode({ data }: NodeProps) {
  const device = data as DeviceData
  const color = device.color ?? kindColors[device.kind]
  return <div className="device-node" style={{ borderColor: color }}>
    <Handle id="target-top" className="connection-handle target-handle" type="target" position={Position.Top} style={{ left: '50%' }} aria-label="上側の接続先" />
    <Handle id="source-top" className="connection-handle source-handle" type="source" position={Position.Top} style={{ left: '50%' }} aria-label="上側の接続元" />
    <Handle id="target-left" className="connection-handle target-handle" type="target" position={Position.Left} style={{ top: '50%' }} aria-label="左側の接続先" />
    <Handle id="source-left" className="connection-handle source-handle" type="source" position={Position.Left} style={{ top: '50%' }} aria-label="左側の接続元" />
    <FontAwesomeIcon className="node-icon" icon={iconFor(device)} style={{ color }} />
    <div><small title={kindLabels[device.kind]}>{kindLabels[device.kind]}</small><strong title={device.displayName}>{device.displayName}</strong></div>
    <Handle id="target-right" className="connection-handle target-handle" type="target" position={Position.Right} style={{ top: '50%' }} aria-label="右側の接続先" />
    <Handle id="source-right" className="connection-handle source-handle" type="source" position={Position.Right} style={{ top: '50%' }} aria-label="右側の接続元" />
    <Handle id="target-bottom" className="connection-handle target-handle" type="target" position={Position.Bottom} style={{ left: '50%' }} aria-label="下側の接続先" />
    <Handle id="source-bottom" className="connection-handle source-handle" type="source" position={Position.Bottom} style={{ left: '50%' }} aria-label="下側の接続元" />
  </div>
}

const nodeTypes = { device: DeviceNode }

const EdgeRouteContext = createContext<{
  updateManualRoute: (edgeId: string, axis: 'x' | 'y', value: number, initialRoute: { x: number; y: number }) => void
  updateEndpointAtPoint: (edgeId: string, endpoint: 'source' | 'target', clientX: number, clientY: number) => void
} | null>(null)

function EditableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, style }: EdgeProps<Edge<ConnectionData>>) {
  const routeContext = useContext(EdgeRouteContext)
  const sameX = Math.abs(sourceX - targetX) < 8
  const sameY = Math.abs(sourceY - targetY) < 8
  const routeOffset = data?.routeOffset ?? 0
  const horizontalFirst = sourcePosition === Position.Left || sourcePosition === Position.Right || (sourcePosition === Position.Top || sourcePosition === Position.Bottom ? false : Math.abs(sourceX - targetX) >= Math.abs(sourceY - targetY))
  const sourceIsHorizontal = sourcePosition === Position.Left || sourcePosition === Position.Right
  const routeAnchor = data?.routeAnchorMode
  const horizontalAnchor = routeAnchor === 'target' ? targetX + (targetPosition === Position.Left ? -52 : 52) : routeAnchor === 'source' ? sourceX + (sourcePosition === Position.Left ? -52 : 52) : (sourceX + targetX) / 2 + routeOffset
  const verticalAnchor = routeAnchor === 'target' ? targetY + (targetPosition === Position.Top ? -52 : 52) : routeAnchor === 'source' ? sourceY + (sourcePosition === Position.Top ? -52 : 52) : (sourceY + targetY) / 2 + routeOffset
  const manualRoute = data?.manualRoute
  // 手動調整を始める際も、まず現在の自動経路と同じ形を引き継ぐ。
  // これにより最初のドラッグで線全体が中央へ跳ねることを防ぐ。
  const automaticRoute = sameX
    ? { x: sourceX, y: targetY }
    : sameY
      ? { x: targetX, y: sourceY }
      : horizontalFirst
        ? { x: horizontalAnchor, y: targetY }
        : { x: targetX, y: verticalAnchor }
  const route = manualRoute ?? automaticRoute
  // 同一のX軸またはY軸に並ぶ部品同士は、過去の手動経路が残っていても常に直線とする。
  const edgePath = sameX || sameY
    ? `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
    : manualRoute
      // 左右の中央支点からは横へ、上下の中央支点からは縦へ、必ず直線で出す。
      // 手動で折れ位置を動かしても、支点の直後に逆方向の短い線を作らない。
      ? sourceIsHorizontal
        ? `M ${sourceX} ${sourceY} L ${route.x} ${sourceY} L ${route.x} ${route.y} L ${targetX} ${route.y} L ${targetX} ${targetY}`
        : `M ${sourceX} ${sourceY} L ${sourceX} ${route.y} L ${route.x} ${route.y} L ${route.x} ${targetY} L ${targetX} ${targetY}`
    : horizontalFirst
      ? `M ${sourceX} ${sourceY} L ${horizontalAnchor} ${sourceY} L ${horizontalAnchor} ${targetY} L ${targetX} ${targetY}`
      : `M ${sourceX} ${sourceY} L ${sourceX} ${verticalAnchor} L ${targetX} ${verticalAnchor} L ${targetX} ${targetY}`
  const startRouteDrag = (axis: 'x' | 'y', event: ReactPointerEvent<SVGPathElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const initialValue = route[axis]
    const start = axis === 'x' ? event.clientX : event.clientY
    const zoom = event.currentTarget.getScreenCTM()?.a ?? 1
    const onMove = (moveEvent: PointerEvent) => routeContext?.updateManualRoute(id, axis, initialValue + (axis === 'x' ? moveEvent.clientX - start : moveEvent.clientY - start) / zoom, route)
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const startEndpointDrag = (endpoint: 'source' | 'target', event: ReactPointerEvent<SVGCircleElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const onUp = (upEvent: PointerEvent) => {
      routeContext?.updateEndpointAtPoint(id, endpoint, upEvent.clientX, upEvent.clientY)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointerup', onUp)
  }
  return <><BaseEdge id={id} path={edgePath} style={style} interactionWidth={20} />
    {selected && routeContext && <>
      <path className="edge-route-drag-surface edge-route-drag-y" d={sourceIsHorizontal ? `M ${route.x} ${route.y} L ${targetX} ${route.y}` : `M ${sourceX} ${route.y} L ${route.x} ${route.y}`} onPointerDown={(event) => startRouteDrag('y', event)}><title>上下へドラッグして横線を移動</title></path>
      <path className="edge-route-drag-surface edge-route-drag-x" d={sourceIsHorizontal ? `M ${route.x} ${sourceY} L ${route.x} ${route.y}` : `M ${route.x} ${route.y} L ${route.x} ${targetY}`} onPointerDown={(event) => startRouteDrag('x', event)}><title>左右へドラッグして縦線を移動</title></path>
      <circle className="edge-endpoint-marker edge-endpoint-source" cx={sourceX} cy={sourceY} r={7} onPointerDown={(event) => startEndpointDrag('source', event)}><title>始点を部品の中央支点へドラッグして接続先を変更</title></circle>
      <circle className="edge-endpoint-marker edge-endpoint-target" cx={targetX} cy={targetY} r={7} onPointerDown={(event) => startEndpointDrag('target', event)}><title>終点を部品の中央支点へドラッグして接続先を変更</title></circle>
    </>}
  </>
}

const edgeTypes = { editable: EditableEdge }

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function csvValue(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

async function svgToPng(svg: string, width: number, height: number) {
  const imageUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('構成図イメージを生成できませんでした。'))
      element.src = imageUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('画像用キャンバスを作成できませんでした。')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function levelOneDiagramSvg(nodes: Node<DeviceData>[], edges: Edge<ConnectionData>[]) {
  const nodeWidth = 160
  const nodeHeight = 68
  const minX = Math.min(...nodes.map((node) => node.position.x), 0)
  const minY = Math.min(...nodes.map((node) => node.position.y), 0)
  const maxX = Math.max(...nodes.map((node) => node.position.x + nodeWidth), 760)
  const maxY = Math.max(...nodes.map((node) => node.position.y + nodeHeight), 420)
  const width = Math.min(1100, Math.max(820, maxX - minX + 120))
  const height = Math.min(720, Math.max(460, maxY - minY + 140))
  const position = (node: Node<DeviceData>) => ({ x: node.position.x - minX + 60, y: node.position.y - minY + 60 })
  const edgeMarkup = edges.map((edge) => {
    const source = nodes.find((node) => node.id === edge.source)
    const target = nodes.find((node) => node.id === edge.target)
    if (!source || !target) return ''
    const from = position(source)
    const to = position(target)
    return `<path d="M ${from.x + nodeWidth / 2} ${from.y + nodeHeight / 2} L ${to.x + nodeWidth / 2} ${to.y + nodeHeight / 2}" fill="none" stroke="#94a3b8" stroke-width="2.5"/>`
  }).join('')
  const nodeMarkup = nodes.map((node) => {
    const { x, y } = position(node)
    const color = node.data.color || kindColors[node.data.kind]
    return `<g><rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="10" fill="#ffffff" stroke="${color}" stroke-width="3"/><text x="${x + 16}" y="${y + 27}" fill="#64748b" font-family="Arial, sans-serif" font-size="12" font-weight="700">${escapeXml(kindLabels[node.data.kind])}</text><text x="${x + 16}" y="${y + 49}" fill="#1e293b" font-family="Arial, sans-serif" font-size="16" font-weight="700">${escapeXml(node.data.displayName)}</text></g>`
  }).join('')
  return { width, height, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f8fbff"/><text x="28" y="32" fill="#1e3a5f" font-family="Arial, sans-serif" font-size="18" font-weight="700">レベル1 全体構成図</text>${edgeMarkup}${nodeMarkup}</svg>` }
}

function levelTwoDiagramSvg(server: Node<DeviceData>) {
  const { data } = server
  const profile = deploymentProfile(data.deploymentType)
  const width = 860
  const serviceRows = Math.max(1, Math.ceil(data.middleware.length / 3))
  const middlewareY = 312
  const lowerY = middlewareY + serviceRows * 84 + 54
  const height = lowerY + 114
  const services = data.middleware.length ? data.middleware.map((item, index) => {
    const x = 55 + (index % 3) * 250
    const y = middlewareY + 36 + Math.floor(index / 3) * 84
    return `<g><rect x="${x}" y="${y}" width="215" height="58" rx="7" fill="#ffffff" stroke="#9a7ad4" stroke-width="2"/><text x="${x + 12}" y="${y + 25}" fill="#4c317f" font-family="Arial, sans-serif" font-size="14" font-weight="700">${escapeXml(item.name || '名称未設定')}</text><text x="${x + 12}" y="${y + 45}" fill="#6b7280" font-family="Arial, sans-serif" font-size="11">${escapeXml(item.runtime || item.port || 'ランタイム未設定')}</text></g>`
  }).join('') : `<text x="55" y="${middlewareY + 70}" fill="#6b7280" font-family="Arial, sans-serif" font-size="14">ミドルウェア未登録</text>`
  const title = escapeXml(data.displayName)
  return { width, height, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f8fbff"/><rect x="20" y="18" width="820" height="${height - 36}" rx="12" fill="#ffffff" stroke="#86a9d7" stroke-width="3"/><rect x="40" y="38" width="780" height="42" rx="7" fill="#e2eefc" stroke="#7d9fc8"/><text x="56" y="64" fill="#214f83" font-family="Arial, sans-serif" font-size="17" font-weight="700">サーバー / VM　${title}</text><rect x="40" y="98" width="780" height="88" rx="8" fill="#f5fcfc" stroke="#8ac4c8"/><text x="56" y="124" fill="#245d63" font-family="Arial, sans-serif" font-size="15" font-weight="700">配置・実行基盤: ${escapeXml(data.deploymentType || '未設定')}</text><text x="56" y="151" fill="#334155" font-family="Arial, sans-serif" font-size="13">${escapeXml(profile.provider)}: ${escapeXml(data.platformProvider || '未設定')}　/　${escapeXml(profile.location)}: ${escapeXml(data.platformLocation || '未設定')}</text><text x="56" y="174" fill="#334155" font-family="Arial, sans-serif" font-size="13">${escapeXml(profile.resource)}: ${escapeXml(data.platformResource || '未設定')}　/　${escapeXml(profile.detail)}: ${escapeXml(data.platformDetail || '未設定')}</text><rect x="40" y="202" width="370" height="92" rx="8" fill="#f8fbff" stroke="#b8cde5"/><text x="56" y="228" fill="#274766" font-family="Arial, sans-serif" font-size="15" font-weight="700">HW・リソース</text><text x="56" y="258" fill="#334155" font-family="Arial, sans-serif" font-size="13">CPU: ${escapeXml(data.cpu || '未設定')}</text><text x="56" y="281" fill="#334155" font-family="Arial, sans-serif" font-size="13">メモリ: ${escapeXml(data.memory || '未設定')}</text><rect x="430" y="202" width="390" height="92" rx="8" fill="#f7fcf8" stroke="#a8d0b6"/><text x="446" y="228" fill="#274766" font-family="Arial, sans-serif" font-size="15" font-weight="700">OS</text><text x="446" y="258" fill="#334155" font-family="Arial, sans-serif" font-size="13">${escapeXml(`${data.osName} ${data.osVersion}`.trim() || '未設定')}</text><text x="446" y="281" fill="#334155" font-family="Arial, sans-serif" font-size="13">${escapeXml(data.hostname || 'ホスト名未設定')} / ${escapeXml(data.ipAddress || 'IP未設定')}</text><rect x="40" y="${middlewareY}" width="780" height="${serviceRows * 84 + 36}" rx="8" fill="#fbf9ff" stroke="#d5c5ef"/><text x="56" y="${middlewareY + 26}" fill="#4c317f" font-family="Arial, sans-serif" font-size="15" font-weight="700">MW・アプリケーション</text>${services}<rect x="40" y="${lowerY}" width="370" height="78" rx="8" fill="#f7fcff" stroke="#b6d6e9"/><text x="56" y="${lowerY + 27}" fill="#274766" font-family="Arial, sans-serif" font-size="15" font-weight="700">ネットワーク</text><text x="56" y="${lowerY + 52}" fill="#334155" font-family="Arial, sans-serif" font-size="13">eth0 / 管理IP: ${escapeXml(data.managementIpAddress || '未設定')}</text><rect x="430" y="${lowerY}" width="390" height="78" rx="8" fill="#fffdf7" stroke="#e4d09e"/><text x="446" y="${lowerY + 27}" fill="#274766" font-family="Arial, sans-serif" font-size="15" font-weight="700">ストレージ・データ</text><text x="446" y="${lowerY + 52}" fill="#334155" font-family="Arial, sans-serif" font-size="13">ディスク: ${escapeXml(data.disk || '未設定')}</text></svg>` }
}

function normalizeNodes(nodes: Node<DeviceData>[]) {
  return nodes.map((node) => {
    const data = node.data
    const kind = data.kind in kindLabels ? data.kind : 'custom'
    const normalized = deviceData(kind, data.displayName ?? data.label ?? kindLabels[kind], data)
    return { ...node, type: 'device', data: normalized, style: { ...node.style, borderColor: normalized.color } }
  })
}

function normalizeEdges(edges: Edge<ConnectionData>[]) {
  return edges.map((edge) => ({ ...edge, type: 'editable', data: { ...defaultConnectionData(), ...edge.data } }))
}

function readBrowserProjects(): StoredProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(browserStorageKey) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is StoredProject => item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.nodes) && Array.isArray(item.edges)) : []
  } catch {
    return []
  }
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<DeviceData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<ConnectionData>>(initialEdges)
  const [selection, setSelection] = useState<Selection>(null)
  const [view, setView] = useState<View>({ level: 1 })
  const [showLayoutEditor, setShowLayoutEditor] = useState(false)
  const [templatePickerMode, setTemplatePickerMode] = useState<'new' | 'change' | null>(null)
  const [isConnectionMode, setIsConnectionMode] = useState(false)
  const [showDesignNotes, setShowDesignNotes] = useState(false)
  const [connectionNodeIds, setConnectionNodeIds] = useState<string[]>([])
  const [projectId, setProjectId] = useState<string>(() => crypto.randomUUID())
  const [projectName, setProjectName] = useState('新しいシステム')
  const [systemPolicy, setSystemPolicy] = useState<SystemPolicy>(() => emptySystemPolicy())
  const [layoutTemplate, setLayoutTemplate] = useState<LayoutTemplateId>('hierarchy')
  const [historyRevision, setHistoryRevision] = useState(0)
  const [savedProjects, setSavedProjects] = useState<StoredProject[]>(readBrowserProjects)
  const [showProjectLibrary, setShowProjectLibrary] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [openMenu, setOpenMenu] = useState<'file' | 'edit' | 'view' | 'layout' | null>(null)
  const [panelWidths, setPanelWidths] = useState({ palette: 200, properties: 272 })
  const [workspaceHeight, setWorkspaceHeight] = useState(544)
  const fileInput = useRef<HTMLInputElement>(null)
  const menuBarRef = useRef<HTMLElement>(null)
  const flowInstanceRef = useRef<{ screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number }; fitView: (options?: { padding?: number; duration?: number }) => void } | null>(null)
  const historyRef = useRef<HistoryState | null>(null)
  const snapshot = (): HistorySnapshot => ({ projectId, projectName, systemPolicy: structuredClone(systemPolicy), layoutTemplate, nodes: historyNodes(nodes), edges: historyEdges(edges) })
  if (!historyRef.current) historyRef.current = { undo: [], redo: [], current: snapshot() }

  useEffect(() => {
    if (!openMenu) return
    const closeMenuOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Element && !menuBarRef.current?.contains(event.target)) setOpenMenu(null)
    }
    window.addEventListener('pointerdown', closeMenuOnOutsideClick)
    return () => window.removeEventListener('pointerdown', closeMenuOnOutsideClick)
  }, [openMenu])

  useEffect(() => {
    if (!saveMessage) return
    const timer = window.setTimeout(() => setSaveMessage(''), 4000)
    return () => window.clearTimeout(timer)
  }, [saveMessage])

  useEffect(() => {
    if (!showProjectLibrary) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowProjectLibrary(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showProjectLibrary])

  useEffect(() => {
    const history = historyRef.current
    if (!history) return
    const next = snapshot()
    if (JSON.stringify(history.current) === JSON.stringify(next)) return
    history.undo = [...history.undo.slice(-99), history.current]
    history.current = next
    history.redo = []
    setHistoryRevision((current) => current + 1)
  }, [nodes, edges, projectId, projectName, systemPolicy, layoutTemplate])

  const applyHistorySnapshot = (snapshotToApply: HistorySnapshot) => {
    setProjectId(snapshotToApply.projectId)
    setProjectName(snapshotToApply.projectName)
    setSystemPolicy(structuredClone(snapshotToApply.systemPolicy))
    setLayoutTemplate(snapshotToApply.layoutTemplate)
    setNodes(structuredClone(snapshotToApply.nodes))
    setEdges(structuredClone(snapshotToApply.edges))
    setSelection(null)
    setConnectionSelection([])
  }

  const undo = () => {
    const history = historyRef.current
    if (!history || !history.undo.length) return
    const previous = history.undo.pop()!
    history.redo = [history.current, ...history.redo].slice(0, 100)
    history.current = previous
    applyHistorySnapshot(previous)
    setHistoryRevision((current) => current + 1)
    setSaveMessage('直前の操作を元に戻しました。')
  }

  const redo = () => {
    const history = historyRef.current
    if (!history || !history.redo.length) return
    const next = history.redo.shift()!
    history.undo = [...history.undo, history.current].slice(-100)
    history.current = next
    applyHistorySnapshot(next)
    setHistoryRevision((current) => current + 1)
    setSaveMessage('操作をやり直しました。')
  }

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const isEditingText = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'))
      if (isEditingText) return
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (event.ctrlKey && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      } else if (command && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveInBrowser()
      } else if ((event.key === 'Backspace' || event.key === 'Delete') && selection) {
        event.preventDefault()
        deleteSelected()
      } else if (event.key === 'Escape') {
        setSelection(null)
        setConnectionSelection([])
        setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
      }
    }
    window.addEventListener('keydown', handleKeyboardShortcut)
    return () => window.removeEventListener('keydown', handleKeyboardShortcut)
  }, [historyRevision, selection])

  const startPanelResize = (panel: 'palette' | 'properties', event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const initialWidth = panelWidths[panel]
    const direction = panel === 'palette' ? 1 : -1
    const onMove = (moveEvent: PointerEvent) => {
      const width = Math.min(440, Math.max(180, initialWidth + ((moveEvent.clientX - startX) * direction)))
      setPanelWidths((current) => ({ ...current, [panel]: width }))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startWorkspaceHeightResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const initialHeight = workspaceHeight
    const onMove = (moveEvent: PointerEvent) => setWorkspaceHeight(Math.min(980, Math.max(420, initialHeight + moveEvent.clientY - startY)))
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const workspaceStyle = {
    '--palette-width': `${panelWidths.palette}px`,
    '--properties-width': `${panelWidths.properties}px`,
    '--workspace-height': `${workspaceHeight}px`,
  } as CSSProperties

  const snapNodePosition = (nodeId: string, position: { x: number; y: number }, disableSmartSnap = false) => {
    const grid = 20
    let x = Math.round(position.x / grid) * grid
    let y = Math.round(position.y / grid) * grid
    if (disableSmartSnap) return { x, y }
    const nodeWidth = 192
    const nodeHeight = 74
    const threshold = 12
    const centerX = x + nodeWidth / 2
    const centerY = y + nodeHeight / 2
    const candidates = nodes.filter((node) => node.id !== nodeId)
    const closeX = candidates.map((node) => node.position.x + nodeWidth / 2).find((candidate) => Math.abs(candidate - centerX) <= threshold)
    const closeY = candidates.map((node) => node.position.y + nodeHeight / 2).find((candidate) => Math.abs(candidate - centerY) <= threshold)
    if (closeX !== undefined) x = closeX - nodeWidth / 2
    if (closeY !== undefined) y = closeY - nodeHeight / 2
    return { x, y }
  }

  const runMenuAction = (action: () => void) => () => {
    action()
    setOpenMenu(null)
  }

  const selectedNode = selection?.type === 'node' ? nodes.find((node) => node.id === selection.id) : undefined
  const selectedEdge = selection?.type === 'edge' ? edges.find((edge) => edge.id === selection.id) : undefined
  const focusedNodeId = selectedNode?.id
  const focusedEdgeIds = useMemo(() => new Set(focusedNodeId ? edges.filter((edge) => edge.source === focusedNodeId || edge.target === focusedNodeId).map((edge) => edge.id) : []), [focusedNodeId, edges])
  const focusedNeighborIds = useMemo(() => new Set(focusedNodeId ? edges.flatMap((edge) => edge.source === focusedNodeId ? [edge.target] : edge.target === focusedNodeId ? [edge.source] : []) : []), [focusedNodeId, edges])
  const flowNodes = useMemo(() => nodes.map((node) => {
    const focusClass = focusedNodeId ? node.id === focusedNodeId ? 'focus-selected' : focusedNeighborIds.has(node.id) ? 'focus-neighbor' : 'focus-muted' : ''
    return { ...node, className: [node.className, focusClass].filter(Boolean).join(' '), style: { ...node.style, opacity: focusedNodeId && node.id !== focusedNodeId && !focusedNeighborIds.has(node.id) ? .28 : 1 } }
  }), [nodes, focusedNodeId, focusedNeighborIds])
  const flowEdges = useMemo(() => edges.map((edge) => {
    const isFocused = focusedEdgeIds.has(edge.id)
    return { ...edge, className: [edge.className, focusedNodeId ? isFocused ? 'focus-connected-edge' : 'focus-muted-edge' : ''].filter(Boolean).join(' '), style: focusedNodeId ? { ...edge.style, stroke: isFocused ? '#2563eb' : '#94a3b8', strokeWidth: isFocused ? 3 : 1, opacity: isFocused ? 1 : .18 } : edge.style }
  }), [edges, focusedNodeId, focusedEdgeIds])
  const viewServerId = view.level === 1 ? undefined : view.serverId
  const viewServer = viewServerId ? nodes.find((node) => node.id === viewServerId) : undefined

  const validations = useMemo<Validation[]>(() => {
    const results: Validation[] = []
    const addresses = new Map<string, Node<DeviceData>[]>()

    nodes.forEach((node) => {
      const { data } = node
      if (data.kind === 'server') {
        if (!data.hostname.trim()) results.push({ severity: 'warning', message: `${data.displayName}にホスト名が入力されていません。`, nodeIds: [node.id] })
        if (!data.ipAddress.trim()) results.push({ severity: 'warning', message: `${data.displayName}にIPアドレスが入力されていません。`, nodeIds: [node.id] })
      }
      const address = data.kind === 'server' ? data.ipAddress.trim() : data.managementIpAddress.trim()
      if (address) addresses.set(address, [...(addresses.get(address) ?? []), node])
      if (!edges.some((edge) => edge.source === node.id || edge.target === node.id)) {
        results.push({ severity: 'info', message: `${data.displayName}には接続情報が登録されていません。`, nodeIds: [node.id] })
      }
    })

    addresses.forEach((addressNodes, address) => {
      if (addressNodes.length > 1) {
        results.push({ severity: 'warning', message: `IPアドレス ${address} が${addressNodes.map((node) => node.data.displayName).join('、')}で重複しています。`, nodeIds: addressNodes.map((node) => node.id) })
      }
    })
    return results
  }, [nodes, edges])

  const addDevice = (kind: DeviceKind, position?: { x: number; y: number }) => {
    const id = crypto.randomUUID()
    const name = kindLabels[kind]
    const count = nodes.filter((node) => node.data.kind === kind).length + 1
    const displayName = `${name}${count}`
    setNodes((current) => {
      const next = [
        ...current,
        {
        id,
        type: 'device',
        position: position ?? { x: 220 + ((current.length * 45) % 360), y: 470 + ((current.length * 35) % 120) },
        data: deviceData(kind, displayName, { layoutSlot: layoutTemplate === 'blank' ? '' : defaultLayoutSlot(layoutTemplate, { data: deviceData(kind, displayName) }) }),
        style: { borderColor: kindColors[kind] },
        },
      ] as Node<DeviceData>[]
      return layoutTemplate === 'blank' ? next : arrangeNodesForTemplate(layoutTemplate, next, edges)
    })
    setSelection({ type: 'node', id })
  }

  const updateServer = (serverId: string, field: EditableField, value: string) => {
    if (field === 'layoutSlot') {
      const updated = nodes.map((node) => node.id === serverId ? { ...node, data: { ...node.data, layoutSlot: value } } : node)
      const positioned = arrangeNodesForTemplate(layoutTemplate, updated, edges)
      setNodes(positioned)
      optimizeConnections(positioned, true)
      window.requestAnimationFrame(() => flowInstanceRef.current?.fitView({ padding: .2, duration: 180 }))
      setSaveMessage('テンプレート上の配置先を変更して再整列しました。')
      return
    }
    setNodes((current) => current.map((node) => {
      if (node.id !== serverId) return node
      const data = { ...node.data, [field]: value }
      if (field === 'displayName') data.label = value
      return { ...node, data }
    }))
  }

  const updateNode = (field: EditableField, value: string) => {
    if (selectedNode) updateServer(selectedNode.id, field, value)
  }

  const updateSelectedAppearance = (field: 'displayName' | 'iconKey' | 'color', value: string) => {
    if (!selectedNode) return
    setNodes((current) => current.map((node) => {
      if (node.id !== selectedNode.id) return node
      const data = { ...node.data, [field]: value }
      if (field === 'displayName') data.label = value
      return { ...node, data, style: { ...node.style, borderColor: field === 'color' ? value : data.color } }
    }))
  }

  const resetSelectedAppearance = () => {
    if (!selectedNode) return
    const iconKey = defaultIcon[selectedNode.data.kind]
    const color = kindColors[selectedNode.data.kind]
    updateSelectedAppearance('iconKey', iconKey)
    updateSelectedAppearance('color', color)
  }

  const startDeviceDrag = (event: React.DragEvent<HTMLButtonElement>, kind: DeviceKind) => {
    event.dataTransfer.setData('application/server-design-device', kind)
    event.dataTransfer.effectAllowed = 'move'
  }

  const allowDeviceDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const dropDevice = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const kind = event.dataTransfer.getData('application/server-design-device') as DeviceKind
    if (!(kind in kindLabels) || kind === 'custom' || !flowInstanceRef.current) return
    addDevice(kind, flowInstanceRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const updateMiddleware = (serverId: string, middlewareId: string, field: MiddlewareField, value: string) => {
    setNodes((current) => current.map((node) => node.id === serverId ? {
      ...node,
      data: { ...node.data, middleware: node.data.middleware.map((item) => item.id === middlewareId ? { ...item, [field]: value } : item) },
    } : node))
  }

  const addMiddleware = (serverId: string) => {
    setNodes((current) => current.map((node) => node.id === serverId ? {
      ...node,
      data: { ...node.data, middleware: [...node.data.middleware, middlewareData()] },
    } : node))
  }

  const deleteMiddleware = (serverId: string, middlewareId: string) => {
    setNodes((current) => current.map((node) => node.id === serverId ? {
      ...node,
      data: { ...node.data, middleware: node.data.middleware.filter((item) => item.id !== middlewareId) },
    } : node))
  }

  const deleteSelected = () => {
    if (!selection) return
    if (selection.type === 'node') {
      setNodes((current) => current.filter((node) => node.id !== selection.id))
      setEdges((current) => current.filter((edge) => edge.source !== selection.id && edge.target !== selection.id))
    } else {
      setEdges((current) => current.filter((edge) => edge.id !== selection.id))
    }
    setSelection(null)
  }

  const updateConnection = (edgeId: string, field: ConnectionField, value: string) => {
    setEdges((current) => current.map((edge) => edge.id === edgeId ? {
      ...edge,
      data: { ...defaultConnectionData(), ...edge.data, [field]: value },
    } : edge))
  }

  const updateManualRoute = (edgeId: string, axis: 'x' | 'y', value: number, initialRoute: { x: number; y: number }) => {
    setEdges((current) => current.map((edge) => {
      if (edge.id !== edgeId) return edge
      const route = edge.data?.manualRoute ?? initialRoute
      return { ...edge, data: { ...defaultConnectionData(), ...edge.data, manualRoute: { ...route, [axis]: Math.round(value / 20) * 20 } } }
    }))
  }

  const updateEndpointAtPoint = (edgeId: string, endpoint: 'source' | 'target', clientX: number, clientY: number) => {
    const point = flowInstanceRef.current?.screenToFlowPosition({ x: clientX, y: clientY })
    if (!point) return
    const candidates = nodes.flatMap((node) => {
      const width = node.measured?.width ?? 192
      const height = node.measured?.height ?? 74
      return [
        { nodeId: node.id, side: 'top', x: node.position.x + width / 2, y: node.position.y },
        { nodeId: node.id, side: 'right', x: node.position.x + width, y: node.position.y + height / 2 },
        { nodeId: node.id, side: 'bottom', x: node.position.x + width / 2, y: node.position.y + height },
        { nodeId: node.id, side: 'left', x: node.position.x, y: node.position.y + height / 2 },
      ]
    })
    const nearest = candidates.map((candidate) => ({ ...candidate, distance: Math.hypot(candidate.x - point.x, candidate.y - point.y) })).sort((first, second) => first.distance - second.distance)[0]
    if (!nearest || nearest.distance > 72) {
      setSaveMessage('部品の上下左右にある中央支点へドロップしてください。')
      return
    }
    setEdges((current) => current.map((edge) => {
      if (edge.id !== edgeId || (endpoint === 'source' ? edge.target : edge.source) === nearest.nodeId) return edge
      return {
        ...edge,
        [endpoint]: nearest.nodeId,
        [endpoint === 'source' ? 'sourceHandle' : 'targetHandle']: `${endpoint}-${nearest.side}`,
        data: { ...defaultConnectionData(), ...edge.data, manualHandles: true, waypoint: undefined, manualRoute: undefined },
      }
    }))
    setSaveMessage(`${endpoint === 'source' ? '始点' : '終点'}を部品の${nearest.side === 'top' ? '上' : nearest.side === 'right' ? '右' : nearest.side === 'bottom' ? '下' : '左'}中央へ接続しました。`)
  }

  const updateConnectionHandle = (edgeId: string, handle: 'sourceHandle' | 'targetHandle', value: string) => {
    setEdges((current) => current.map((edge) => edge.id === edgeId ? { ...edge, [handle]: value, data: { ...defaultConnectionData(), ...edge.data, manualHandles: true, waypoint: undefined } } : edge))
    window.requestAnimationFrame(() => optimizeConnections())
  }

  const updateConnectionEndpoint = (edgeId: string, endpoint: 'source' | 'target', nodeId: string) => {
    setEdges((current) => current.map((edge) => {
      if (edge.id !== edgeId) return edge
      const updated = { ...edge, [endpoint]: nodeId }
      const source = nodes.find((node) => node.id === updated.source)
      const target = nodes.find((node) => node.id === updated.target)
      if (!source || !target) return updated
      return { ...updated, ...chooseConnectionHandles(source, target), data: { ...defaultConnectionData(), ...edge.data, manualHandles: false, waypoint: undefined } }
    }))
    window.requestAnimationFrame(() => optimizeConnections())
  }

  const selectConnection = (edgeId: string) => {
    setSelection({ type: 'edge', id: edgeId })
    setEdges((current) => current.map((edge) => ({ ...edge, selected: edge.id === edgeId })))
  }

  const setConnectionSelection = (ids: string[]) => {
    setConnectionNodeIds(ids)
    setNodes((current) => current.map((node) => ({ ...node, className: ids.includes(node.id) ? 'connection-selected' : undefined })))
  }

  const toggleConnectionSelection = (nodeId: string) => {
    const next = connectionNodeIds.includes(nodeId) ? connectionNodeIds.filter((id) => id !== nodeId) : [...connectionNodeIds, nodeId]
    setConnectionSelection(next)
  }

  const chooseConnectionHandles = (source: Node<DeviceData>, target: Node<DeviceData>) => {
    const sourceCenter = { x: source.position.x + (source.measured?.width ?? 150) / 2, y: source.position.y + (source.measured?.height ?? 64) / 2 }
    const targetCenter = { x: target.position.x + (target.measured?.width ?? 150) / 2, y: target.position.y + (target.measured?.height ?? 64) / 2 }
    const horizontal = Math.abs(sourceCenter.x - targetCenter.x) >= Math.abs(sourceCenter.y - targetCenter.y)
    if (horizontal) return targetCenter.x >= sourceCenter.x
      ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
      : { sourceHandle: 'source-left', targetHandle: 'target-right' }
    return targetCenter.y >= sourceCenter.y
      ? { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
      : { sourceHandle: 'source-top', targetHandle: 'target-bottom' }
  }

  const connectSelectedNodes = () => {
    if (connectionNodeIds.length !== 2) return
    const [firstId, secondId] = connectionNodeIds
    const first = nodes.find((node) => node.id === firstId)
    const second = nodes.find((node) => node.id === secondId)
    if (!first || !second) return
    if (edges.some((edge) => (edge.source === first.id && edge.target === second.id) || (edge.source === second.id && edge.target === first.id))) {
      setSaveMessage('選択した2部品はすでに接続されています。')
      return
    }
    const horizontal = Math.abs(first.position.x - second.position.x) >= Math.abs(first.position.y - second.position.y)
    const source = horizontal ? (first.position.x <= second.position.x ? first : second) : (first.position.y <= second.position.y ? first : second)
    const target = source.id === first.id ? second : first
    setEdges((current) => [...current, {
      id: crypto.randomUUID(),
      source: source.id,
      target: target.id,
      ...chooseConnectionHandles(source, target),
      type: 'editable',
      data: defaultConnectionData(),
    }])
    window.requestAnimationFrame(() => optimizeConnections())
    setConnectionSelection([])
    setSaveMessage(`${source.data.displayName} → ${target.data.displayName} を接続しました。`)
  }

  const optimizeConnections = (layoutNodes = nodes, resetManualHandles = false) => {
    setEdges((current) => {
      const optimized = current.map((edge) => {
      const first = layoutNodes.find((node) => node.id === edge.source)
      const second = layoutNodes.find((node) => node.id === edge.target)
      if (!first || !second) return edge
      if (edge.data?.manualHandles && !resetManualHandles) return { ...edge, data: { ...defaultConnectionData(), ...edge.data, waypoint: undefined } }
      const source = first
      const target = second
      return {
        ...edge,
        source: source.id,
        target: target.id,
        ...chooseConnectionHandles(source, target),
        type: 'editable',
        data: { ...defaultConnectionData(), ...edge.data, manualHandles: false, waypoint: undefined, manualRoute: resetManualHandles ? undefined : edge.data?.manualRoute },
      }
      })
      const groups = new Map<string, Edge<ConnectionData>[]>()
      optimized.forEach((edge) => {
        const sourceGroup = `${edge.source}:${edge.sourceHandle ?? 'source'}`
        const targetGroup = `${edge.target}:${edge.targetHandle ?? 'target'}`
        groups.set(sourceGroup, [...(groups.get(sourceGroup) ?? []), edge])
        groups.set(targetGroup, [...(groups.get(targetGroup) ?? []), edge])
      })
      return optimized.map((edge) => {
        const sourceGroup = groups.get(`${edge.source}:${edge.sourceHandle ?? 'source'}`) ?? []
        const targetGroup = groups.get(`${edge.target}:${edge.targetHandle ?? 'target'}`) ?? []
        const group = sourceGroup.length > 1 ? sourceGroup : targetGroup
        const index = [...group].sort((a, b) => a.id.localeCompare(b.id)).findIndex((item) => item.id === edge.id)
        const routeAnchorMode = targetGroup.length > 1 ? 'target' : sourceGroup.length > 1 ? 'source' : 'middle'
        const routeOffset = routeAnchorMode === 'middle' && group.length > 1 ? (index - (group.length - 1) / 2) * 18 : 0
        return { ...edge, data: { ...defaultConnectionData(), ...edge.data, routeOffset, routeAnchorMode } }
      })
    })
  }

  const autoArrangeDiagram = () => {
    const positioned = arrangeNodesForTemplate(layoutTemplate, nodes, edges)
    setNodes(positioned)
    optimizeConnections(positioned, true)
    setConnectionSelection([])
    window.requestAnimationFrame(() => flowInstanceRef.current?.fitView({ padding: .2, duration: 250 }))
    setSaveMessage(`「${layoutTemplates.find((item) => item.id === layoutTemplate)?.name}」に合わせて構成図と接続線を自動整列しました。`)
  }

  const saveProject = () => {
    download(`${projectName || 'server-design-project'}.json`, JSON.stringify({ schemaVersion: '1.4', id: projectId, name: projectName, systemPolicy, layoutTemplate, nodes, edges }, null, 2), 'application/json')
  }

  const saveInBrowser = () => {
    const project: StoredProject = { schemaVersion: '1.4', id: projectId, name: projectName.trim() || '名称未設定のシステム', systemPolicy, layoutTemplate, nodes, edges, updatedAt: new Date().toISOString() }
    const updated = [...savedProjects.filter((item) => item.id !== project.id), project].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    try {
      localStorage.setItem(browserStorageKey, JSON.stringify(updated))
      setSavedProjects(updated)
      setProjectName(project.name)
      setSaveMessage('このブラウザに保存しました。')
    } catch {
      setSaveMessage('ブラウザへの保存に失敗しました。JSON書出しを利用してください。')
    }
  }

  const openBrowserProject = (project: StoredProject) => {
    setProjectId(project.id)
    setProjectName(project.name)
    setSystemPolicy(normalizeSystemPolicy(project.systemPolicy as unknown as Record<string, unknown> | undefined))
    setLayoutTemplate(isLayoutTemplateId((project as Partial<StoredProject>).layoutTemplate) ? project.layoutTemplate : 'blank')
    setNodes(normalizeNodes(project.nodes))
    setEdges(normalizeEdges(project.edges))
    setSelection(null)
    setView({ level: 1 })
    setShowProjectLibrary(false)
    setSaveMessage(`「${project.name}」を開きました。`)
  }

  const createNewProject = () => {
    setTemplatePickerMode('new')
  }

  const applyTemplate = (templateId: LayoutTemplateId) => {
    if (templatePickerMode === 'change') {
      const reclassified = nodes.map((node) => ({ ...node, data: { ...node.data, layoutSlot: '' } }))
      const positioned = arrangeNodesForTemplate(templateId, reclassified, edges)
      setLayoutTemplate(templateId)
      setNodes(positioned)
      optimizeConnections(positioned, true)
      setSelection(null)
      setConnectionSelection([])
      setTemplatePickerMode(null)
      window.requestAnimationFrame(() => flowInstanceRef.current?.fitView({ padding: .2, duration: 250 }))
      setSaveMessage(`部品・接続・入力値を維持したまま、「${layoutTemplates.find((item) => item.id === templateId)?.name}」へレイアウトを変更しました。`)
      return
    }
    const template = createTemplateDiagram(templateId)
    const positioned = arrangeNodesForTemplate(templateId, template.nodes, template.edges)
    const optimizedEdges = template.edges.map((edge) => {
      const source = positioned.find((node) => node.id === edge.source)
      const target = positioned.find((node) => node.id === edge.target)
      return source && target ? { ...edge, ...chooseConnectionHandles(source, target) } : edge
    })
    setProjectId(crypto.randomUUID())
    setProjectName('新しいシステム')
    setSystemPolicy(emptySystemPolicy())
    setLayoutTemplate(templateId)
    setNodes(positioned)
    setEdges(optimizedEdges)
    setSelection(null)
    setConnectionSelection([])
    setView({ level: 1 })
    setTemplatePickerMode(null)
    window.requestAnimationFrame(() => flowInstanceRef.current?.fitView({ padding: .2, duration: 250 }))
    setSaveMessage(`「${layoutTemplates.find((item) => item.id === templateId)?.name}」テンプレートから新しいシステムセットを作成しました。`)
  }

  const openProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as Partial<StoredProject>
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) throw new Error('invalid project')
      setNodes(normalizeNodes(parsed.nodes))
      setEdges(normalizeEdges(parsed.edges))
      setProjectId(parsed.id ?? crypto.randomUUID())
      setProjectName(parsed.name ?? (file.name.replace(/\.json$/i, '') || '読み込み済みシステム'))
      setSystemPolicy(normalizeSystemPolicy((parsed.systemPolicy ?? (parsed as unknown as { infrastructure?: Record<string, unknown> }).infrastructure) as Record<string, unknown> | undefined))
      setLayoutTemplate(isLayoutTemplateId(parsed.layoutTemplate) ? parsed.layoutTemplate : 'blank')
      setSelection(null)
      setView({ level: 1 })
      setSaveMessage(`「${parsed.name ?? file.name}」を読み込みました。`)
    } catch {
      window.alert('このJSONファイルは読み込めませんでした。')
    } finally {
      event.target.value = ''
    }
  }

  const exportCsv = () => {
    const serverRows = nodes.filter((node) => node.data.kind === 'server')
    const serverCsv = [
      ['表示名', 'ホスト名', 'IPアドレス', 'OS', 'CPU', 'メモリ', 'ディスク', '用途'],
      ...serverRows.map((node) => [node.data.displayName, node.data.hostname, node.data.ipAddress, [node.data.osName, node.data.osVersion].filter(Boolean).join(' '), node.data.cpu, node.data.memory, node.data.disk, node.data.purpose]),
    ].map((row) => row.map(csvValue).join(',')).join('\n')
    const ipCsv = [
      ['IPアドレス', '部品名', '種別', 'ホスト名', '用途'],
      ...nodes.map((node) => [node.data.kind === 'server' ? node.data.ipAddress : node.data.managementIpAddress, node.data.displayName, kindLabels[node.data.kind], node.data.hostname, node.data.purpose]),
    ].map((row) => row.map(csvValue).join(',')).join('\n')
    download('server-list.csv', `\uFEFF${serverCsv}`, 'text/csv;charset=utf-8')
    download('ip-address-list.csv', `\uFEFF${ipCsv}`, 'text/csv;charset=utf-8')
  }

  const exportExcel = async () => {
    setSaveMessage('レイアウト付きExcelファイルを作成しています。')
    try {
      const ExcelJS = await import('exceljs')
      const servers = nodes.filter((node) => node.data.kind === 'server')
      const workbook = new ExcelJS.Workbook()
      const tableHeader = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: '1F4E78' } }
      const sectionFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'DCEAF7' } }
      const setupSheet = (sheet: Worksheet, title: string, widths: number[]) => {
        sheet.views = [{ showGridLines: false }]
        sheet.columns = widths.map((width) => ({ width }))
        sheet.getCell('A1').value = title
        sheet.getCell('A1').font = { name: 'Arial', size: 15, bold: true, color: { argb: '1F3B5D' } }
        sheet.getCell('A2').value = `システム名: ${projectName}`
        sheet.getCell('A2').font = { name: 'Arial', size: 10, italic: true, color: { argb: '5E7188' } }
      }
      const addTable = (sheet: Worksheet, startRow: number, label: string, headers: string[], rows: Array<Array<string | number>>) => {
        const labelRow = sheet.getRow(startRow)
        labelRow.getCell(1).value = label
        labelRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: '1F3B5D' } }
        labelRow.fill = sectionFill
        const headerRow = sheet.getRow(startRow + 1)
        headerRow.values = headers
        headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } }
        headerRow.fill = tableHeader
        headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        rows.forEach((row, index) => {
          const dataRow = sheet.getRow(startRow + 2 + index)
          dataRow.values = row
          dataRow.font = { name: 'Arial', size: 10, color: { argb: '24364A' } }
          dataRow.alignment = { vertical: 'middle', wrapText: true }
        })
        return startRow + 2 + Math.max(rows.length, 1)
      }

      const level1 = workbook.addWorksheet('レベル1_全体構成')
      setupSheet(level1, 'レベル1 全体構成図', [18, 16, 20, 18, 18, 18, 22, 32])
      const level1Image = levelOneDiagramSvg(nodes, edges)
      const level1ImageId = workbook.addImage({ base64: await svgToPng(level1Image.svg, level1Image.width, level1Image.height), extension: 'png' })
      level1.addImage(level1ImageId, { tl: { col: 1, row: 2 }, ext: { width: 760, height: Math.round(760 * level1Image.height / level1Image.width) } })
      let level1Row = 4 + Math.ceil((760 * level1Image.height / level1Image.width) / 20)
      level1Row = addTable(level1, level1Row, 'システム共通方針', ['構成方式', '共通ネットワーク', '管理・運用主体', '可用性方針', '外部連携・境界方針', '共通メモ', '設計メモ'], [[systemPolicy.architecturePolicy, systemPolicy.sharedNetwork, systemPolicy.governance, systemPolicy.availabilityPolicy, systemPolicy.boundaryPolicy, systemPolicy.notes, systemPolicy.designNote]]) + 2
      level1Row = addTable(level1, level1Row, '部品一覧', ['部品ID', '種別', '表示名', 'ホスト名', 'IPアドレス', '管理IPアドレス', '用途', '備考'], nodes.map((node) => [node.id, kindLabels[node.data.kind], node.data.displayName, node.data.hostname, node.data.ipAddress, node.data.managementIpAddress, node.data.purpose, node.data.notes])) + 2
      addTable(level1, level1Row, '接続一覧', ['接続ID', '接続元', '接続先', '接続種別', '接続元IF', '接続先IF', '備考'], edges.map((edge) => [edge.id, nodes.find((node) => node.id === edge.source)?.data.displayName ?? edge.source, nodes.find((node) => node.id === edge.target)?.data.displayName ?? edge.target, edge.data?.connectionType ?? 'network', edge.data?.sourceInterface ?? '', edge.data?.targetInterface ?? '', edge.data?.notes ?? '']))

      const level2 = workbook.addWorksheet('レベル2_サーバー詳細')
      setupSheet(level2, 'レベル2 サーバー詳細図', [20, 18, 18, 18, 16, 16, 18, 18, 20, 22, 22, 22, 22, 32])
      let level2Row = 3
      for (const server of servers) {
        const image = levelTwoDiagramSvg(server)
        const imageId = workbook.addImage({ base64: await svgToPng(image.svg, image.width, image.height), extension: 'png' })
        level2.addImage(imageId, { tl: { col: 1, row: level2Row }, ext: { width: 760, height: Math.round(760 * image.height / image.width) } })
        level2Row += Math.ceil((760 * image.height / image.width) / 20) + 3
      }
      addTable(level2, level2Row, 'サーバー詳細一覧', ['サーバー名', '配置形態', 'クラウド／仮想化基盤', '配置先', 'リソース・クラスタ', '補足情報', 'HW・リソース: CPU', 'HW・リソース: メモリ', 'OS名', 'OSバージョン', 'ホスト名', 'IPアドレス', '管理IPアドレス', 'ストレージ: ディスク', '用途', '備考', '設計メモ'], servers.map((node) => [node.data.displayName, node.data.deploymentType, node.data.platformProvider, node.data.platformLocation, node.data.platformResource, node.data.platformDetail, node.data.cpu, node.data.memory, node.data.osName, node.data.osVersion, node.data.hostname, node.data.ipAddress, node.data.managementIpAddress, node.data.disk, node.data.purpose, node.data.notes, node.data.level2Note]))

      const level3 = workbook.addWorksheet('レベル3_MWサービス')
      setupSheet(level3, 'レベル3 MW・サービス詳細', [20, 18, 22, 22, 20, 18, 16, 16, 32, 32, 40])
      addTable(level3, 4, 'MW・サービス一覧', ['サーバー名', 'ホスト名', 'サービス名', '実行言語・ランタイム', 'フレームワーク', '実行方式', 'バージョン', 'ポート', 'リポジトリ／イメージ', '設定ファイル', '設定メモ', '設計メモ'], servers.flatMap((node) => node.data.middleware.map((middleware) => [node.data.displayName, node.data.hostname, middleware.name, middleware.runtime, middleware.framework, middleware.executionMethod, middleware.version, middleware.port, middleware.repository, middleware.configurationPath, middleware.configurationNote, middleware.level3Note])))

      const level4 = workbook.addWorksheet('レベル4_設定パラメータ')
      setupSheet(level4, 'レベル4 設定・パラメータ', [16, 20, 22, 20, 20, 42])
      addTable(level4, 4, '設定・パラメータ一覧', ['対象区分', 'サーバー名', 'サービス名', 'カテゴリ', 'パラメータ', '値'], servers.flatMap((node) => [
        ['サーバー', node.data.displayName, '', '配置・実行基盤', '配置形態', node.data.deploymentType], ['サーバー', node.data.displayName, '', '配置・実行基盤', 'クラウド／仮想化基盤', node.data.platformProvider], ['サーバー', node.data.displayName, '', '配置・実行基盤', 'リージョン・拠点', node.data.platformLocation], ['サーバー', node.data.displayName, '', '配置・実行基盤', 'リソース・クラスタ', node.data.platformResource], ['サーバー', node.data.displayName, '', '配置・実行基盤', '補足情報', node.data.platformDetail], ['サーバー', node.data.displayName, '', 'HW・リソース', 'CPU', node.data.cpu], ['サーバー', node.data.displayName, '', 'HW・リソース', 'メモリ', node.data.memory], ['サーバー', node.data.displayName, '', 'ストレージ・データ', 'ディスク', node.data.disk], ['サーバー', node.data.displayName, '', 'OS', 'ホスト名', node.data.hostname], ['サーバー', node.data.displayName, '', 'OS', 'OS名', node.data.osName], ['サーバー', node.data.displayName, '', 'OS', 'OSバージョン', node.data.osVersion], ['サーバー', node.data.displayName, '', 'ネットワーク', 'IPアドレス', node.data.ipAddress], ['サーバー', node.data.displayName, '', 'ネットワーク', '管理IPアドレス', node.data.managementIpAddress], ['サーバー', node.data.displayName, '', '共通', '用途', node.data.purpose], ['サーバー', node.data.displayName, '', '共通', '備考', node.data.notes],
        ...node.data.middleware.flatMap((middleware) => [['MW・サービス', node.data.displayName, middleware.name, 'アプリケーション・ランタイム', '実行言語・ランタイム', middleware.runtime], ['MW・サービス', node.data.displayName, middleware.name, 'アプリケーション・ランタイム', 'フレームワーク', middleware.framework], ['MW・サービス', node.data.displayName, middleware.name, 'アプリケーション・ランタイム', '実行方式', middleware.executionMethod], ['MW・サービス', node.data.displayName, middleware.name, 'アプリケーション・ランタイム', 'リポジトリ／イメージ', middleware.repository], ['MW・サービス', node.data.displayName, middleware.name, 'アプリケーション・ランタイム', '設定ファイル', middleware.configurationPath], ['MW・サービス', node.data.displayName, middleware.name, 'MW・サービス', 'バージョン', middleware.version], ['MW・サービス', node.data.displayName, middleware.name, 'MW・サービス', 'ポート', middleware.port], ['MW・サービス', node.data.displayName, middleware.name, 'MW・サービス', '設定メモ', middleware.configurationNote]]),
      ]))

      const filename = `${projectName.trim().replace(/[\\/:*?"<>|]/g, '_') || 'server-design'}_設計情報.xlsx`
      downloadBlob(filename, new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      setSaveMessage('レイアウト画像とレベル1〜4の表を含むExcelファイルを書き出しました。')
    } catch (error) {
      console.error(error)
      setSaveMessage('Excelの書き出しに失敗しました。入力内容を確認してもう一度お試しください。')
    }
  }

  const connectionLabel = (edge: Edge<ConnectionData>) => `${nodes.find((node) => node.id === edge.source)?.data.displayName ?? edge.source} → ${nodes.find((node) => node.id === edge.target)?.data.displayName ?? edge.target}`

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">PROTOTYPE / MVP</p>
          <h1>Orden</h1>
          <label className="project-name">システム名<input value={projectName} onChange={(event) => { setProjectName(event.target.value); setSaveMessage('') }} placeholder="例: 販売管理システム" /></label>
          <div className="breadcrumb">
            <button onClick={() => setView({ level: 1 })}>レベル1 全体構成図</button>
            {view.level > 1 && <><span>›</span><button onClick={() => viewServer && setView({ level: 2, serverId: viewServer.id })}>{viewServer?.data.displayName} 詳細図</button></>}
            {view.level > 2 && <><span>›</span><span>レベル{view.level}</span></>}
          </div>
        </div>
      </header>

      <nav ref={menuBarRef} className="app-menu-bar" aria-label="アプリケーションメニュー" onKeyDown={(event) => event.key === 'Escape' && setOpenMenu(null)}>
        <div className="menu-group">
          <button className={openMenu === 'file' ? 'menu-trigger active' : 'menu-trigger'} aria-haspopup="menu" aria-expanded={openMenu === 'file'} onClick={() => setOpenMenu((current) => current === 'file' ? null : 'file')}>ファイル</button>
          {openMenu === 'file' && <div className="menu-dropdown" role="menu">
            <button role="menuitem" onClick={runMenuAction(createNewProject)}>新規作成</button>
            <span className="menu-divider" />
            <button role="menuitem" onClick={runMenuAction(saveInBrowser)}>ブラウザに保存</button>
            <button role="menuitem" onClick={runMenuAction(() => setShowProjectLibrary(true))}>保存済みを開く</button>
            <span className="menu-divider" />
            <button role="menuitem" onClick={runMenuAction(() => fileInput.current?.click())}>JSONを開く</button>
            <button role="menuitem" onClick={runMenuAction(saveProject)}>JSONを書き出し</button>
            <button role="menuitem" onClick={runMenuAction(exportCsv)}>CSVを出力</button>
            <button role="menuitem" onClick={runMenuAction(exportExcel)}>Excelを出力</button>
          </div>}
        </div>
        <div className="menu-group">
          <button className={openMenu === 'edit' ? 'menu-trigger active' : 'menu-trigger'} aria-haspopup="menu" aria-expanded={openMenu === 'edit'} onClick={() => setOpenMenu((current) => current === 'edit' ? null : 'edit')}>編集</button>
          {openMenu === 'edit' && <div className="menu-dropdown" role="menu">
            <button role="menuitem" disabled={!historyRef.current?.undo.length} onClick={runMenuAction(undo)}>元に戻す <span className="shortcut">⌘Z / Ctrl+Z</span></button>
            <button role="menuitem" disabled={!historyRef.current?.redo.length} onClick={runMenuAction(redo)}>やり直す <span className="shortcut">⌘⇧Z / Ctrl+Y</span></button>
            <span className="menu-divider" />
            <button role="menuitem" disabled={!selection} onClick={runMenuAction(deleteSelected)}>選択中の部品・接続を削除</button>
          </div>}
        </div>
        <div className="menu-group">
          <button className={openMenu === 'view' ? 'menu-trigger active' : 'menu-trigger'} aria-haspopup="menu" aria-expanded={openMenu === 'view'} onClick={() => setOpenMenu((current) => current === 'view' ? null : 'view')}>表示</button>
          {openMenu === 'view' && <div className="menu-dropdown" role="menu">
            <button role="menuitem" onClick={runMenuAction(() => setView({ level: 1 }))}>レベル1 全体構成図</button>
            <button role="menuitem" disabled={view.level !== 1} onClick={runMenuAction(() => setIsConnectionMode((current) => !current))}>{isConnectionMode ? '接続モードを終了' : '接続モードを開始'}</button>
            <button role="menuitem" onClick={runMenuAction(() => setShowDesignNotes((current) => !current))}>{showDesignNotes ? '設計メモを隠す' : '設計メモを表示'}</button>
            <span className="menu-divider" />
            <button role="menuitem" disabled={view.level !== 1} onClick={runMenuAction(() => { setPanelWidths({ palette: 200, properties: 272 }); setWorkspaceHeight(544); setSaveMessage('表示領域のサイズを初期値に戻しました。') })}>表示領域のサイズを戻す</button>
          </div>}
        </div>
        <div className="menu-group">
          <button className={openMenu === 'layout' ? 'menu-trigger active' : 'menu-trigger'} aria-haspopup="menu" aria-expanded={openMenu === 'layout'} onClick={() => setOpenMenu((current) => current === 'layout' ? null : 'layout')}>レイアウト</button>
          {openMenu === 'layout' && <div className="menu-dropdown" role="menu">
            <button role="menuitem" disabled={view.level !== 1 || !nodes.length} onClick={runMenuAction(() => setTemplatePickerMode('change'))}>現在の構成のレイアウトを変更</button>
            <button role="menuitem" disabled={view.level !== 1 || !nodes.length} onClick={runMenuAction(autoArrangeDiagram)}>テンプレート基準に再配置</button>
            <button role="menuitem" disabled={view.level !== 1 || !edges.length} onClick={runMenuAction(() => { optimizeConnections(nodes, true); setSaveMessage('接続線を最適化しました。') })}>接続線を最適化</button>
            <span className="menu-divider" />
            <button role="menuitem" disabled={!selectedNode} onClick={runMenuAction(() => setShowLayoutEditor(true))}>選択中の部品の見た目を編集</button>
            <button role="menuitem" disabled={!selectedNode} onClick={runMenuAction(resetSelectedAppearance)}>アイコン・色を初期値へ戻す</button>
          </div>}
        </div>
        <input ref={fileInput} className="hidden" type="file" accept="application/json,.json" onChange={openProject} />
      </nav>

      {saveMessage && <div className="save-message" role="status">{saveMessage}</div>}
      {templatePickerMode && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTemplatePickerMode(null) }}>
        <section className="template-picker panel" role="dialog" aria-modal="true" aria-label="レイアウトテンプレート" onMouseDown={(event) => event.stopPropagation()}>
          <div className="panel-heading"><div><h2>{templatePickerMode === 'new' ? '新規作成：レイアウトテンプレート' : '現在の構成：レイアウトを変更'}</h2><p>{templatePickerMode === 'new' ? '部品・接続を含む新しい構成図の出発点を選択します。' : '現在の部品、接続、プロパティは保持し、配置と自動整列のルールだけを変更します。'}</p></div><button onClick={() => setTemplatePickerMode(null)}>閉じる</button></div>
          <div className="template-grid">{layoutTemplates.map((template) => <article className="template-card" key={template.id}>
            <div className={`template-preview template-${template.id}`} aria-label={`${template.name}のプレビュー`}>
              {template.preview.map((item, index) => <span className="template-preview-node" style={{ left: `${item.x}%`, top: `${item.y}%`, color: kindColors[item.kind] }} key={`${item.kind}-${index}`}><FontAwesomeIcon icon={iconDefinitions[defaultIcon[item.kind]]} /></span>)}
              {template.id === 'blank' && <span className="template-blank-message">自由に配置</span>}
            </div>
            <div className="template-card-body"><div><h3>{template.name}</h3><p>{template.description}</p></div><button className="primary" onClick={() => applyTemplate(template.id)}>{templatePickerMode === 'new' ? '新規作成' : 'レイアウト変更'}</button></div>
          </article>)}</div>
          <p className="template-note">{templatePickerMode === 'new' ? '現在の構成を置き換えて新しいシステムセットを作成します。必要なら先に「ブラウザに保存」またはJSON書き出しをしてください。' : 'レイアウト変更では、部品や接続を削除しません。テンプレートに合わない部品も、近いカテゴリへ自動配置します。'}</p>
        </section>
      </div>}
      {showProjectLibrary && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowProjectLibrary(false) }}>
        <section className="project-library panel" role="dialog" aria-modal="true" aria-label="保存済みシステム" onMouseDown={(event) => event.stopPropagation()}>
          <div className="panel-heading"><div><h2>保存済みシステム</h2><p>ブラウザ内に保存した、レベル1〜4を含むシステムセットです。</p></div><button onClick={() => setShowProjectLibrary(false)}>閉じる</button></div>
          {savedProjects.length ? <ul>{savedProjects.map((project) => <li key={project.id}><div><strong>{project.name}</strong><small>{new Date(project.updatedAt).toLocaleString('ja-JP')} / {project.nodes.length} 部品</small></div><button className="primary" onClick={() => openBrowserProject(project)}>開く</button></li>)}</ul> : <div className="empty-state">まだブラウザ内に保存されたシステムはありません。</div>}
          <p className="library-note">この保存領域は、現在のブラウザ・このMacだけで利用できます。共有やバックアップにはJSON書出しを使います。</p>
        </section>
      </div>}

      {showLayoutEditor && selectedNode && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLayoutEditor(false) }}><section className="layout-editor panel" role="dialog" aria-modal="true" aria-label="部品の見た目を編集" onMouseDown={(event) => event.stopPropagation()}><div className="panel-heading"><div><h2>部品の見た目を編集</h2><p>{selectedNode.data.displayName}</p></div><button onClick={() => setShowLayoutEditor(false)}>閉じる</button></div><label>部品名<input value={selectedNode.data.displayName} onChange={(event) => updateSelectedAppearance('displayName', event.target.value)} /></label><label>アイコン<select value={selectedNode.data.iconKey} onChange={(event) => updateSelectedAppearance('iconKey', event.target.value)}>{(Object.keys(iconLabels) as IconKey[]).map((key) => <option value={key} key={key}>{iconLabels[key]}</option>)}</select></label><label>色<input className="color-input" type="color" value={selectedNode.data.color} onChange={(event) => updateSelectedAppearance('color', event.target.value)} /></label><div className="layout-editor-preview"><FontAwesomeIcon icon={iconFor(selectedNode.data)} style={{ color: selectedNode.data.color }} /><strong>{selectedNode.data.displayName || '名称未設定'}</strong></div><div className="layout-editor-actions"><button onClick={resetSelectedAppearance}>アイコン・色を初期値へ戻す</button><button className="primary" onClick={() => setShowLayoutEditor(false)}>完了</button></div></section></div>}

      {view.level === 1 ? <>
      <section className="workspace" style={workspaceStyle}>
        <aside className="palette panel">
          <h2>部品一覧</h2>
          <p>ドラッグして配置、またはクリックして追加</p>
          <div className="device-catalog">{(Object.keys(kindLabels).filter((kind) => kind !== 'custom') as DeviceKind[]).map((kind) => <button className="device-button" key={kind} draggable onDragStart={(event) => startDeviceDrag(event, kind)} onClick={() => addDevice(kind)}><FontAwesomeIcon className="palette-icon" icon={iconDefinitions[defaultIcon[kind]]} style={{ color: kindColors[kind] }} /><span>{kindLabels[kind]}</span></button>)}</div>
          <div className="palette-note">接続モードでは、橙の接続元から青の接続先へドラッグして接続します。上下左右すべての支点を使えます。</div>
        </aside>

        <div className="panel-resizer" role="separator" aria-label="部品一覧の幅を変更" aria-orientation="vertical" title="ドラッグして部品一覧の幅を変更" onPointerDown={(event) => startPanelResize('palette', event)} />

        <section className="canvas panel" aria-label="構成図キャンバス">
          <div className="canvas-title"><span>全体構成図 <small className="template-badge">{layoutTemplates.find((item) => item.id === layoutTemplate)?.name}</small></span><div className="canvas-actions"><small title="20pxグリッドと他部品の中心線へ吸着します。Shiftを押す間は中心線への吸着を解除します。">{nodes.length} 部品 / {edges.length} 接続 / 吸着ON</small>{connectionNodeIds.length > 0 && <button className={connectionNodeIds.length === 2 ? 'selected-connect active' : 'selected-connect'} disabled={connectionNodeIds.length !== 2} onClick={connectSelectedNodes}>{connectionNodeIds.length === 2 ? '選択した2部品を接続' : `あと${2 - connectionNodeIds.length}部品を選択`}</button>}<button className={isConnectionMode ? 'connection-mode active' : 'connection-mode'} onClick={() => setIsConnectionMode((current) => !current)}>{isConnectionMode ? '接続モード中：支点をドラッグ' : '接続モード'}</button></div></div>
          <div className={isConnectionMode ? 'flow-wrap is-connection-mode' : 'flow-wrap'} onDragOver={allowDeviceDrop} onDrop={dropDevice}>
            <EdgeRouteContext.Provider value={{ updateManualRoute, updateEndpointAtPoint }}>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              snapToGrid
              snapGrid={[20, 20]}
              onNodeDrag={(event, movedNode) => {
                const position = snapNodePosition(movedNode.id, movedNode.position, event.shiftKey)
                setNodes((current) => current.map((node) => node.id === movedNode.id ? { ...node, position } : node))
              }}
              onNodeDragStop={(event, movedNode) => {
                const position = snapNodePosition(movedNode.id, movedNode.position, event.shiftKey)
                const layoutNodes = nodes.map((node) => node.id === movedNode.id ? { ...node, position, measured: movedNode.measured } : node)
                setNodes(layoutNodes)
                optimizeConnections(layoutNodes)
              }}
              onConnect={(connection: Connection) => setEdges((current) => addEdge({ ...connection, id: crypto.randomUUID(), type: 'editable', data: defaultConnectionData() }, current))}
              onConnectStart={() => setIsConnectionMode(true)}
              onConnectEnd={() => setIsConnectionMode(false)}
              onNodeClick={(event, node) => {
                setSelection({ type: 'node', id: node.id })
                setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
                if (event.metaKey || event.ctrlKey) toggleConnectionSelection(node.id)
              }}
              onNodeDoubleClick={(_, node) => {
                if ((node.data as DeviceData).kind === 'server') setView({ level: 2, serverId: node.id })
              }}
              onEdgeClick={(_, edge) => selectConnection(edge.id)}
              onPaneClick={() => {
                setSelection(null)
                setConnectionSelection([])
                setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
              }}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={(instance) => { flowInstanceRef.current = instance }}
              fitView
              deleteKeyCode={null}
            >
              <Background gap={18} size={1} color="#cbd5e1" />
              <Controls />
              <MiniMap nodeColor={(node) => (node.data as DeviceData).color ?? kindColors[(node.data as DeviceData).kind]} zoomable pannable />
            </ReactFlow>
            </EdgeRouteContext.Provider>
          </div>
        </section>

        <div className="panel-resizer" role="separator" aria-label="プロパティの幅を変更" aria-orientation="vertical" title="ドラッグしてプロパティの幅を変更" onPointerDown={(event) => startPanelResize('properties', event)} />

        <aside className="properties panel">
          <div className="panel-heading"><h2>プロパティ</h2>{selection && <button className="text-button danger" onClick={deleteSelected}>削除</button>}</div>
          {selectedNode ? (
            <PropertyEditor node={selectedNode} nodes={nodes} edges={edges} layoutTemplate={layoutTemplate} onChange={updateNode} onSelectConnection={selectConnection} onOpenDetails={() => selectedNode.data.kind === 'server' && setView({ level: 2, serverId: selectedNode.id })} />
          ) : selectedEdge ? (
            <ConnectionEditor edge={selectedEdge} nodes={nodes} onChange={updateConnection} onChangeHandle={updateConnectionHandle} onChangeEndpoint={updateConnectionEndpoint} />
          ) : (
            <SystemPolicyEditor systemPolicy={systemPolicy} onChange={(field, value) => { setSystemPolicy((current) => ({ ...current, [field]: value })); setSaveMessage('') }} />
          )}
        </aside>
      </section>

      <div className="workspace-height-resizer" role="separator" aria-label="作業エリアの高さを変更" aria-orientation="horizontal" title="ドラッグして作業エリアの高さを変更" onPointerDown={startWorkspaceHeightResize}><span /></div>

      {showDesignNotes && <DesignNotePanel level="レベル1" description="システム全体の方針、判断理由、顧客・営業へ共有したい背景を残します。" value={systemPolicy.designNote} onChange={(value) => setSystemPolicy((current) => ({ ...current, designNote: value }))} />}

      <section className="checks panel">
        <div className="panel-heading">
          <div><h2>チェック結果</h2><p>警告 {validations.filter((item) => item.severity === 'warning').length}件 / 情報 {validations.filter((item) => item.severity === 'info').length}件</p></div>
        </div>
        {validations.length ? <ul>{validations.map((item, index) => <li key={`${item.message}-${index}`} className={item.severity} onClick={() => setSelection({ type: 'node', id: item.nodeIds[0] })}><span>{item.severity === 'warning' ? '警告' : '情報'}</span>{item.message}</li>)}</ul> : <div className="check-success">現在の構成にMVP対象の警告はありません。</div>}
      </section>
      </> : viewServer ? <ScaleView server={viewServer} view={view} showDesignNotes={showDesignNotes} onNavigate={setView} onUpdateServer={updateServer} onUpdateMiddleware={updateMiddleware} onAddMiddleware={addMiddleware} onDeleteMiddleware={deleteMiddleware} /> : <section className="scale-screen panel"><h2>対象のサーバーが見つかりません。</h2><button onClick={() => setView({ level: 1 })}>全体構成図へ戻る</button></section>}
    </main>
  )
}

function ScaleView({ server, view, showDesignNotes, onNavigate, onUpdateServer, onUpdateMiddleware, onAddMiddleware, onDeleteMiddleware }: {
  server: Node<DeviceData>
  view: Exclude<View, { level: 1 }>
  showDesignNotes: boolean
  onNavigate: (view: View) => void
  onUpdateServer: (serverId: string, field: EditableField, value: string) => void
  onUpdateMiddleware: (serverId: string, middlewareId: string, field: MiddlewareField, value: string) => void
  onAddMiddleware: (serverId: string) => void
  onDeleteMiddleware: (serverId: string, middlewareId: string) => void
}) {
  const { data } = server
  const profile = deploymentProfile(data.deploymentType)
  const selectedMiddleware = view.level === 3 || (view.level === 4 && view.middlewareId)
    ? data.middleware.find((item) => item.id === view.middlewareId)
    : undefined

  if (view.level === 4) {
    const serverFields: Array<[EditableField, string]> = [['displayName', '表示名'], ['deploymentType', '配置形態'], ['platformProvider', profile.provider], ['platformLocation', profile.location], ['platformResource', profile.resource], ['platformDetail', profile.detail], ['hostname', 'ホスト名'], ['ipAddress', 'IPアドレス'], ['osName', 'OS名'], ['osVersion', 'OSバージョン'], ['cpu', 'CPU'], ['memory', 'メモリ'], ['disk', 'ディスク'], ['purpose', '用途'], ['notes', '備考']]
    const middlewareFields: Array<[MiddlewareField, string]> = [['name', 'サービス'], ['runtime', '実行言語・ランタイム'], ['framework', 'フレームワーク'], ['executionMethod', '実行方式'], ['repository', 'リポジトリ／イメージ'], ['configurationPath', '設定ファイル'], ['version', 'バージョン'], ['port', 'ポート'], ['configurationNote', '設定メモ']]
    return <section className="scale-screen panel">
      <div className="scale-heading"><div><p className="eyebrow">LEVEL 4</p><h2>設定・パラメータ</h2><p>{selectedMiddleware ? `${selectedMiddleware.name} の設定値` : `${data.displayName} の基本パラメータ`}</p></div><button onClick={() => onNavigate({ level: 2, serverId: server.id })}>詳細図へ戻る</button></div>
      {showDesignNotes && <DesignNotePanel level="レベル4" description="設定値の意図、変更時の注意、未確定事項を残します。" value={data.level4Note} onChange={(value) => onUpdateServer(server.id, 'level4Note', value)} />}
      <p className="edit-hint">ここで編集した値は、全体構成図・詳細図・一覧・出力へ同時に反映されます。</p>
      <table className="parameter-table"><tbody>{selectedMiddleware ? middlewareFields.map(([field, label]) => <tr key={field}><th>{label}</th><td>{field === 'configurationNote' ? <textarea value={selectedMiddleware[field]} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, field, event.target.value)} rows={3} /> : <input value={selectedMiddleware[field]} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, field, event.target.value)} />}</td></tr>) : serverFields.map(([field, label]) => <tr key={field}><th>{label}</th><td>{field === 'notes' ? <textarea value={data[field]} onChange={(event) => onUpdateServer(server.id, field, event.target.value)} rows={3} /> : <input value={data[field]} onChange={(event) => onUpdateServer(server.id, field, event.target.value)} />}</td></tr>)}</tbody></table>
    </section>
  }

  if (view.level === 3 && selectedMiddleware) {
    return <section className="scale-screen panel">
      <div className="scale-heading"><div><p className="eyebrow">LEVEL 3</p><h2>{selectedMiddleware.name} サービス詳細</h2><p>{data.displayName} / {data.hostname}</p></div><button onClick={() => onNavigate({ level: 2, serverId: server.id })}>サーバー詳細図へ戻る</button></div>
      {showDesignNotes && <DesignNotePanel level="レベル3" description="サービス構成の理由、運用上の注意、依存関係を残します。" value={selectedMiddleware.level3Note} onChange={(value) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'level3Note', value)} />}
      <div className="service-detail-grid">
        <label>サービス名<input value={selectedMiddleware.name} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'name', event.target.value)} /></label>
        <label>実行言語・ランタイム<input value={selectedMiddleware.runtime} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'runtime', event.target.value)} placeholder="例: Java 21 / Node.js 22" /></label>
        <label>フレームワーク<input value={selectedMiddleware.framework} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'framework', event.target.value)} placeholder="例: Spring Boot" /></label>
        <label>実行方式<input value={selectedMiddleware.executionMethod} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'executionMethod', event.target.value)} placeholder="例: Docker / systemd" /></label>
        <label>バージョン<input value={selectedMiddleware.version} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'version', event.target.value)} /></label>
        <label>利用ポート<input value={selectedMiddleware.port} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'port', event.target.value)} /></label>
        <label>リポジトリ／イメージ<input value={selectedMiddleware.repository} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'repository', event.target.value)} placeholder="例: org/service または registry/image" /></label>
        <label>設定ファイル<input value={selectedMiddleware.configurationPath} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'configurationPath', event.target.value)} placeholder="例: /etc/service/config.yml" /></label>
        <label>設定メモ<textarea value={selectedMiddleware.configurationNote} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'configurationNote', event.target.value)} rows={3} /></label>
      </div>
      <button className="primary parameter-button" onClick={() => onNavigate({ level: 4, serverId: server.id, middlewareId: selectedMiddleware.id })}>パラメータを表示</button>
    </section>
  }

  return <section className="scale-screen panel">
    <div className="scale-heading"><div><p className="eyebrow">LEVEL 2</p><h2>{data.displayName} 詳細図</h2><p>{data.hostname || 'ホスト名未設定'} / {data.ipAddress || 'IP未設定'}</p></div><button onClick={() => onNavigate({ level: 1 })}>全体構成図へ戻る</button></div>
    {showDesignNotes && <DesignNotePanel level="レベル2" description="サーバー・クラウド配置・構成の判断理由や注意点を残します。" value={data.level2Note} onChange={(value) => onUpdateServer(server.id, 'level2Note', value)} />}
    <div className="server-diagram categorized-server-diagram">
      <section className="server-boundary">
        <div className="server-shell-heading"><span>サーバー / VM</span><strong>{data.displayName}</strong><small>HW・仮想リソースを表す外枠</small></div>
        <section className="category-section platform-category">
          <div className="category-heading"><div><span className="category-kicker">CATEGORY 01</span><h3>配置・実行基盤</h3></div><p>この部品が動作する場所</p></div>
          <div className="level-two-fields"><label>配置形態<select value={data.deploymentType} onChange={(event) => onUpdateServer(server.id, 'deploymentType', event.target.value)}><option value="">選択してください</option>{deploymentOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label><label>{profile.provider}<input value={data.platformProvider} onChange={(event) => onUpdateServer(server.id, 'platformProvider', event.target.value)} placeholder={profile.examples[0]} /></label><label>{profile.location}<input value={data.platformLocation} onChange={(event) => onUpdateServer(server.id, 'platformLocation', event.target.value)} placeholder={profile.examples[1]} /></label><label>{profile.resource}<input value={data.platformResource} onChange={(event) => onUpdateServer(server.id, 'platformResource', event.target.value)} placeholder={profile.examples[2]} /></label><label>{profile.detail}<input value={data.platformDetail} onChange={(event) => onUpdateServer(server.id, 'platformDetail', event.target.value)} placeholder={profile.examples[3]} /></label></div>
        </section>
        <section className="category-section hardware-category">
          <div className="category-heading"><div><span className="category-kicker">CATEGORY 02</span><h3>HW・リソース</h3></div><p>CPU・メモリなどの割当リソース</p></div>
          <div className="resource-row"><label><span>CPU</span><input value={data.cpu} onChange={(event) => onUpdateServer(server.id, 'cpu', event.target.value)} /></label><label><span>メモリ</span><input value={data.memory} onChange={(event) => onUpdateServer(server.id, 'memory', event.target.value)} /></label></div>
        </section>
        <section className="category-section os-category">
          <div className="category-heading"><div><span className="category-kicker">CATEGORY 03</span><h3>OS</h3></div><p>{`${data.osName} ${data.osVersion}`.trim() || '未設定'}</p></div>
          <div className="level-two-fields"><label>ホスト名<input value={data.hostname} onChange={(event) => onUpdateServer(server.id, 'hostname', event.target.value)} /></label><label>IPアドレス<input value={data.ipAddress} onChange={(event) => onUpdateServer(server.id, 'ipAddress', event.target.value)} /></label><label>OS名<input value={data.osName} onChange={(event) => onUpdateServer(server.id, 'osName', event.target.value)} /></label><label>OSバージョン<input value={data.osVersion} onChange={(event) => onUpdateServer(server.id, 'osVersion', event.target.value)} /></label></div>
        </section>
        <section className="category-section middleware-category">
          <div className="category-heading"><div><span className="category-kicker">CATEGORY 04</span><h3>MW・アプリケーション</h3></div><p>クリックしてレベル3の詳細へ</p></div>
          <div className="service-row">
            {data.middleware.length ? data.middleware.map((item) => <div className="service-card-wrap" key={item.id}><button className="service-card" onClick={() => onNavigate({ level: 3, serverId: server.id, middlewareId: item.id })}><span>MW・アプリケーション</span><strong>{item.name || '名称未設定'}</strong><small>{item.runtime || 'ランタイム未設定'}</small><small>{[item.framework, item.executionMethod, item.port].filter(Boolean).join(' / ') || '詳細未設定'}</small></button><button className="remove-service" onClick={() => onDeleteMiddleware(server.id, item.id)} aria-label={`${item.name || 'ミドルウェア'}を削除`}>削除</button></div>) : <div className="service-empty">MW・アプリケーション未登録</div>}
            <button className="add-service" onClick={() => onAddMiddleware(server.id)}>＋ サービスを追加</button>
          </div>
        </section>
        <div className="category-bottom-grid">
          <section className="category-section network-category"><div className="category-heading"><div><span className="category-kicker">CATEGORY 05</span><h3>ネットワーク</h3></div></div><div className="compact-fields"><label>インターフェース<input value="eth0" readOnly /></label><label>管理IP<input value={data.managementIpAddress} onChange={(event) => onUpdateServer(server.id, 'managementIpAddress', event.target.value)} placeholder="未設定" /></label></div></section>
          <section className="category-section storage-category"><div className="category-heading"><div><span className="category-kicker">CATEGORY 06</span><h3>ストレージ・データ</h3></div></div><div className="compact-fields"><label>ディスク<input value={data.disk} onChange={(event) => onUpdateServer(server.id, 'disk', event.target.value)} /></label><label>用途<input value={data.purpose} onChange={(event) => onUpdateServer(server.id, 'purpose', event.target.value)} /></label></div></section>
        </div>
      </section>
    </div>
    <button className="primary parameter-button" onClick={() => onNavigate({ level: 4, serverId: server.id })}>サーバーパラメータを表示</button>
  </section>
}

function DesignNotePanel({ level, description, value, onChange }: { level: string; description: string; value: string; onChange: (value: string) => void }) {
  return <section className="design-note-panel" aria-label={`${level}の設計メモ`}><div><span>DESIGN NOTE / {level}</span><strong>設計メモ</strong><p>{description}</p></div><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} placeholder="例: この構成を選んだ理由、共有したい前提、検討中の事項を記載します。" /></section>
}

function SystemPolicyEditor({ systemPolicy, onChange }: { systemPolicy: SystemPolicy; onChange: (field: keyof SystemPolicy, value: string) => void }) {
  const fields: Array<[keyof SystemPolicy, string, string]> = [
    ['architecturePolicy', '構成方式', '例: ハイブリッド構成 / クラウド優先'],
    ['sharedNetwork', '共通ネットワーク', '例: 社内基幹NW / 共通VPC'],
    ['governance', '管理・運用主体', '例: 情報システム部 / 運用ベンダー'],
    ['availabilityPolicy', '可用性方針', '例: 重要系は冗長化、その他は単一系'],
    ['boundaryPolicy', '外部連携・境界方針', '例: FW経由で外部SaaSと連携'],
    ['notes', '共通メモ', '例: 個別の配置先はレベル2を正とする'],
  ]
  return <div className="infrastructure-editor"><p className="property-intro">部品を選択していない時は、システム共通の方針を編集できます。個々のサーバーやクラウドサービスの配置先はレベル2で管理します。</p><div className="kind-badge infrastructure-badge">レベル1 システム共通方針</div>{fields.map(([field, label, placeholder]) => <label key={field}>{label}<input value={systemPolicy[field]} onChange={(event) => onChange(field, event.target.value)} placeholder={placeholder} /></label>)}</div>
}

function PropertyEditor({ node, nodes, edges, layoutTemplate, onChange, onSelectConnection, onOpenDetails }: { node: Node<DeviceData>; nodes: Node<DeviceData>[]; edges: Edge<ConnectionData>[]; layoutTemplate: LayoutTemplateId; onChange: (field: EditableField, value: string) => void; onSelectConnection: (edgeId: string) => void; onOpenDetails: () => void }) {
  const { data } = node
  const fields: Array<[EditableField, string]> = data.kind === 'server'
    ? [['displayName', '表示名'], ['hostname', 'ホスト名'], ['ipAddress', 'IPアドレス'], ['osName', 'OS名'], ['osVersion', 'OSバージョン'], ['cpu', 'CPU'], ['memory', 'メモリ'], ['disk', 'ディスク'], ['purpose', '用途']]
    : [['displayName', '表示名'], ['managementIpAddress', '管理IPアドレス'], ['purpose', '用途']]
  const connectedEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id)
  const connectedName = (edge: Edge<ConnectionData>) => nodes.find((item) => item.id === (edge.source === node.id ? edge.target : edge.source))?.data.displayName ?? '削除済み部品'
  return <div className="property-form">
    <div className="kind-badge" style={{ color: kindColors[data.kind], borderColor: kindColors[data.kind] }}>{kindLabels[data.kind]}</div>
    {layoutTemplate !== 'blank' && <label>テンプレート上の配置先<select value={data.layoutSlot || defaultLayoutSlot(layoutTemplate, node)} onChange={(event) => onChange('layoutSlot', event.target.value)}>{layoutSlotOptions(layoutTemplate).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
    {fields.map(([field, label]) => <label key={field}>{label}<input value={data[field]} onChange={(event) => onChange(field, event.target.value)} /></label>)}
    <label>備考<textarea value={data.notes} onChange={(event) => onChange('notes', event.target.value)} rows={3} /></label>
    {data.kind === 'server' && <button type="button" className="detail-button" onClick={onOpenDetails}>詳細・ミドルウェアを編集</button>}
    <section className="connection-summary"><h3>接続先情報</h3>{connectedEdges.length ? <ul>{connectedEdges.map((edge) => <li key={edge.id}><button type="button" onClick={() => onSelectConnection(edge.id)}><strong>{edge.source === node.id ? '→' : '←'} {connectedName(edge)}</strong><small>{edge.data?.connectionType || 'network'} / {edge.source === node.id ? edge.data?.sourceInterface || '接続元IF未設定' : edge.data?.targetInterface || '接続先IF未設定'}</small></button></li>)}</ul> : <p>接続先はありません。キャンバス上のハンドルをドラッグして接続できます。</p>}</section>
  </div>
}

function ConnectionEditor({ edge, nodes, onChange, onChangeHandle, onChangeEndpoint }: { edge: Edge<ConnectionData>; nodes: Node<DeviceData>[]; onChange: (edgeId: string, field: ConnectionField, value: string) => void; onChangeHandle: (edgeId: string, handle: 'sourceHandle' | 'targetHandle', value: string) => void; onChangeEndpoint: (edgeId: string, endpoint: 'source' | 'target', nodeId: string) => void }) {
  const data = { ...defaultConnectionData(), ...edge.data }
  const sourceName = nodes.find((node) => node.id === edge.source)?.data.displayName ?? edge.source
  const targetName = nodes.find((node) => node.id === edge.target)?.data.displayName ?? edge.target
  return <div className="edge-details connection-editor">
    <strong>{sourceName} → {targetName}</strong>
    <p>選択中の線は、線そのものを直接ドラッグして調整できます。横線は上下、縦線は左右へ20pxグリッドに吸着します。ここでは接続する部品と、上下左右の接続支点を変更できます。</p>
    <label>接続元の部品<select value={edge.source} onChange={(event) => onChangeEndpoint(edge.id, 'source', event.target.value)}>{nodes.map((node) => <option key={node.id} value={node.id}>{node.data.displayName}</option>)}</select></label>
    <label>接続元の支点<select value={edge.sourceHandle ?? 'source-right'} onChange={(event) => onChangeHandle(edge.id, 'sourceHandle', event.target.value)}><option value="source-top">上</option><option value="source-right">右</option><option value="source-bottom">下</option><option value="source-left">左</option></select></label>
    <label>接続先の部品<select value={edge.target} onChange={(event) => onChangeEndpoint(edge.id, 'target', event.target.value)}>{nodes.map((node) => <option key={node.id} value={node.id}>{node.data.displayName}</option>)}</select></label>
    <label>接続先の支点<select value={edge.targetHandle ?? 'target-left'} onChange={(event) => onChangeHandle(edge.id, 'targetHandle', event.target.value)}><option value="target-top">上</option><option value="target-right">右</option><option value="target-bottom">下</option><option value="target-left">左</option></select></label>
    <label>接続種別<select value={data.connectionType} onChange={(event) => onChange(edge.id, 'connectionType', event.target.value)}><option value="network">ネットワーク</option><option value="management">管理ネットワーク</option><option value="storage">ストレージ</option><option value="internet">インターネット</option><option value="other">その他</option></select></label>
    <label>接続元インターフェース<input value={data.sourceInterface} onChange={(event) => onChange(edge.id, 'sourceInterface', event.target.value)} placeholder="例: eth0" /></label>
    <label>接続先インターフェース<input value={data.targetInterface} onChange={(event) => onChange(edge.id, 'targetInterface', event.target.value)} placeholder="例: Gi0/1" /></label>
    <label>備考<textarea value={data.notes} onChange={(event) => onChange(edge.id, 'notes', event.target.value)} rows={3} placeholder="例: VLAN 10 / 1Gbps" /></label>
  </div>
}
