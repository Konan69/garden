export const LABELS = {
  File: 'file',
  Section: 'section',
  Note: 'note',
} as const

export const PROPS = {
  tenantId: 'workspace_id',
  kind: 'kind',
  label: 'label',
  summary: 'summary',
  r2Key: 'r2_key',
  canonicalType: 'canonical_type',
  canonicalValue: 'canonical_value',
  indexed: 'indexed',
  origin: 'origin',
  body: 'body',
} as const

export const VECTOR_PROP = 'embedding'

export const SOURCE_KEY_PROP = 'source_key'

export const EDGES = {
  hasSection: 'HAS_SECTION',
  mentions: 'MENTIONS',
  sameAs: 'SAME_AS',
} as const

export const QUERY = {
  index: 'brain.index',
  read: 'brain.read',
  ensureIndexes: 'brain.ensure_indexes',
  indexStatus: 'brain.index_status',
  search: 'brain.search',
  textSearch: 'brain.text_search',
  vectorSearch: 'brain.vector_search',
  linkSections: 'brain.link_sections',
  sectionsOf: 'brain.sections_of',
  countNodes: 'brain.count_nodes',
} as const
