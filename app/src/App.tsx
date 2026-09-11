import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import {
  addEdge,
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getSmoothStepPath,
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
  useReactFlow,
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
type ConnectionData = { connectionType: string; sourceInterface: string; targetInterface: string; notes: string; waypoint?: { x: number; y: number } }
type ConnectionField = Exclude<keyof ConnectionData, 'waypoint'>
type StoredProject = { schemaVersion: '1.1'; id: string; name: string; nodes: Node<DeviceData>[]; edges: Edge<ConnectionData>[]; updatedAt: string }

const browserStorageKey = 'server-design-gui.projects.v1'
const EdgeActionsContext = createContext<{ updateWaypoint: (edgeId: string, position: { x: number; y: number }) => void } | null>(null)

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
  { id: 'web-sw', source: 'web01', target: 'sw01', type: 'editable', data: defaultConnectionData() },
  { id: 'app-sw', source: 'app01', target: 'sw01', type: 'editable', data: defaultConnectionData() },
  { id: 'db-sw', source: 'db01', target: 'sw01', type: 'editable', data: defaultConnectionData() },
  { id: 'sw-router', source: 'sw01', target: 'router01', type: 'editable', data: defaultConnectionData() },
]

function DeviceNode({ data }: NodeProps) {
  const device = data as DeviceData
  const color = device.color ?? kindColors[device.kind]
  return <div className="device-node" style={{ borderColor: color }}>
    <Handle id="target-top" className="connection-handle" type="target" position={Position.Top} aria-label="上側の接続先" />
    <Handle id="target-left" className="connection-handle" type="target" position={Position.Left} aria-label="左側の接続先" />
    <FontAwesomeIcon className="node-icon" icon={iconFor(device)} style={{ color }} />
    <div><small>{kindLabels[device.kind]}</small><strong>{device.displayName}</strong></div>
    <Handle id="source-right" className="connection-handle" type="source" position={Position.Right} aria-label="右側の接続元" />
    <Handle id="source-bottom" className="connection-handle" type="source" position={Position.Bottom} aria-label="下側の接続元" />
  </div>
}

const nodeTypes = { device: DeviceNode }

function EditableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, style }: EdgeProps<Edge<ConnectionData>>) {
  const actions = useContext(EdgeActionsContext)
  const { screenToFlowPosition } = useReactFlow()
  const [smoothPath, defaultLabelX, defaultLabelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const waypoint = data?.waypoint
  const edgePath = waypoint ? `M ${sourceX},${sourceY} L ${waypoint.x},${waypoint.y} L ${targetX},${targetY}` : smoothPath
  const labelX = waypoint?.x ?? defaultLabelX
  const labelY = waypoint?.y ?? defaultLabelY

  const startWaypointDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const update = (pointerEvent: PointerEvent) => actions?.updateWaypoint(id, screenToFlowPosition({ x: pointerEvent.clientX, y: pointerEvent.clientY }))
    const finish = () => {
      window.removeEventListener('pointermove', update)
      window.removeEventListener('pointerup', finish)
    }
    window.addEventListener('pointermove', update)
    window.addEventListener('pointerup', finish)
  }

  return <><BaseEdge id={id} path={edgePath} style={style} interactionWidth={20} /><EdgeLabelRenderer><div className={selected ? 'edge-waypoint visible nopan nodrag' : 'edge-waypoint nopan nodrag'} style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }} onPointerDown={startWaypointDrag} title="ドラッグして線の経由点を移動" /></EdgeLabelRenderer></>
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
  const [showCustomCreator, setShowCustomCreator] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customIcon, setCustomIcon] = useState<IconKey>('box')
  const [customColor, setCustomColor] = useState('#475569')
  const [isConnectionMode, setIsConnectionMode] = useState(false)
  const [connectionNodeIds, setConnectionNodeIds] = useState<string[]>([])
  const [projectId, setProjectId] = useState<string>(() => crypto.randomUUID())
  const [projectName, setProjectName] = useState('新しいシステム')
  const [savedProjects, setSavedProjects] = useState<StoredProject[]>(readBrowserProjects)
  const [showProjectLibrary, setShowProjectLibrary] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [openMenu, setOpenMenu] = useState<'file' | 'edit' | 'view' | null>(null)
  const [panelWidths, setPanelWidths] = useState({ palette: 200, properties: 272 })
  const [workspaceHeight, setWorkspaceHeight] = useState(544)
  const fileInput = useRef<HTMLInputElement>(null)
  const menuBarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const closeMenuOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Element && !menuBarRef.current?.contains(event.target)) setOpenMenu(null)
    }
    window.addEventListener('pointerdown', closeMenuOnOutsideClick)
    return () => window.removeEventListener('pointerdown', closeMenuOnOutsideClick)
  }, [openMenu])

  useEffect(() => {
    if (!showProjectLibrary) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowProjectLibrary(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showProjectLibrary])

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

  const updateWaypoint = (edgeId: string, position: { x: number; y: number }) => {
    setEdges((current) => current.map((edge) => edge.id === edgeId ? {
      ...edge,
      data: { ...defaultConnectionData(), ...edge.data, waypoint: position },
    } : edge))
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
      sourceHandle: horizontal ? 'source-right' : 'source-bottom',
      targetHandle: horizontal ? 'target-left' : 'target-top',
      type: 'editable',
      data: defaultConnectionData(),
    }])
    setConnectionSelection([])
    setSaveMessage(`${source.data.displayName} → ${target.data.displayName} を接続しました。`)
  }

  const optimizeConnections = (layoutNodes = nodes, resetManualWaypoint = false) => {
    const center = (node: Node<DeviceData>) => ({ x: node.position.x + (node.measured?.width ?? 150) / 2, y: node.position.y + (node.measured?.height ?? 64) / 2 })
    setEdges((current) => current.map((edge) => {
      if (edge.data?.waypoint && !resetManualWaypoint) return edge
      const first = layoutNodes.find((node) => node.id === edge.source)
      const second = layoutNodes.find((node) => node.id === edge.target)
      if (!first || !second) return edge
      const firstCenter = center(first)
      const secondCenter = center(second)
      const horizontal = Math.abs(firstCenter.x - secondCenter.x) >= Math.abs(firstCenter.y - secondCenter.y)
      const source = first
      const target = second
      const sourceTowardRightOrDown = horizontal ? secondCenter.x >= firstCenter.x : secondCenter.y >= firstCenter.y
      return {
        ...edge,
        source: source.id,
        target: target.id,
        sourceHandle: horizontal ? (sourceTowardRightOrDown ? 'source-right' : 'source-bottom') : (sourceTowardRightOrDown ? 'source-bottom' : 'source-right'),
        targetHandle: horizontal ? (sourceTowardRightOrDown ? 'target-left' : 'target-top') : (sourceTowardRightOrDown ? 'target-top' : 'target-left'),
        type: 'editable',
        data: { ...defaultConnectionData(), ...edge.data, waypoint: undefined },
      }
    }))
  }

  const autoArrangeDiagram = () => {
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
    nodes.forEach((node) => {
      const layer = depth.get(node.id) ?? 0
      layers.set(layer, [...(layers.get(layer) ?? []), node])
    })
    const positioned = nodes.map((node) => {
      const layer = depth.get(node.id) ?? 0
      const siblings = [...(layers.get(layer) ?? [])].sort((a, b) => a.position.y - b.position.y || a.data.displayName.localeCompare(b.data.displayName, 'ja'))
      const index = siblings.findIndex((item) => item.id === node.id)
      return { ...node, position: { x: 100 + layer * 300, y: 110 + index * 150 } }
    })
    setNodes(positioned)
    optimizeConnections(positioned, true)
    setConnectionSelection([])
    setSaveMessage('構成図と接続線を自動整列しました。')
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
          </div>}
        </div>
        <div className="menu-group">
          <button className={openMenu === 'edit' ? 'menu-trigger active' : 'menu-trigger'} aria-haspopup="menu" aria-expanded={openMenu === 'edit'} onClick={() => setOpenMenu((current) => current === 'edit' ? null : 'edit')}>編集</button>
          {openMenu === 'edit' && <div className="menu-dropdown" role="menu">
            <button role="menuitem" disabled={!selection} onClick={runMenuAction(deleteSelected)}>選択中の部品・接続を削除</button>
            <span className="menu-divider" />
            <button role="menuitem" disabled={view.level !== 1} onClick={runMenuAction(autoArrangeDiagram)}>構成図を自動整列</button>
            <button role="menuitem" disabled={view.level !== 1} onClick={runMenuAction(() => { optimizeConnections(nodes, true); setSaveMessage('接続線の支点と経路を自動整列しました。') })}>線を自動整列</button>
          </div>}
        </div>
        <div className="menu-group">
          <button className={openMenu === 'view' ? 'menu-trigger active' : 'menu-trigger'} aria-haspopup="menu" aria-expanded={openMenu === 'view'} onClick={() => setOpenMenu((current) => current === 'view' ? null : 'view')}>表示</button>
          {openMenu === 'view' && <div className="menu-dropdown" role="menu">
            <button role="menuitem" onClick={runMenuAction(() => setView({ level: 1 }))}>レベル1 全体構成図</button>
            <button role="menuitem" disabled={view.level !== 1} onClick={runMenuAction(() => setIsConnectionMode((current) => !current))}>{isConnectionMode ? '接続モードを終了' : '接続モードを開始'}</button>
            <span className="menu-divider" />
            <button role="menuitem" disabled={view.level !== 1} onClick={runMenuAction(() => { setPanelWidths({ palette: 200, properties: 272 }); setWorkspaceHeight(544); setSaveMessage('表示領域のサイズを初期値に戻しました。') })}>表示領域のサイズを戻す</button>
          </div>}
        </div>
        <input ref={fileInput} className="hidden" type="file" accept="application/json,.json" onChange={openProject} />
      </nav>

      {saveMessage && <div className="save-message" role="status">{saveMessage}</div>}
      {showProjectLibrary && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowProjectLibrary(false) }}>
        <section className="project-library panel" role="dialog" aria-modal="true" aria-label="保存済みシステム" onMouseDown={(event) => event.stopPropagation()}>
          <div className="panel-heading"><div><h2>保存済みシステム</h2><p>ブラウザ内に保存した、レベル1〜4を含むシステムセットです。</p></div><button onClick={() => setShowProjectLibrary(false)}>閉じる</button></div>
          {savedProjects.length ? <ul>{savedProjects.map((project) => <li key={project.id}><div><strong>{project.name}</strong><small>{new Date(project.updatedAt).toLocaleString('ja-JP')} / {project.nodes.length} 部品</small></div><button className="primary" onClick={() => openBrowserProject(project)}>開く</button></li>)}</ul> : <div className="empty-state">まだブラウザ内に保存されたシステムはありません。</div>}
          <p className="library-note">この保存領域は、現在のブラウザ・このMacだけで利用できます。共有やバックアップにはJSON書出しを使います。</p>
        </section>
      </div>}

      {view.level === 1 ? <>
      <section className="workspace" style={workspaceStyle}>
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

        <div className="panel-resizer" role="separator" aria-label="部品一覧の幅を変更" aria-orientation="vertical" title="ドラッグして部品一覧の幅を変更" onPointerDown={(event) => startPanelResize('palette', event)} />

        <section className="canvas panel" aria-label="構成図キャンバス">
          <div className="canvas-title"><span>全体構成図</span><div className="canvas-actions"><small>{nodes.length} 部品 / {edges.length} 接続</small><button className="auto-layout" onClick={autoArrangeDiagram}>構成図を自動整列</button><button className="auto-layout" onClick={() => { optimizeConnections(nodes, true); setSaveMessage('接続線の支点と経路を自動整列しました。') }}>線を自動整列</button>{connectionNodeIds.length > 0 && <button className={connectionNodeIds.length === 2 ? 'selected-connect active' : 'selected-connect'} disabled={connectionNodeIds.length !== 2} onClick={connectSelectedNodes}>{connectionNodeIds.length === 2 ? '選択した2部品を接続' : `あと${2 - connectionNodeIds.length}部品を選択`}</button>}<button className={isConnectionMode ? 'connection-mode active' : 'connection-mode'} onClick={() => setIsConnectionMode((current) => !current)}>{isConnectionMode ? '接続モード中：支点をドラッグ' : '接続モード'}</button></div></div>
          <div className={isConnectionMode ? 'flow-wrap is-connection-mode' : 'flow-wrap'}>
            <EdgeActionsContext.Provider value={{ updateWaypoint }}><ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStop={(_, movedNode) => {
                const layoutNodes = nodes.map((node) => node.id === movedNode.id ? { ...node, position: movedNode.position, measured: movedNode.measured } : node)
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
              fitView
              deleteKeyCode={null}
            >
              <Background gap={18} size={1} color="#cbd5e1" />
              <Controls />
              <MiniMap nodeColor={(node) => (node.data as DeviceData).color ?? kindColors[(node.data as DeviceData).kind]} zoomable pannable />
            </ReactFlow></EdgeActionsContext.Provider>
          </div>
        </section>

        <div className="panel-resizer" role="separator" aria-label="プロパティの幅を変更" aria-orientation="vertical" title="ドラッグしてプロパティの幅を変更" onPointerDown={(event) => startPanelResize('properties', event)} />

        <aside className="properties panel">
          <div className="panel-heading"><h2>プロパティ</h2>{selection && <button className="text-button danger" onClick={deleteSelected}>削除</button>}</div>
          {selectedNode ? (
            <PropertyEditor node={selectedNode} nodes={nodes} edges={edges} onChange={updateNode} onSelectConnection={selectConnection} onOpenDetails={() => selectedNode.data.kind === 'server' && setView({ level: 2, serverId: selectedNode.id })} />
          ) : selectedEdge ? (
            <ConnectionEditor edge={selectedEdge} nodes={nodes} onChange={updateConnection} />
          ) : (
            <div className="empty-state">部品または接続線を選択してください。</div>
          )}
        </aside>
      </section>

      <div className="workspace-height-resizer" role="separator" aria-label="作業エリアの高さを変更" aria-orientation="horizontal" title="ドラッグして作業エリアの高さを変更" onPointerDown={startWorkspaceHeightResize}><span /></div>

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
