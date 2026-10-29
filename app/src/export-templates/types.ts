/**
 * Public data contract supplied to an Excel export template.
 *
 * This deliberately contains only design-document data. It does not expose
 * React Flow coordinates, browser-storage metadata, or executable code.
 */
export type ExportValue = string | number | boolean | null | undefined
export interface ExportRecord {
  [key: string]: ExportValue | string[] | ExportRecord | ExportRecord[]
}

export type ExportTemplateModel = {
  schemaVersion: '1.0'
  generatedAt: string
  project: ExportRecord
  systemPolicy: ExportRecord
  servers: ExportRecord[]
  components: ExportRecord[]
  ipAddresses: ExportRecord[]
  connections: ExportRecord[]
  middleware: ExportRecord[]
  validationResults: ExportRecord[]
}

export type TemplateImage = {
  base64: string
  width: number
  height: number
}

export type TemplateCellMapping = {
  address: string
  value: string
}

export type TemplateTableColumn = {
  header: string
  value: string
}

export type TemplateTableMapping = {
  /** The top-left cell of the heading row, for example A6. */
  headerCell?: string
  /** The top-left cell of the first data row, for example A7. */
  dataCell: string
  source: 'servers' | 'components' | 'ipAddresses' | 'connections' | 'middleware' | 'validationResults'
  columns: TemplateTableColumn[]
}

export type TemplateImageMapping = {
  /** Available initial value: diagrams.level1. More diagram types can be added without changing this format. */
  source: string
  cell: string
  width: number
  height?: number
}

export type TemplateSheetMapping = {
  name: string
  cells?: TemplateCellMapping[]
  tables?: TemplateTableMapping[]
  images?: TemplateImageMapping[]
}

/**
 * Declarative, versioned mapping for an .xlsx template.
 * No script, formula injection, macros, or network access are supported here.
 */
export type ExportTemplateMapping = {
  schemaVersion: '1.0'
  templateId: string
  templateVersion: string
  sheets: TemplateSheetMapping[]
}
