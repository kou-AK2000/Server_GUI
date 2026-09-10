import { useMemo, useRef, useState } from 'react'
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faBox, faCloud, faDatabase, faHardDrive, faNetworkWired, faRoute, faServer, faShieldHalved } from '@fortawesome/free-solid-svg-icons'

type DeviceKind = 'server' | 'l2-switch' | 'router' | 'firewall' | 'custom'
type IconKey = 'server' | 'network' | 'router' | 'shield' | 'database' | 'storage' | 'cloud' | 'box'
type EditableField = 'displayName' | 'hostname' | 'ipAddress' | 'osName' | 'osVersion' | 'cpu' | 'memory' | 'disk' | 'purpose' | 'managementIpAddress' | 'notes'
type Middleware = { id: string; name: string; version: string; port: string; configurationNote: string }
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
  middleware: Middleware[]
  iconKey: IconKey
  color: string
}

type Selection = { type: 'node'; id: string } | { type: 'edge'; id: string } | null
type Validation = { severity: 'warning' | 'info'; message: string; nodeIds: string[] }
type ConnectionData = { connectionType: string; sourceInterface: string; targetInterface: string; notes: string }
type ConnectionField = keyof ConnectionData
type StoredProject = { schemaVersion: '1.1'; id: string; name: string; nodes: Node<DeviceData>[]; edges: Edge<ConnectionData>[]; updatedAt: string }

const browserStorageKey = 'server-design-gui.projects.v1'

const kindLabels: Record<DeviceKind, string> = {
  server: 'サーバー',
  'l2-switch': 'L2スイッチ',
  router: 'ルーター',
  firewall: 'ファイアウォール',
  custom: 'カスタム部品',
}

const kindColors: Record<DeviceKind, string> = {
  server: '#2563eb',
  'l2-switch': '#0f766e',
  router: '#7c3aed',
  firewall: '#dc2626',
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
  'l2-switch': 'network',
  router: 'router',
  firewall: 'shield',
  custom: 'box',
}

function iconFor(data: Pick<DeviceData, 'kind'> & Partial<Pick<DeviceData, 'iconKey'>>) {
  return iconDefinitions[data.iconKey ?? defaultIcon[data.kind]]
}

function deviceData(kind: DeviceKind, displayName: string, values: Partial<DeviceData> = {}): DeviceData {
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
    middleware: [],
    iconKey: defaultIcon[kind],
    color: kindColors[kind],
    ...values,
  }
}

