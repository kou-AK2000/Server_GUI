import { en } from './en'
import { ja, type MessageKey } from './ja'

export type Locale = 'ja' | 'en'
export type { MessageKey }

const dictionaries: Record<Locale, Record<MessageKey, string>> = { ja, en }

export function translate(locale: Locale, key: MessageKey) {
  return dictionaries[locale][key]
}

export function formatMessage(message: string, values: Record<string, string | number>) {
  return message.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`))
}

export function isTranslationKey(value: string): value is MessageKey {
  return value in ja
}
