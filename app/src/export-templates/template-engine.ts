import type { Workbook, Worksheet } from 'exceljs'
import type { ExportRecord, ExportTemplateMapping, ExportTemplateModel, TemplateImage, TemplateImageMapping, TemplateTableMapping } from './types'

const supportedSources = new Set(['servers', 'components', 'ipAddresses', 'connections', 'middleware', 'validationResults'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isCellAddress(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]+[1-9]\d*$/i.test(value)
}

function isPath(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/.test(value)
}

/** Parses untrusted JSON before it is used against a workbook. */
export function parseExportTemplateMapping(value: unknown): ExportTemplateMapping {
  if (!isRecord(value) || value.schemaVersion !== '1.0' || typeof value.templateId !== 'string' || typeof value.templateVersion !== 'string' || !Array.isArray(value.sheets)) {
    throw new Error('template.error.invalidMapping')
  }

  const sheets = value.sheets.map((sheet, index) => {
    if (!isRecord(sheet) || typeof sheet.name !== 'string' || !sheet.name.trim()) throw new Error('template.error.invalidMapping')
    const cells = sheet.cells === undefined ? [] : sheet.cells
    const tables = sheet.tables === undefined ? [] : sheet.tables
    const images = sheet.images === undefined ? [] : sheet.images
    if (!Array.isArray(cells) || !Array.isArray(tables) || !Array.isArray(images)) throw new Error('template.error.invalidMapping')

    cells.forEach((cell, cellIndex) => {
      if (!isRecord(cell) || !isCellAddress(cell.address) || !isPath(cell.value)) throw new Error('template.error.invalidMapping')
    })
    tables.forEach((table, tableIndex) => {
      if (!isRecord(table) || !isCellAddress(table.dataCell) || (table.headerCell !== undefined && !isCellAddress(table.headerCell)) || typeof table.source !== 'string' || !supportedSources.has(table.source) || !Array.isArray(table.columns)) {
        throw new Error('template.error.invalidMapping')
      }
      table.columns.forEach((column, columnIndex) => {
        if (!isRecord(column) || typeof column.header !== 'string' || !isPath(column.value)) throw new Error('template.error.invalidMapping')
      })
    })
    images.forEach((image, imageIndex) => {
      if (!isRecord(image) || typeof image.source !== 'string' || !isCellAddress(image.cell) || typeof image.width !== 'number' || image.width <= 0 || (image.height !== undefined && (typeof image.height !== 'number' || image.height <= 0))) {
        throw new Error('template.error.invalidMapping')
      }
    })
    return { name: sheet.name, cells, tables, images }
  })

  return { schemaVersion: '1.0', templateId: value.templateId, templateVersion: value.templateVersion, sheets }
}

function resolvePath(source: ExportRecord, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => isRecord(value) ? value[key] : undefined, source)
}

function displayValue(value: unknown): string | number | boolean {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return ''
}

function getSheet(workbook: Workbook, name: string): Worksheet {
  const sheet = workbook.getWorksheet(name)
  if (!sheet) throw new Error('template.error.missingSheet')
  return sheet
}

function collectionFor(model: ExportTemplateModel, source: string): ExportRecord[] {
  const value = model[source as keyof ExportTemplateModel]
  return Array.isArray(value) ? value : []
}

function cellCoordinates(address: string) {
  const match = /^([A-Z]+)(\d+)$/i.exec(address)
  if (!match) throw new Error('template.error.invalidMapping')
  const column = match[1].toUpperCase().split('').reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0)
  return { col: column - 1, row: Number(match[2]) - 1 }
}

function writeTable(sheet: Worksheet, mapping: TemplateTableMapping, model: ExportTemplateModel) {
  const dataCell = sheet.getCell(mapping.dataCell)
  if (mapping.headerCell) {
    const header = sheet.getCell(mapping.headerCell)
    mapping.columns.forEach((column, index) => {
      sheet.getCell(header.row, header.col + index).value = column.header
    })
  }
  collectionFor(model, mapping.source).forEach((row, rowIndex) => {
    mapping.columns.forEach((column, columnIndex) => {
      sheet.getCell(dataCell.row + rowIndex, dataCell.col + columnIndex).value = displayValue(resolvePath(row, column.value))
    })
  })
}

function writeImage(workbook: Workbook, sheet: Worksheet, mapping: TemplateImageMapping, images: Record<string, TemplateImage>) {
  const image = images[mapping.source]
  if (!image) throw new Error('template.error.missingImage')
  const imageId = workbook.addImage({ base64: image.base64, extension: 'png' })
  sheet.addImage(imageId, {
    tl: cellCoordinates(mapping.cell),
    ext: { width: mapping.width, height: mapping.height ?? Math.round(mapping.width * image.height / image.width) },
  })
}

/** Applies a safe, declarative mapping to a preformatted .xlsx workbook. */
export function applyExportTemplate(workbook: Workbook, mapping: ExportTemplateMapping, model: ExportTemplateModel, images: Record<string, TemplateImage>) {
  mapping.sheets.forEach((sheetMapping) => {
    const sheet = getSheet(workbook, sheetMapping.name)
    sheetMapping.cells?.forEach((cell) => {
      sheet.getCell(cell.address).value = displayValue(resolvePath(model, cell.value))
    })
    sheetMapping.tables?.forEach((table) => writeTable(sheet, table, model))
    sheetMapping.images?.forEach((image) => writeImage(workbook, sheet, image, images))
  })
}