const initialNodes: Node<DeviceData>[] = [
  {
    id: 'web01',
    type: 'device',
    position: { x: 90, y: 120 },
    data: deviceData('server', 'Webサーバー', { hostname: 'web01', ipAddress: '192.168.10.11', osName: 'RHEL', osVersion: '9.6', cpu: '4 vCPU', memory: '8 GB', disk: '100 GB', purpose: 'Webサーバー', middleware: [{ id: 'nginx-web01', name: 'Nginx', version: '1.24', port: '80, 443', configurationNote: 'TLS終端と静的コンテンツ配信' }, { id: 'php-fpm-web01', name: 'PHP-FPM', version: '8.3', port: '9000', configurationNote: 'Webアプリケーション実行' }] }),
    style: { borderColor: kindColors.server },
  },
  {
    id: 'app01',
    type: 'device',
    position: { x: 390, y: 120 },
    data: deviceData('server', 'APサーバー', { hostname: 'app01', ipAddress: '192.168.20.11', osName: 'RHEL', osVersion: '9.6', cpu: '4 vCPU', memory: '8 GB', disk: '100 GB', purpose: 'アプリケーションサーバー', middleware: [{ id: 'java-app01', name: 'Java Runtime', version: '21', port: '8080', configurationNote: 'アプリケーション実行環境' }] }),
    style: { borderColor: kindColors.server },
  },
  {
    id: 'db01',
    type: 'device',
    position: { x: 690, y: 120 },
    data: deviceData('server', 'DBサーバー', { hostname: 'db01', ipAddress: '192.168.30.11', osName: 'RHEL', osVersion: '9.6', cpu: '8 vCPU', memory: '16 GB', disk: '200 GB', purpose: 'データベースサーバー', middleware: [{ id: 'postgres-db01', name: 'PostgreSQL', version: '16', port: '5432', configurationNote: '業務データベース' }] }),
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
  { id: 'web-sw', source: 'web01', target: 'sw01', type: 'smoothstep', data: defaultConnectionData() },
  { id: 'app-sw', source: 'app01', target: 'sw01', type: 'smoothstep', data: defaultConnectionData() },
  { id: 'db-sw', source: 'db01', target: 'sw01', type: 'smoothstep', data: defaultConnectionData() },
  { id: 'sw-router', source: 'sw01', target: 'router01', type: 'smoothstep', data: defaultConnectionData() },
]

function DeviceNode({ data }: NodeProps) {
  const device = data as DeviceData
  const color = device.color ?? kindColors[device.kind]
  return <div className="device-node" style={{ borderColor: color }}>
    <Handle type="target" position={Position.Left} />
    <FontAwesomeIcon className="node-icon" icon={iconFor(device)} style={{ color }} />
    <div><small>{kindLabels[device.kind]}</small><strong>{device.displayName}</strong></div>
    <Handle type="source" position={Position.Right} />
  </div>
}

const nodeTypes = { device: DeviceNode }

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

function normalizeNodes(nodes: Node<DeviceData>[]) {
  return nodes.map((node) => {
    const data = node.data
    const kind = data.kind in kindLabels ? data.kind : 'custom'
    const normalized = deviceData(kind, data.displayName ?? data.label ?? kindLabels[kind], data)
    return { ...node, type: 'device', data: normalized, style: { ...node.style, borderColor: normalized.color } }
  })
}

function normalizeEdges(edges: Edge<ConnectionData>[]) {
  return edges.map((edge) => ({ ...edge, type: edge.type ?? 'smoothstep', data: { ...defaultConnectionData(), ...edge.data } }))
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
  const [showCustomCreator, setShowCustomCreator] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customIcon, setCustomIcon] = useState<IconKey>('box')
  const [customColor, setCustomColor] = useState('#475569')
  const [projectId, setProjectId] = useState<string>(() => crypto.randomUUID())
  const [projectName, setProjectName] = useState('新しいシステム')
  const [savedProjects, setSavedProjects] = useState<StoredProject[]>(readBrowserProjects)
  const [showProjectLibrary, setShowProjectLibrary] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const selectedNode = selection?.type === 'node' ? nodes.find((node) => node.id === selection.id) : undefined
  const selectedEdge = selection?.type === 'edge' ? edges.find((edge) => edge.id === selection.id) : undefined
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

  const addDevice = (kind: DeviceKind) => {
    const id = crypto.randomUUID()
    const name = kindLabels[kind]
    const count = nodes.filter((node) => node.data.kind === kind).length + 1
    const displayName = `${name}${count}`
    setNodes((current) => [
      ...current,
      {
        id,
        type: 'device',
        position: { x: 220 + ((current.length * 45) % 360), y: 470 + ((current.length * 35) % 120) },
        data: deviceData(kind, displayName),
        style: { borderColor: kindColors[kind] },
      },
    ])
    setSelection({ type: 'node', id })
  }

  const addCustomDevice = () => {
    const id = crypto.randomUUID()
    const displayName = customName.trim() || 'カスタム部品'
    setNodes((current) => [
      ...current,
      {
        id,
        type: 'device',
        position: { x: 220 + ((current.length * 45) % 360), y: 470 + ((current.length * 35) % 120) },
        data: deviceData('custom', displayName, { iconKey: customIcon, color: customColor }),
      },
    ])
    setSelection({ type: 'node', id })
    setCustomName('')
    setShowCustomCreator(false)
  }

  const updateServer = (serverId: string, field: EditableField, value: string) => {
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

  const updateMiddleware = (serverId: string, middlewareId: string, field: MiddlewareField, value: string) => {
    setNodes((current) => current.map((node) => node.id === serverId ? {
      ...node,
      data: { ...node.data, middleware: node.data.middleware.map((item) => item.id === middlewareId ? { ...item, [field]: value } : item) },
    } : node))
  }

  const addMiddleware = (serverId: string) => {
    setNodes((current) => current.map((node) => node.id === serverId ? {
      ...node,
      data: { ...node.data, middleware: [...node.data.middleware, { id: crypto.randomUUID(), name: '', version: '', port: '', configurationNote: '' }] },
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

  const saveProject = () => {
    download(`${projectName || 'server-design-project'}.json`, JSON.stringify({ schemaVersion: '1.1', id: projectId, name: projectName, nodes, edges }, null, 2), 'application/json')
  }

  const saveInBrowser = () => {
    const project: StoredProject = { schemaVersion: '1.1', id: projectId, name: projectName.trim() || '名称未設定のシステム', nodes, edges, updatedAt: new Date().toISOString() }
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
    setNodes(normalizeNodes(project.nodes))
    setEdges(normalizeEdges(project.edges))
    setSelection(null)
    setView({ level: 1 })
    setShowProjectLibrary(false)
    setSaveMessage(`「${project.name}」を開きました。`)
  }

  const createNewProject = () => {
    setProjectId(crypto.randomUUID())
    setProjectName('新しいシステム')
    setNodes([])
    setEdges([])
    setSelection(null)
    setView({ level: 1 })
    setSaveMessage('新しいシステムセットを作成しました。')
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

  const connectionLabel = (edge: Edge<ConnectionData>) => `${nodes.find((node) => node.id === edge.source)?.data.displayName ?? edge.source} → ${nodes.find((node) => node.id === edge.target)?.data.displayName ?? edge.target}`

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">PROTOTYPE / MVP</p>
          <h1>サーバー構築・設計GUIツール</h1>
          <label className="project-name">システム名<input value={projectName} onChange={(event) => { setProjectName(event.target.value); setSaveMessage('') }} placeholder="例: 販売管理システム" /></label>
          <div className="breadcrumb">
            <button onClick={() => setView({ level: 1 })}>レベル1 全体構成図</button>
            {view.level > 1 && <><span>›</span><button onClick={() => viewServer && setView({ level: 2, serverId: viewServer.id })}>{viewServer?.data.displayName} 詳細図</button></>}
            {view.level > 2 && <><span>›</span><span>レベル{view.level}</span></>}
          </div>
        </div>
        <div className="header-actions">
          <button onClick={createNewProject}>新規</button>
          <button onClick={saveInBrowser}>ブラウザ保存</button>
          <button onClick={() => setShowProjectLibrary(true)}>保存済みを開く</button>
          <button onClick={() => fileInput.current?.click()}>JSONを開く</button>
          <button className="primary" onClick={saveProject}>JSON書出し</button>
          <button onClick={exportCsv}>CSV出力</button>
          <input ref={fileInput} className="hidden" type="file" accept="application/json,.json" onChange={openProject} />
        </div>
      </header>

      {saveMessage && <div className="save-message" role="status">{saveMessage}</div>}
      {showProjectLibrary && <section className="project-library panel" role="dialog" aria-label="保存済みシステム">
        <div className="panel-heading"><div><h2>保存済みシステム</h2><p>ブラウザ内に保存した、レベル1〜4を含むシステムセットです。</p></div><button onClick={() => setShowProjectLibrary(false)}>閉じる</button></div>
        {savedProjects.length ? <ul>{savedProjects.map((project) => <li key={project.id}><div><strong>{project.name}</strong><small>{new Date(project.updatedAt).toLocaleString('ja-JP')} / {project.nodes.length} 部品</small></div><button className="primary" onClick={() => openBrowserProject(project)}>開く</button></li>)}</ul> : <div className="empty-state">まだブラウザ内に保存されたシステムはありません。</div>}
        <p className="library-note">この保存領域は、現在のブラウザ・このMacだけで利用できます。共有やバックアップにはJSON書出しを使います。</p>
      </section>}

      {view.level === 1 ? <>
      <section className="workspace">
        <aside className="palette panel">
          <h2>部品一覧</h2>
          <p>クリックして部品を追加</p>
          {(Object.keys(kindLabels).filter((kind) => kind !== 'custom') as DeviceKind[]).map((kind) => (
            <button className="device-button" key={kind} onClick={() => addDevice(kind)}>
              <FontAwesomeIcon className="palette-icon" icon={iconDefinitions[defaultIcon[kind]]} style={{ color: kindColors[kind] }} />
              {kindLabels[kind]}
            </button>
          ))}
          <button className="device-button custom-trigger" onClick={() => setShowCustomCreator((current) => !current)}>
            <FontAwesomeIcon className="palette-icon" icon={faBox} />
            部品を自分で追加
          </button>
          {showCustomCreator && <div className="custom-creator">
            <label>部品名<input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="例: ロードバランサー" /></label>
            <label>アイコン<select value={customIcon} onChange={(event) => setCustomIcon(event.target.value as IconKey)}>{(Object.keys(iconLabels) as IconKey[]).map((key) => <option value={key} key={key}>{iconLabels[key]}</option>)}</select></label>
            <label>色<input className="color-input" type="color" value={customColor} onChange={(event) => setCustomColor(event.target.value)} /></label>
            <button className="primary" onClick={addCustomDevice}>構成図に追加</button>
          </div>}
          <div className="palette-note">部品の接続は、部品に表示されるハンドルをドラッグして作成します。</div>
        </aside>

        <section className="canvas panel" aria-label="構成図キャンバス">
          <div className="canvas-title"><span>全体構成図</span><small>{nodes.length} 部品 / {edges.length} 接続</small></div>
          <div className="flow-wrap">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={(connection: Connection) => setEdges((current) => addEdge({ ...connection, id: crypto.randomUUID(), type: 'smoothstep', data: defaultConnectionData() }, current))}
              onNodeClick={(_, node) => setSelection({ type: 'node', id: node.id })}
              onNodeDoubleClick={(_, node) => {
                if ((node.data as DeviceData).kind === 'server') setView({ level: 2, serverId: node.id })
              }}
              onEdgeClick={(_, edge) => setSelection({ type: 'edge', id: edge.id })}
              nodeTypes={nodeTypes}
              fitView
              deleteKeyCode={null}
            >
              <Background gap={18} size={1} color="#cbd5e1" />
              <Controls />
              <MiniMap nodeColor={(node) => (node.data as DeviceData).color ?? kindColors[(node.data as DeviceData).kind]} zoomable pannable />
            </ReactFlow>
          </div>
        </section>

        <aside className="properties panel">
          <div className="panel-heading"><h2>プロパティ</h2>{selection && <button className="text-button danger" onClick={deleteSelected}>削除</button>}</div>
          {selectedNode ? (
            <PropertyEditor node={selectedNode} nodes={nodes} edges={edges} onChange={updateNode} onSelectConnection={(edgeId) => setSelection({ type: 'edge', id: edgeId })} onOpenDetails={() => selectedNode.data.kind === 'server' && setView({ level: 2, serverId: selectedNode.id })} />
          ) : selectedEdge ? (
            <ConnectionEditor edge={selectedEdge} nodes={nodes} onChange={updateConnection} />
          ) : (
            <div className="empty-state">部品または接続線を選択してください。</div>
          )}
        </aside>
      </section>

      <section className="checks panel">
        <div className="panel-heading">
          <div><h2>チェック結果</h2><p>警告 {validations.filter((item) => item.severity === 'warning').length}件 / 情報 {validations.filter((item) => item.severity === 'info').length}件</p></div>
        </div>
        {validations.length ? <ul>{validations.map((item, index) => <li key={`${item.message}-${index}`} className={item.severity} onClick={() => setSelection({ type: 'node', id: item.nodeIds[0] })}><span>{item.severity === 'warning' ? '警告' : '情報'}</span>{item.message}</li>)}</ul> : <div className="check-success">現在の構成にMVP対象の警告はありません。</div>}
      </section>
      </> : viewServer ? <ScaleView server={viewServer} view={view} onNavigate={setView} onUpdateServer={updateServer} onUpdateMiddleware={updateMiddleware} onAddMiddleware={addMiddleware} onDeleteMiddleware={deleteMiddleware} /> : <section className="scale-screen panel"><h2>対象のサーバーが見つかりません。</h2><button onClick={() => setView({ level: 1 })}>全体構成図へ戻る</button></section>}
    </main>
  )
}

function ScaleView({ server, view, onNavigate, onUpdateServer, onUpdateMiddleware, onAddMiddleware, onDeleteMiddleware }: {
  server: Node<DeviceData>
  view: Exclude<View, { level: 1 }>
  onNavigate: (view: View) => void
  onUpdateServer: (serverId: string, field: EditableField, value: string) => void
  onUpdateMiddleware: (serverId: string, middlewareId: string, field: MiddlewareField, value: string) => void
  onAddMiddleware: (serverId: string) => void
  onDeleteMiddleware: (serverId: string, middlewareId: string) => void
}) {
  const { data } = server
  const selectedMiddleware = view.level === 3 || (view.level === 4 && view.middlewareId)
    ? data.middleware.find((item) => item.id === view.middlewareId)
    : undefined

  if (view.level === 4) {
    const serverFields: Array<[EditableField, string]> = [['displayName', '表示名'], ['hostname', 'ホスト名'], ['ipAddress', 'IPアドレス'], ['osName', 'OS名'], ['osVersion', 'OSバージョン'], ['cpu', 'CPU'], ['memory', 'メモリ'], ['disk', 'ディスク'], ['purpose', '用途'], ['notes', '備考']]
    const middlewareFields: Array<[MiddlewareField, string]> = [['name', 'サービス'], ['version', 'バージョン'], ['port', 'ポート'], ['configurationNote', '設定メモ']]
    return <section className="scale-screen panel">
      <div className="scale-heading"><div><p className="eyebrow">LEVEL 4</p><h2>設定・パラメータ</h2><p>{selectedMiddleware ? `${selectedMiddleware.name} の設定値` : `${data.displayName} の基本パラメータ`}</p></div><button onClick={() => onNavigate({ level: 2, serverId: server.id })}>詳細図へ戻る</button></div>
      <p className="edit-hint">ここで編集した値は、全体構成図・詳細図・一覧・出力へ同時に反映されます。</p>
      <table className="parameter-table"><tbody>{selectedMiddleware ? middlewareFields.map(([field, label]) => <tr key={field}><th>{label}</th><td>{field === 'configurationNote' ? <textarea value={selectedMiddleware[field]} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, field, event.target.value)} rows={3} /> : <input value={selectedMiddleware[field]} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, field, event.target.value)} />}</td></tr>) : serverFields.map(([field, label]) => <tr key={field}><th>{label}</th><td>{field === 'notes' ? <textarea value={data[field]} onChange={(event) => onUpdateServer(server.id, field, event.target.value)} rows={3} /> : <input value={data[field]} onChange={(event) => onUpdateServer(server.id, field, event.target.value)} />}</td></tr>)}</tbody></table>
    </section>
  }

  if (view.level === 3 && selectedMiddleware) {
    return <section className="scale-screen panel">
      <div className="scale-heading"><div><p className="eyebrow">LEVEL 3</p><h2>{selectedMiddleware.name} サービス詳細</h2><p>{data.displayName} / {data.hostname}</p></div><button onClick={() => onNavigate({ level: 2, serverId: server.id })}>サーバー詳細図へ戻る</button></div>
      <div className="service-detail-grid">
        <label>サービス名<input value={selectedMiddleware.name} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'name', event.target.value)} /></label>
        <label>バージョン<input value={selectedMiddleware.version} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'version', event.target.value)} /></label>
        <label>利用ポート<input value={selectedMiddleware.port} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'port', event.target.value)} /></label>
        <label>設定メモ<textarea value={selectedMiddleware.configurationNote} onChange={(event) => onUpdateMiddleware(server.id, selectedMiddleware.id, 'configurationNote', event.target.value)} rows={3} /></label>
      </div>
      <button className="primary parameter-button" onClick={() => onNavigate({ level: 4, serverId: server.id, middlewareId: selectedMiddleware.id })}>パラメータを表示</button>
    </section>
  }

  return <section className="scale-screen panel">
    <div className="scale-heading"><div><p className="eyebrow">LEVEL 2</p><h2>{data.displayName} 詳細図</h2><p>{data.hostname || 'ホスト名未設定'} / {data.ipAddress || 'IP未設定'}</p></div><button onClick={() => onNavigate({ level: 1 })}>全体構成図へ戻る</button></div>
    <div className="server-diagram">
      <section className="server-boundary">
        <div className="server-label">OS: {`${data.osName} ${data.osVersion}`.trim() || '未設定'}</div>
        <div className="level-two-fields"><label>ホスト名<input value={data.hostname} onChange={(event) => onUpdateServer(server.id, 'hostname', event.target.value)} /></label><label>IPアドレス<input value={data.ipAddress} onChange={(event) => onUpdateServer(server.id, 'ipAddress', event.target.value)} /></label><label>OS名<input value={data.osName} onChange={(event) => onUpdateServer(server.id, 'osName', event.target.value)} /></label><label>OSバージョン<input value={data.osVersion} onChange={(event) => onUpdateServer(server.id, 'osVersion', event.target.value)} /></label></div>
        <div className="service-row">
          {data.middleware.length ? data.middleware.map((item) => <div className="service-card-wrap" key={item.id}><button className="service-card" onClick={() => onNavigate({ level: 3, serverId: server.id, middlewareId: item.id })}><span>サービス</span><strong>{item.name || '名称未設定'}</strong><small>{item.port || 'ポート未設定'}</small></button><button className="remove-service" onClick={() => onDeleteMiddleware(server.id, item.id)} aria-label={`${item.name || 'ミドルウェア'}を削除`}>削除</button></div>) : <div className="service-empty">ミドルウェア未登録</div>}
          <button className="add-service" onClick={() => onAddMiddleware(server.id)}>＋ サービスを追加</button>
        </div>
        <div className="resource-row"><label><span>CPU</span><input value={data.cpu} onChange={(event) => onUpdateServer(server.id, 'cpu', event.target.value)} /></label><label><span>メモリ</span><input value={data.memory} onChange={(event) => onUpdateServer(server.id, 'memory', event.target.value)} /></label><label><span>ディスク</span><input value={data.disk} onChange={(event) => onUpdateServer(server.id, 'disk', event.target.value)} /></label></div>
      </section>
      <div className="interface-row"><div>eth0<br /><strong>{data.ipAddress || '未設定'}</strong></div><div>OS / ネットワーク / ストレージ</div></div>
    </div>
    <button className="primary parameter-button" onClick={() => onNavigate({ level: 4, serverId: server.id })}>サーバーパラメータを表示</button>
  </section>
}

function PropertyEditor({ node, nodes, edges, onChange, onSelectConnection, onOpenDetails }: { node: Node<DeviceData>; nodes: Node<DeviceData>[]; edges: Edge<ConnectionData>[]; onChange: (field: EditableField, value: string) => void; onSelectConnection: (edgeId: string) => void; onOpenDetails: () => void }) {
  const { data } = node
  const fields: Array<[EditableField, string]> = data.kind === 'server'
    ? [['displayName', '表示名'], ['hostname', 'ホスト名'], ['ipAddress', 'IPアドレス'], ['osName', 'OS名'], ['osVersion', 'OSバージョン'], ['cpu', 'CPU'], ['memory', 'メモリ'], ['disk', 'ディスク'], ['purpose', '用途']]
    : [['displayName', '表示名'], ['managementIpAddress', '管理IPアドレス'], ['purpose', '用途']]
  const connectedEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id)
  const connectedName = (edge: Edge<ConnectionData>) => nodes.find((item) => item.id === (edge.source === node.id ? edge.target : edge.source))?.data.displayName ?? '削除済み部品'
  return <div className="property-form">
    <div className="kind-badge" style={{ color: kindColors[data.kind], borderColor: kindColors[data.kind] }}>{kindLabels[data.kind]}</div>
    {fields.map(([field, label]) => <label key={field}>{label}<input value={data[field]} onChange={(event) => onChange(field, event.target.value)} /></label>)}
    <label>備考<textarea value={data.notes} onChange={(event) => onChange('notes', event.target.value)} rows={3} /></label>
    {data.kind === 'server' && <button type="button" className="detail-button" onClick={onOpenDetails}>詳細・ミドルウェアを編集</button>}
    <section className="connection-summary"><h3>接続先情報</h3>{connectedEdges.length ? <ul>{connectedEdges.map((edge) => <li key={edge.id}><button type="button" onClick={() => onSelectConnection(edge.id)}><strong>{edge.source === node.id ? '→' : '←'} {connectedName(edge)}</strong><small>{edge.data?.connectionType || 'network'} / {edge.source === node.id ? edge.data?.sourceInterface || '接続元IF未設定' : edge.data?.targetInterface || '接続先IF未設定'}</small></button></li>)}</ul> : <p>接続先はありません。キャンバス上のハンドルをドラッグして接続できます。</p>}</section>
  </div>
}

function ConnectionEditor({ edge, nodes, onChange }: { edge: Edge<ConnectionData>; nodes: Node<DeviceData>[]; onChange: (edgeId: string, field: ConnectionField, value: string) => void }) {
  const data = { ...defaultConnectionData(), ...edge.data }
  const sourceName = nodes.find((node) => node.id === edge.source)?.data.displayName ?? edge.source
  const targetName = nodes.find((node) => node.id === edge.target)?.data.displayName ?? edge.target
  return <div className="edge-details connection-editor">
    <strong>{sourceName} → {targetName}</strong>
    <p>接続線そのものの情報です。ここで変更した内容は、両方の部品の「接続先情報」に反映されます。</p>
    <label>接続種別<select value={data.connectionType} onChange={(event) => onChange(edge.id, 'connectionType', event.target.value)}><option value="network">ネットワーク</option><option value="management">管理ネットワーク</option><option value="storage">ストレージ</option><option value="internet">インターネット</option><option value="other">その他</option></select></label>
    <label>接続元インターフェース<input value={data.sourceInterface} onChange={(event) => onChange(edge.id, 'sourceInterface', event.target.value)} placeholder="例: eth0" /></label>
    <label>接続先インターフェース<input value={data.targetInterface} onChange={(event) => onChange(edge.id, 'targetInterface', event.target.value)} placeholder="例: Gi0/1" /></label>
    <label>備考<textarea value={data.notes} onChange={(event) => onChange(edge.id, 'notes', event.target.value)} rows={3} placeholder="例: VLAN 10 / 1Gbps" /></label>
  </div>
}
