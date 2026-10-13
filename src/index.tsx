import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { renderer } from './renderer'
import statisticsJson from './statistics-data.json'
import boxplotJson from './boxplot-data.json'
import inspectionJson from '../public/static/inspection-data.json'

type StatisticsSectionKey = 'weight' | 'burst' | 'tensile'
type StatisticsRow = {
  category: string
  product: string
  measure: string
  statistic: string
  spec: number | string | null
  average: number | string | null
  months: Array<number | string | null>
}
type StatisticsSection = {
  title: string
  unit: string
  averageLabel: string
  rows: Record<string, StatisticsRow[]>
}
type StatisticsData = {
  sourceSheet: string
  months: string[]
  sections: Record<StatisticsSectionKey, StatisticsSection>
}
type BoxplotMonth = {
  month: string
  n: number
  q1: number | null
  median: number | null
  q3: number | null
  lowerWhisker: number | null
  upperWhisker: number | null
  outliers: number[]
}
type BoxplotEntry = {
  title: string
  product: string
  sourceNames: string[]
  totalCount: number
  months: BoxplotMonth[]
}
type BoxplotSection = {
  title: string
  unit: string
  machines: Record<string, BoxplotEntry[]>
}
type BoxplotData = {
  sourceSheet: string
  quartileMethod: string
  months: string[]
  sections: Record<StatisticsSectionKey, BoxplotSection>
}

const statisticsData = statisticsJson as StatisticsData
const boxplotData = boxplotJson as BoxplotData
const inspectionData = inspectionJson as InspectionDataset
const statisticsTabs: Array<{ key: StatisticsSectionKey; label: string }> = [
  { key: 'weight', label: '평량' },
  { key: 'burst', label: '파열강도' },
  { key: 'tensile', label: '인장강도' },
]
const formatStatistic = (value: number | string | null) => {
  if (value === null || value === '') return '—'
  if (typeof value === 'number') return value.toLocaleString('ko-KR', { maximumFractionDigits: 3 })
  return value
}

type D1Statement = {
  bind(...values: unknown[]): D1Statement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ meta?: { changes?: number } }>
}
type D1Database = {
  prepare(query: string): D1Statement
  batch(statements: D1Statement[]): Promise<Array<{ meta?: { changes?: number } }>>
}
type R2Bucket = {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>
  delete(key: string): Promise<void>
}
type AppBindings = { DB: D1Database; REPORTS: R2Bucket }
type AdminRecord = { pin_hash: string; must_change: number; recovery_hash: string | null }
type AppContext = Context<{ Bindings: AppBindings }>
type StoredReport = { id: string; received_date: string; original_name: string; content_type: string; size_bytes: number; note: string | null; uploaded_at: string; import_status?: string; imported_count?: number; updated_count?: number; duplicate_count?: number; conflict_count?: number; skipped_count?: number; processed_at?: string | null }
type ImportRow = { values: unknown[]; excelRow: number; operation: 'insert' | 'update' }
type InspectionRow = { id: string; excelRow: number; auxiliaryOnly: boolean; values: unknown[] }
type InspectionDataset = { sourceFile: string; sourceSheet: string; headers: Array<{ index: number; label: string }>; rows: InspectionRow[]; rowCount: number; recordCount: number; auxiliaryRowCount: number; asOf: string }
const MAX_REPORT_BYTES = 25 * 1024 * 1024
const ALLOWED_REPORT_TYPES: Record<string, { mime: string; signature: number[] }> = {
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', signature: [0x50, 0x4b, 0x03, 0x04] },
  xls: { mime: 'application/vnd.ms-excel', signature: [0xd0, 0xcf, 0x11, 0xe0] },
  pdf: { mime: 'application/pdf', signature: [0x25, 0x50, 0x44, 0x46] },
}
const isValidReportDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
const getReportKey = (id: string) => `inspection-reports/${id}`
const normalizedDate = (value: unknown) => {
  const text = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
}
const inspectionRecordKey = (values: unknown[]) => {
  const machine = String(values[1] ?? '').trim()
  const date = normalizedDate(values[2])
  const lot = String(values[9] ?? '').trim()
  if (!['초지3', '초지4', '초지5'].includes(machine) || !isValidReportDate(date) || !lot) return null
  const hour = Number(values[5] ?? 0)
  const minute = Number(values[6] ?? 0)
  if (!Number.isInteger(hour) || hour < 0 || hour > 24 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null
  return JSON.stringify([machine, date, hour, minute, lot])
}
const getInspectionDataset = async (db: D1Database): Promise<InspectionDataset> => {
  const result = await db.prepare('SELECT record_key, excel_row, values_json FROM inspection_records ORDER BY inspection_date DESC, excel_row DESC').all<{ record_key: string; excel_row: number; values_json: string }>()
  const rows: InspectionRow[] = result.results.map((record) => ({
    id: record.record_key,
    excelRow: record.excel_row,
    auxiliaryOnly: false,
    values: JSON.parse(record.values_json) as unknown[],
  }))
  const importedKeys = new Set(result.results.map((record) => record.record_key))
  const baseRows = inspectionData.rows.filter((row) => {
    const key = row.auxiliaryOnly ? null : inspectionRecordKey(row.values)
    return !key || !importedKeys.has(key)
  })
  const replacedBaseCount = inspectionData.rows.filter((row) => !row.auxiliaryOnly && importedKeys.has(inspectionRecordKey(row.values) || '')).length
  const asOf = rows.reduce((latest, row) => String(row.values[2] || '') > latest ? String(row.values[2]) : latest, inspectionData.asOf)
  return {
    ...inspectionData,
    rows: [...rows, ...baseRows],
    rowCount: inspectionData.rowCount - replacedBaseCount + rows.length,
    recordCount: inspectionData.recordCount - replacedBaseCount + rows.length,
    auxiliaryRowCount: inspectionData.auxiliaryRowCount,
    asOf,
  }
}
const buildMachineSummary = (machineId: string, dataset: InspectionDataset) => {
  const machineName = `초지${machineId}`
  const rows = dataset.rows.filter((row) => !row.auxiliaryOnly && row.values[1] === machineName && isValidReportDate(String(row.values[2] || '')))
  const monthly = Array(12).fill(0) as number[]
  rows.forEach((row) => { monthly[Number(String(row.values[2]).slice(5, 7)) - 1] += 1 })
  const ordered = [...rows].sort((left, right) => {
    const leftTime = `${left.values[2]}T${String(left.values[5] ?? 0).padStart(2, '0')}:${String(left.values[6] ?? 0).padStart(2, '0')}`
    const rightTime = `${right.values[2]}T${String(right.values[5] ?? 0).padStart(2, '0')}:${String(right.values[6] ?? 0).padStart(2, '0')}`
    return rightTime.localeCompare(leftTime) || right.excelRow - left.excelRow
  })
  const latestRow = ordered[0]
  const base = machines.find((machine) => machine.id === machineId)!
  return {
    ...base,
    records: rows.length,
    failures: rows.filter((row) => String(row.values[36] || '').includes('불합격')).length,
    latest: latestRow ? String(latestRow.values[2]).replaceAll('-', '.') : base.latest,
    latestProduct: latestRow ? String(latestRow.values[10] || '—') : base.latestProduct,
    monthly,
    recent: ordered.slice(0, 4).map((row) => ({
      date: String(row.values[2]).slice(5).replace('-', '.'),
      lot: String(row.values[9] || '—'),
      product: String(row.values[10] || '—'),
      weight: typeof row.values[14] === 'number' ? String(row.values[14]) : '—',
      verdict: String(row.values[36] || '미판정'),
    })),
  }
}

const app = new Hono<{ Bindings: AppBindings }>()
app.use(renderer)

const ADMIN_SESSION_COOKIE = 'qinsight_admin_session'
const ADMIN_SESSION_TTL_MS = 20 * 60 * 1000
const PIN_LOCK_MS = 5 * 60 * 1000
const hashSecret = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`qinsight-admin-v1:${value}`))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
const generateToken = (bytes = 32) => {
  const value = crypto.getRandomValues(new Uint8Array(bytes))
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
const makeRecoveryCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('').match(/.{1,5}/g)!.join('-')
}
const normalizeRecoveryCode = (value: unknown) => String(value ?? '').replace(/[\s-]/g, '').toUpperCase()
const getAdminRecord = (db: AppBindings['DB']) => db.prepare('SELECT pin_hash, must_change, recovery_hash FROM admin_auth WHERE id = 1').first<AdminRecord>()
const getAdminSession = async (c: AppContext) => {
  const token = getCookie(c, ADMIN_SESSION_COOKIE)
  if (!token) return null
  const sessionHash = await hashSecret(token)
  const session = await c.env.DB.prepare('SELECT expires_at FROM admin_sessions WHERE session_hash = ?').bind(sessionHash).first<{ expires_at: number }>()
  if (!session || session.expires_at <= Date.now()) {
    if (session) await c.env.DB.prepare('DELETE FROM admin_sessions WHERE session_hash = ?').bind(sessionHash).run()
    return null
  }
  const admin = await getAdminRecord(c.env.DB)
  return admin ? { admin, sessionHash } : null
}
const startAdminSession = async (c: AppContext) => {
  const token = generateToken()
  const sessionHash = await hashSecret(token)
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS
  await c.env.DB.prepare('INSERT INTO admin_sessions (session_hash, expires_at) VALUES (?, ?)').bind(sessionHash, expiresAt).run()
  setCookie(c, ADMIN_SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'Lax', secure: new URL(c.req.url).protocol === 'https:', maxAge: ADMIN_SESSION_TTL_MS / 1000 })
}
const requestKey = async (c: AppContext) => {
  const address = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'local-preview'
  return hashSecret(address)
}
const checkLocked = async (c: AppContext) => {
  const key = await requestKey(c)
  const row = await c.env.DB.prepare('SELECT locked_until FROM admin_attempts WHERE client_key = ?').bind(key).first<{ locked_until: number }>()
  return row?.locked_until && row.locked_until > Date.now() ? row.locked_until : 0
}
const recordFailedAttempt = async (c: AppContext) => {
  const key = await requestKey(c)
  const current = await c.env.DB.prepare('SELECT attempts FROM admin_attempts WHERE client_key = ?').bind(key).first<{ attempts: number }>()
  const attempts = (current?.attempts || 0) + 1
  const lockedUntil = attempts >= 5 ? Date.now() + PIN_LOCK_MS : 0
  await c.env.DB.prepare('INSERT INTO admin_attempts (client_key, attempts, locked_until) VALUES (?, ?, ?) ON CONFLICT(client_key) DO UPDATE SET attempts = excluded.attempts, locked_until = excluded.locked_until').bind(key, lockedUntil ? 0 : attempts, lockedUntil).run()
  return lockedUntil
}
const clearFailedAttempts = async (c: AppContext) => {
  const key = await requestKey(c)
  await c.env.DB.prepare('DELETE FROM admin_attempts WHERE client_key = ?').bind(key).run()
}
const pinIsValid = (pin: unknown) => typeof pin === 'string' && /^[0-9]{4,12}$/.test(pin)
const hasAdminAccess = async (c: AppContext) => {
  const session = await getAdminSession(c)
  return Boolean(session && !session.admin.must_change)
}

app.get('/api/admin/status', async (c) => {
  const admin = await getAdminRecord(c.env.DB)
  const session = await getAdminSession(c)
  return c.json({ authenticated: Boolean(session && !session.admin.must_change), mustChange: Boolean(session?.admin.must_change), initialSetup: !admin })
})

app.post('/api/admin/login', async (c) => {
  const lockedUntil = await checkLocked(c)
  if (lockedUntil) return c.json({ error: '잠시 잠겼습니다. 5분 후 다시 시도해 주세요.' }, 429)
  const body = await c.req.json<{ pin?: string }>().catch(() => ({} as { pin?: string }))
  const candidate = body.pin || ''
  let admin = await getAdminRecord(c.env.DB)
  if (!admin && candidate === '0000') {
    await c.env.DB.prepare('INSERT OR IGNORE INTO admin_auth (id, pin_hash, must_change) VALUES (1, ?, 1)').bind(await hashSecret('0000')).run()
    admin = await getAdminRecord(c.env.DB)
  }
  if (!admin || await hashSecret(candidate) !== admin.pin_hash) {
    const nextLock = await recordFailedAttempt(c)
    return c.json({ error: nextLock ? 'PIN 입력 오류가 5회 발생해 5분간 잠겼습니다.' : 'PIN이 올바르지 않습니다.' }, nextLock ? 429 : 401)
  }
  await clearFailedAttempts(c)
  await startAdminSession(c)
  return c.json({ authenticated: true, mustChange: Boolean(admin.must_change) })
})

app.post('/api/admin/change-pin', async (c) => {
  const session = await getAdminSession(c)
  if (!session) return c.json({ error: '관리자 확인이 필요합니다.' }, 401)
  const body = await c.req.json<{ currentPin?: string; newPin?: string }>().catch(() => ({} as { currentPin?: string; newPin?: string }))
  if (!pinIsValid(body.newPin) || body.newPin === '0000') return c.json({ error: '새 PIN은 0000이 아닌 숫자 4~12자리로 설정해 주세요.' }, 400)
  if (await hashSecret(body.currentPin || '') !== session.admin.pin_hash) return c.json({ error: '현재 PIN이 올바르지 않습니다.' }, 401)
  const recoveryCode = session.admin.recovery_hash ? null : makeRecoveryCode()
  const newPin = body.newPin as string
  await c.env.DB.prepare('UPDATE admin_auth SET pin_hash = ?, must_change = 0, recovery_hash = COALESCE(recovery_hash, ?) WHERE id = 1')
    .bind(await hashSecret(newPin), recoveryCode ? await hashSecret(recoveryCode.replaceAll('-', '')) : null).run()
  await c.env.DB.prepare('DELETE FROM admin_sessions WHERE session_hash <> ?').bind(session.sessionHash).run()
  return c.json({ success: true, recoveryCode })
})

app.post('/api/admin/recover', async (c) => {
  const lockedUntil = await checkLocked(c)
  if (lockedUntil) return c.json({ error: '잠시 잠겼습니다. 5분 후 다시 시도해 주세요.' }, 429)
  const body = await c.req.json<{ recoveryCode?: string; newPin?: string }>().catch(() => ({} as { recoveryCode?: string; newPin?: string }))
  if (!pinIsValid(body.newPin) || body.newPin === '0000') return c.json({ error: '새 PIN은 0000이 아닌 숫자 4~12자리로 설정해 주세요.' }, 400)
  const admin = await getAdminRecord(c.env.DB)
  const recovery = normalizeRecoveryCode(body.recoveryCode)
  if (!admin?.recovery_hash || await hashSecret(recovery) !== admin.recovery_hash) {
    const nextLock = await recordFailedAttempt(c)
    return c.json({ error: nextLock ? '복구 코드 입력 오류가 5회 발생해 5분간 잠겼습니다.' : '복구 코드가 올바르지 않습니다.' }, nextLock ? 429 : 401)
  }
  const recoveryCode = makeRecoveryCode()
  const newPin = body.newPin as string
  await c.env.DB.prepare('UPDATE admin_auth SET pin_hash = ?, must_change = 0, recovery_hash = ? WHERE id = 1')
    .bind(await hashSecret(newPin), await hashSecret(recoveryCode.replaceAll('-', ''))).run()
  await c.env.DB.prepare('DELETE FROM admin_sessions').run()
  await clearFailedAttempts(c)
  await startAdminSession(c)
  return c.json({ success: true, recoveryCode })
})

app.post('/api/admin/rotate-recovery', async (c) => {
  const session = await getAdminSession(c)
  if (!session || session.admin.must_change) return c.json({ error: '관리자 확인이 필요합니다.' }, 401)
  const body = await c.req.json<{ currentPin?: string }>().catch(() => ({} as { currentPin?: string }))
  if (await hashSecret(body.currentPin || '') !== session.admin.pin_hash) return c.json({ error: '현재 PIN이 올바르지 않습니다.' }, 401)
  const recoveryCode = makeRecoveryCode()
  await c.env.DB.prepare('UPDATE admin_auth SET recovery_hash = ? WHERE id = 1').bind(await hashSecret(recoveryCode.replaceAll('-', ''))).run()
  return c.json({ success: true, recoveryCode })
})

app.post('/api/admin/logout', async (c) => {
  const session = await getAdminSession(c)
  if (session) await c.env.DB.prepare('DELETE FROM admin_sessions WHERE session_hash = ?').bind(session.sessionHash).run()
  deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/' })
  return c.json({ success: true })
})

app.get('/api/inspection-records', async (c) => {
  const result = await c.env.DB.prepare('SELECT record_key, excel_row, values_json FROM inspection_records ORDER BY inspection_date DESC, excel_row DESC').all<{ record_key: string; excel_row: number; values_json: string }>()
  c.header('Cache-Control', 'no-store')
  return c.json({ records: result.results.map((record) => ({ id: record.record_key, excelRow: record.excel_row, auxiliaryOnly: false, values: JSON.parse(record.values_json) })) })
})

app.get('/api/reports', async (c) => {
  if (!await hasAdminAccess(c)) return c.json({ error: '관리자 확인이 필요합니다.' }, 401)
  const result = await c.env.DB.prepare('SELECT id, received_date, original_name, content_type, size_bytes, note, uploaded_at, import_status, imported_count, updated_count, duplicate_count, conflict_count, skipped_count, processed_at FROM inspection_reports ORDER BY received_date DESC, uploaded_at DESC').all<StoredReport>()
  return c.json({ reports: result.results })
})

app.post('/api/reports', async (c) => {
  if (!await hasAdminAccess(c)) return c.json({ error: '관리자 확인이 필요합니다.' }, 401)
  const contentLength = Number(c.req.header('content-length') || 0)
  if (contentLength > MAX_REPORT_BYTES + 20 * 1024 * 1024) return c.json({ error: '파일은 25MB 이하만 첨부할 수 있습니다.' }, 413)
  const body = await c.req.parseBody().catch(() => null)
  const file = body?.file
  const receivedDate = String(body?.receivedDate || '')
  const note = String(body?.note || '').trim().slice(0, 500)
  if (!(file instanceof File) || !file.size) return c.json({ error: '첨부할 검사성적서 파일을 선택해 주세요.' }, 400)
  if (file.size > MAX_REPORT_BYTES) return c.json({ error: '파일은 25MB 이하만 첨부할 수 있습니다.' }, 413)
  if (!isValidReportDate(receivedDate)) return c.json({ error: '수령일을 올바르게 입력해 주세요.' }, 400)
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const format = ALLOWED_REPORT_TYPES[extension]
  if (!format) return c.json({ error: 'Excel (.xlsx, .xls) 또는 PDF 파일만 첨부할 수 있습니다.' }, 415)
  const data = await file.arrayBuffer()
  const bytes = new Uint8Array(data)
  if (!format.signature.every((value, index) => bytes[index] === value)) return c.json({ error: '파일 내용이 확장자와 일치하지 않습니다.' }, 415)
  const id = crypto.randomUUID()
  const objectKey = getReportKey(id)
  const uploadedAt = new Date().toISOString()
  let importRows: ImportRow[] = []
  let requestedDuplicates = 0
  let requestedConflicts = 0
  let requestedSkipped = 0
  let hasImportPayload = false
  let importStatus = 'archive_only'
  if (extension === 'xlsx' || extension === 'xls') {
    try {
      const encodedRows = body?.inspectionRows
      const importPayload = typeof encodedRows === 'string' ? JSON.parse(encodedRows) as { rows?: unknown; duplicateCount?: unknown; conflictCount?: unknown; skippedCount?: unknown } : null
      if (importPayload && Array.isArray(importPayload.rows) && importPayload.rows.length <= 20000) {
        hasImportPayload = true
        importRows = importPayload.rows.filter((row): row is ImportRow => Boolean(row && typeof row === 'object' && Array.isArray((row as ImportRow).values) && (row as ImportRow).values.length === 44 && Number.isInteger((row as ImportRow).excelRow) && ['insert', 'update'].includes((row as ImportRow).operation)))
        requestedSkipped = Math.max(0, Math.min(20000, Number(importPayload.rows.length) - importRows.length))
        requestedDuplicates = Math.max(0, Math.min(20000, Number(importPayload.duplicateCount) || 0))
        requestedConflicts = Math.max(0, Math.min(20000, Number(importPayload.conflictCount) || 0))
        requestedSkipped += Math.max(0, Math.min(20000, Number(importPayload.skippedCount) || 0))
        importStatus = 'imported'
      }
    } catch {
      importRows = []
    }
  }
  try {
    await c.env.REPORTS.put(objectKey, data, { httpMetadata: { contentType: format.mime }, customMetadata: { originalName: file.name, receivedDate } })
    await c.env.DB.prepare('INSERT INTO inspection_reports (id, received_date, original_name, object_key, content_type, size_bytes, note, uploaded_at, import_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, receivedDate, file.name, objectKey, format.mime, file.size, note || null, uploadedAt, importStatus).run()
  } catch {
    await c.env.REPORTS.delete(objectKey).catch(() => {})
    return c.json({ error: '파일 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, 500)
  }

  let importedCount = 0
  let updatedCount = 0
  let conflictCount = requestedConflicts
  let duplicateCount = requestedDuplicates
  let skippedCount = requestedSkipped
  if (hasImportPayload) {
    try {
      const statements: D1Statement[] = []
      const operations: Array<'insert' | 'update'> = []
      for (const row of importRows) {
        const recordKey = inspectionRecordKey(row.values)
        if (!recordKey) { skippedCount += 1; continue }
        const machine = String(row.values[1]).trim()
        const inspectionDate = normalizedDate(row.values[2])
        const values = [...row.values]
        values[0] = `${Number(inspectionDate.slice(5, 7))}월`
        values[2] = inspectionDate
        const insertSql = 'INSERT OR IGNORE INTO inspection_records (record_key, report_id, machine, inspection_date, excel_row, values_json, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        const updateSql = 'INSERT INTO inspection_records (record_key, report_id, machine, inspection_date, excel_row, values_json, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(record_key) DO UPDATE SET report_id = excluded.report_id, machine = excluded.machine, inspection_date = excluded.inspection_date, excel_row = excluded.excel_row, values_json = excluded.values_json, imported_at = excluded.imported_at'
        statements.push(c.env.DB.prepare(row.operation === 'update' ? updateSql : insertSql)
          .bind(recordKey, id, machine, inspectionDate, row.excelRow, JSON.stringify(values), uploadedAt))
        operations.push(row.operation)
      }
      for (let offset = 0; offset < statements.length; offset += 80) {
        const result = await c.env.DB.batch(statements.slice(offset, offset + 80))
        result.forEach((item, index) => {
          const operation = operations[offset + index]
          const changes = item.meta?.changes || 0
          if (operation === 'update') updatedCount += changes
          else importedCount += changes
        })
      }
      duplicateCount += Math.max(0, statements.length - importedCount - updatedCount)
      importStatus = conflictCount || skippedCount ? 'needs_review' : 'imported'
      await c.env.DB.prepare('UPDATE inspection_reports SET import_status = ?, imported_count = ?, updated_count = ?, duplicate_count = ?, conflict_count = ?, skipped_count = ?, processed_at = ? WHERE id = ?')
        .bind(importStatus, importedCount, updatedCount, duplicateCount, conflictCount, skippedCount, new Date().toISOString(), id).run()
    } catch {
      importStatus = 'failed'
      await c.env.DB.prepare('UPDATE inspection_reports SET import_status = ?, imported_count = ?, updated_count = ?, duplicate_count = ?, conflict_count = ?, skipped_count = ?, processed_at = ? WHERE id = ?')
        .bind(importStatus, importedCount, updatedCount, duplicateCount, conflictCount, skippedCount, new Date().toISOString(), id).run()
    }
  } else if (extension === 'xlsx' || extension === 'xls') {
    importStatus = 'archive_only'
    await c.env.DB.prepare('UPDATE inspection_reports SET import_status = ?, duplicate_count = ?, conflict_count = ?, skipped_count = ?, processed_at = ? WHERE id = ?')
      .bind(importStatus, duplicateCount, conflictCount, skippedCount, new Date().toISOString(), id).run()
  }
  return c.json({ success: true, id, importStatus, importedCount, updatedCount, duplicateCount, conflictCount, skippedCount })
})

app.get('/api/reports/:id/download', async (c) => {
  if (!await hasAdminAccess(c)) return c.json({ error: '관리자 확인이 필요합니다.' }, 401)
  const report = await c.env.DB.prepare('SELECT id, original_name, object_key, content_type FROM inspection_reports WHERE id = ?').bind(c.req.param('id')).first<{ id: string; original_name: string; object_key: string; content_type: string }>()
  if (!report) return c.notFound()
  const object = await c.env.REPORTS.get(report.object_key)
  if (!object) return c.notFound()
  const safeAsciiName = [...report.original_name].map((character) => {
    const code = character.charCodeAt(0)
    return code >= 0x20 && code <= 0x7e && character !== '"' && character !== '\\' ? character : '_'
  }).join('')
  return new Response(object.body, { headers: {
    'Content-Type': report.content_type || object.httpMetadata?.contentType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(report.original_name)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } })
})

app.delete('/api/reports/:id', async (c) => {
  if (!await hasAdminAccess(c)) return c.json({ error: '관리자 확인이 필요합니다.' }, 401)
  const report = await c.env.DB.prepare('SELECT object_key, imported_count, updated_count, (SELECT COUNT(*) FROM inspection_records WHERE report_id = inspection_reports.id) AS linked_records FROM inspection_reports WHERE id = ?').bind(c.req.param('id')).first<{ object_key: string; imported_count: number; updated_count: number; linked_records: number }>()
  if (!report) return c.notFound()
  if (report.imported_count > 0 || report.updated_count > 0 || report.linked_records > 0) return c.json({ error: '분석 데이터에 반영된 원본 파일은 삭제할 수 없습니다.' }, 409)
  await c.env.REPORTS.delete(report.object_key)
  await c.env.DB.prepare('DELETE FROM inspection_reports WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ success: true })
})

const machines = [
  {
    id: '3',
    name: '초지 3호기',
    records: 739,
    failures: 0,
    latest: '2026.10.07',
    latestProduct: '대한 2J 16.0',
    monthly: [59, 81, 63, 74, 51, 82, 121, 64, 73, 71],
    recent: [
      { date: '10.07', lot: '261007B629', product: '대한 2J 16.0', weight: '15.39', verdict: '합격' },
      { date: '10.07', lot: '261007B613', product: '대한 2J 16.0', weight: '16.04', verdict: '합격' },
      { date: '10.07', lot: '261007B597', product: '대한 2J 16.0', weight: '15.66', verdict: '합격' },
      { date: '10.07', lot: '261007B581', product: '대한 2J 16.0', weight: '15.84', verdict: '합격' },
    ],
  },
  {
    id: '4',
    name: '초지 4호기',
    records: 1643,
    failures: 2,
    latest: '2026.09.30',
    latestProduct: 'K/T (2겹)',
    monthly: [228, 141, 193, 183, 211, 169, 164, 207, 147, 0],
    recent: [
      { date: '09.30', lot: '260930C020', product: 'K/T (2겹)', weight: '21.56', verdict: '합격' },
      { date: '09.30', lot: '260930C017', product: 'K/T (2겹)', weight: '21.25', verdict: '합격' },
      { date: '09.30', lot: '260930C014', product: 'K/T (2겹)', weight: '샘플없음', verdict: '합격' },
      { date: '09.30', lot: '260930C011', product: 'K/T (2겹)', weight: '22.15', verdict: '합격' },
    ],
  },
  {
    id: '5',
    name: '초지 5호기',
    records: 2158,
    failures: 0,
    latest: '2026.10.07',
    latestProduct: '데코 (일반) 3P (초5)',
    monthly: [246, 228, 243, 239, 247, 238, 213, 242, 205, 57],
    recent: [
      { date: '10.07', lot: '261007D018', product: '데코 (일반) 3P (초5)', weight: '15.15', verdict: '합격' },
      { date: '10.07', lot: '261007D014', product: '데코 (일반) 3P (초5)', weight: '14.93', verdict: '합격' },
      { date: '10.07', lot: '261007D010', product: '데코 (일반) 3P (초5)', weight: '15.08', verdict: '합격' },
      { date: '10.07', lot: '261007D006', product: '데코 (일반) 3P (초5)', weight: '15.09', verdict: '합격' },
    ],
  },
]

const navigation = (activeId?: string, activePage?: 'inspection' | 'compare' | 'reports') => (
  <aside class="sidebar">
    <a class="brand" href="/" aria-label="품질관리 홈">
      <span class="brand-mark">Q</span>
      <span><strong>Q·INSIGHT</strong><small>공정 품질 관리</small></span>
    </a>
    <div class="nav-caption">품질 현황</div>
    <nav class="machine-nav" aria-label="초지기별 메뉴">
      <a class={`nav-link ${activeId || activePage ? '' : 'active'}`} href="/">
        <span class="nav-icon overview-icon">▦</span><span>전체 현황</span>
      </a>
      <a class={`nav-link ${activePage === 'inspection' ? 'active' : ''}`} href="/inspection">
        <span class="nav-icon overview-icon">▤</span><span>초지345 원본</span>
      </a>
      <a class={`nav-link ${activePage === 'compare' ? 'active' : ''}`} href="/compare">
        <span class="nav-icon overview-icon">↗</span><span>품질·FELT 추이</span>
      </a>
      <a class={`nav-link ${activePage === 'reports' ? 'active' : ''}`} href="/reports">
        <span class="nav-icon overview-icon">⇧</span><span>검사성적서 첨부</span>
      </a>
      {machines.map((machine) => (
        <a class={`nav-link ${activeId === machine.id ? 'active' : ''}`} href={`/machine/${machine.id}`}>
          <span class="nav-icon machine-icon">{machine.id}</span><span>{machine.name}</span>
          {machine.failures > 0 ? <span class="nav-alert">{machine.failures}</span> : null}
        </a>
      ))}
      <button type="button" class="admin-entry-button" data-admin-entry aria-label="관리자 메뉴 열기">관리자</button>
    </nav>
    <div class="sidebar-footer">
      <span class="status-dot"></span>
      <span><strong>검사 데이터 기준</strong><small>업로드 데이터 포함</small></span>
    </div>
  </aside>
)

app.get('/', async (c) => {
  const dataset = await getInspectionDataset(c.env.DB)
  const liveMachines = machines.map((machine) => buildMachineSummary(machine.id, dataset))
  const totalRecords = liveMachines.reduce((sum, machine) => sum + machine.records, 0)
  const totalFailures = liveMachines.reduce((sum, machine) => sum + machine.failures, 0)
  const machineDates = dataset.rows.filter((row) => !row.auxiliaryOnly && ['초지3', '초지4', '초지5'].includes(String(row.values[1]))).map((row) => String(row.values[2])).filter((date) => isValidReportDate(date)).sort()
  const latestInspectionDate = machineDates.at(-1) || '2026-10-07'
  const firstInspectionDate = machineDates[0] || '2026-01-01'
  return c.render(
    <div class="app-shell">
      {navigation()}
      <main class="main-content">
        <header class="topbar">
          <div class="breadcrumb"><span>품질관리</span><span class="breadcrumb-divider">/</span><strong>전체 현황</strong></div>
          <div class="source-chip"><span class="source-dot"></span>검사성적서 데이터 · 2026년</div>
        </header>
        <section class="page-heading">
          <div>
            <p class="eyebrow">PAPER MACHINE QUALITY</p>
            <h1>초지 공정 품질 현황</h1>
            <p class="page-description">호기별 검사 기록과 주요 품질 지표를 한곳에서 확인하세요.</p>
          </div>
          <div class="date-range"><span class="calendar-icon">▣</span>{firstInspectionDate.replaceAll('-', '.')} – {latestInspectionDate.replaceAll('-', '.')}</div>
        </section>
        <section class="summary-grid" aria-label="전체 품질 요약">
          <article class="summary-card">
            <div class="summary-label">전체 검사 기록</div>
            <div class="summary-value">{totalRecords.toLocaleString('ko-KR')}<span>건</span></div>
            <div class="summary-note"><span class="summary-icon blue">▤</span>초지 3·4·5호기 누적</div>
          </article>
          <article class="summary-card">
            <div class="summary-label">불합격 기록</div>
            <div class="summary-value">{totalFailures}<span>건</span></div>
            <div class="summary-note"><span class="summary-icon coral">!</span>엑셀 판정값 기준</div>
          </article>
          <article class="summary-card">
            <div class="summary-label">관리 대상 설비</div>
            <div class="summary-value">3<span>대</span></div>
            <div class="summary-note"><span class="summary-icon green">✓</span>초지 3·4·5호기</div>
          </article>
        </section>
        <section class="machine-section">
          <div class="section-heading">
            <div><h2>호기별 품질 현황</h2><p>설비를 선택하면 해당 호기의 검사 기록을 확인할 수 있습니다.</p></div>
            <span class="section-count">3 MACHINES</span>
          </div>
          <div class="machine-grid">
            {liveMachines.map((machine) => (
              <a class="machine-card" href={`/machine/${machine.id}`}>
                <div class="machine-card-top">
                  <span class="machine-symbol">{machine.id}</span>
                  <span class={`machine-state ${machine.failures ? 'has-issue' : ''}`}>
                    <i></i>{machine.failures ? `불합격 ${machine.failures}건` : '특이사항 없음'}
                  </span>
                </div>
                <h3>{machine.name}</h3>
                <p class="machine-subtitle">초지 생산 품질 검사</p>
                <div class="machine-metrics">
                  <div><span>검사 기록</span><strong>{machine.records.toLocaleString('ko-KR')}<small>건</small></strong></div>
                  <div><span>최근 검사일</span><strong class="metric-date">{machine.latest}</strong></div>
                </div>
                <div class="machine-card-bottom">
                  <span>최근 품목 <strong>{machine.latestProduct}</strong></span>
                  <span class="card-arrow" aria-hidden="true">→</span>
                </div>
              </a>
            ))}
          </div>
        </section>
        <section class="insight-strip">
          <div class="insight-mark">i</div>
          <div><strong>검사성적서 업로드 데이터가 자동 반영됩니다.</strong><p>초지345 원본·호기별 검사 건수·월별 품질 추이는 최신 업로드 기준입니다. 사전 계산 통계분석 표와 호기 상세 상자그림은 별도 갱신 대상입니다.</p></div>
        </section>
        <footer class="page-footer">품질 데이터 관리 시스템 <span>초기 화면 시안 · 엑셀 데이터 요약</span></footer>
      </main>
    </div>
  )
})

app.get('/machine/:id', async (c) => {
  const baseMachine = machines.find((item) => item.id === c.req.param('id'))
  if (!baseMachine) return c.notFound()
  const inspectionDataset = await getInspectionDataset(c.env.DB)
  const machine = buildMachineSummary(baseMachine.id, inspectionDataset)

  const monthLabels = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
  const maxMonthly = Math.max(...machine.monthly)
  const requestedSection = c.req.query('section') as StatisticsSectionKey | undefined
  const sectionKey: StatisticsSectionKey = requestedSection && statisticsTabs.some((tab) => tab.key === requestedSection)
    ? requestedSection
    : 'weight'
  const activeStatistics = statisticsData.sections[sectionKey]
  const machineStatistics = activeStatistics.rows[`초지${machine.id}`] ?? []
  const cpkCount = machineStatistics.filter((row) => row.statistic === 'Cpk' && (row.average !== null || row.months.some((value) => value !== null))).length
  const trackedItems = new Set(machineStatistics.filter((row) => row.statistic === '평균').map((row) => `${row.category}|${row.product}|${row.measure}`)).size
  const boxplotSection = boxplotData.sections[sectionKey]
  const availableBoxplots = (boxplotSection.machines[machine.id] ?? []).filter((entry) => entry.months.some((month) => month.n > 0))
  const requestedBoxProduct = c.req.query('boxProduct')
  const activeBoxplot = availableBoxplots.find((entry) => entry.product === requestedBoxProduct) ?? availableBoxplots[0]
  const selectedBoxValues = activeBoxplot?.months.flatMap((month) => [month.lowerWhisker, month.upperWhisker, ...month.outliers]).filter((value): value is number => value !== null) ?? []
  const rawBoxMin = selectedBoxValues.length ? Math.min(...selectedBoxValues) : 0
  const rawBoxMax = selectedBoxValues.length ? Math.max(...selectedBoxValues) : 1
  const boxPadding = rawBoxMax === rawBoxMin ? Math.max(Math.abs(rawBoxMax) * 0.08, 1) : (rawBoxMax - rawBoxMin) * 0.08
  const boxScaleMin = rawBoxMin - boxPadding
  const boxScaleMax = rawBoxMax + boxPadding
  const boxSvgWidth = 760
  const boxPlotTop = 22
  const boxPlotBottom = 244
  const boxPlotLeft = 57
  const boxPlotRight = 740
  const boxPlotHeight = boxPlotBottom - boxPlotTop
  const boxPlotWidth = boxPlotRight - boxPlotLeft
  const boxY = (value: number) => boxPlotBottom - ((value - boxScaleMin) / (boxScaleMax - boxScaleMin)) * boxPlotHeight
  const boxTicks = Array.from({ length: 5 }, (_, index) => boxScaleMin + ((boxScaleMax - boxScaleMin) * index) / 4).reverse()
  const boxSampleCount = activeBoxplot?.months.reduce((sum, month) => sum + month.n, 0) ?? 0
  const boxChartMarks = activeBoxplot?.months.map((month, index) => {
    const x = boxPlotLeft + ((index + 0.5) * boxPlotWidth) / 12
    if (month.n === 0 || month.q1 === null || month.median === null || month.q3 === null || month.lowerWhisker === null || month.upperWhisker === null) {
      return <text class="boxplot-empty-mark" x={x} y={boxPlotBottom + 19} text-anchor="middle">—</text>
    }
    const boxWidth = Math.min(24, boxPlotWidth / 12 * 0.42)
    const boxTop = boxY(month.q3)
    const boxBottom = boxY(month.q1)
    return (
      <g class="boxplot-month">
        <title>{`${month.month} · n=${month.n} · Q1 ${month.q1} · 중앙값 ${month.median} · Q3 ${month.q3} · 이상치 ${month.outliers.length}건`}</title>
        <line class="boxplot-whisker" x1={x} x2={x} y1={boxY(month.upperWhisker)} y2={boxTop} />
        <line class="boxplot-whisker" x1={x} x2={x} y1={boxBottom} y2={boxY(month.lowerWhisker)} />
        <line class="boxplot-cap" x1={x - boxWidth * 0.32} x2={x + boxWidth * 0.32} y1={boxY(month.upperWhisker)} y2={boxY(month.upperWhisker)} />
        <line class="boxplot-cap" x1={x - boxWidth * 0.32} x2={x + boxWidth * 0.32} y1={boxY(month.lowerWhisker)} y2={boxY(month.lowerWhisker)} />
        <rect class="boxplot-box" x={x - boxWidth / 2} y={boxTop} width={boxWidth} height={Math.max(1, boxBottom - boxTop)} rx="3" />
        <line class="boxplot-median" x1={x - boxWidth / 2} x2={x + boxWidth / 2} y1={boxY(month.median)} y2={boxY(month.median)} />
        {month.outliers.map((value) => <circle class="boxplot-outlier" cx={x} cy={boxY(value)} r="2.6"><title>{`${month.month} 이상치: ${value}`}</title></circle>)}
      </g>
    )
  })

  return c.render(
    <div class="app-shell">
      {navigation(machine.id)}
      <main class="main-content">
        <header class="topbar">
          <div class="breadcrumb"><a href="/">전체 현황</a><span class="breadcrumb-divider">/</span><strong>{machine.name}</strong></div>
          <div class="source-chip"><span class="source-dot"></span>검사성적서 데이터 · 2026년</div>
        </header>
        <section class="page-heading detail-heading">
          <div>
            <p class="eyebrow">PAPER MACHINE · LINE {machine.id}</p>
            <h1>{machine.name}<span class="heading-suffix">품질 검사</span></h1>
            <p class="page-description">생산 로트별 검사 현황과 월별 검사 추이를 확인합니다.</p>
          </div>
          <a class="back-link" href="/">← 전체 현황</a>
        </section>
        <section class="summary-grid detail-summary" aria-label={`${machine.name} 품질 요약`}>
          <article class="summary-card"><div class="summary-label">검사 기록</div><div class="summary-value">{machine.records.toLocaleString('ko-KR')}<span>건</span></div><div class="summary-note"><span class="summary-icon blue">▤</span>업로드된 엑셀 기준</div></article>
          <article class="summary-card"><div class="summary-label">최근 검사일</div><div class="summary-value date-value">{machine.latest}</div><div class="summary-note"><span class="summary-icon blue">◷</span>{machine.latestProduct}</div></article>
        </section>
        <div class="detail-columns">
          <section class="panel trend-panel">
            <div class="panel-heading"><div><h2>월별 검사 기록</h2><p>월별 검사 샘플 건수</p></div><span class="panel-unit">건</span></div>
            <div class="chart-area" role="img" aria-label="월별 검사 기록 막대그래프">
              <div class="chart-gridline line-top"><span>{maxMonthly}</span></div>
              <div class="chart-gridline line-middle"><span>{Math.round(maxMonthly / 2)}</span></div>
              <div class="chart-gridline line-bottom"><span>0</span></div>
              <div class="bar-chart">
                {machine.monthly.map((count, index) => (
                  <div class="bar-column">
                    <span class="bar-value">{count || ''}</span>
                    <div class={`chart-bar ${String(inspectionDataset.asOf).slice(5, 7) === String(index + 1).padStart(2, '0') ? 'current-month' : ''}`} style={`height:${count ? Math.max(8, Math.round(count / maxMonthly * 150)) : 0}px`}></div>
                    <span class="bar-label">{monthLabels[index]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div class="chart-footnote"><span class="legend-dot"></span>검사 데이터가 있는 월 기준 · {inspectionDataset.asOf.replaceAll('-', '.')}까지</div>
          </section>

        </div>
        <section class="panel boxplot-panel" aria-label={`${machine.name} ${boxplotSection.title} 상자그림`}>
          <div class="boxplot-header">
            <div>
              <p class="statistics-kicker">BOX & WHISKER · 2026</p>
              <h2>월별 {boxplotSection.title} 상자그림</h2>
              <p>{activeBoxplot ? `${activeBoxplot.title} · ${boxSampleCount.toLocaleString('ko-KR')}개 검사값${activeBoxplot.sourceNames.length > 1 ? ` · 원본 품명 ${activeBoxplot.sourceNames.length}개 통합` : ''}` : '선택한 호기에 표시할 원시 검사값이 없습니다.'}</p>
            </div>
            {availableBoxplots.length > 0 ? <form class="boxplot-controls" action={`/machine/${machine.id}`} method="get">
              <input type="hidden" name="section" value={sectionKey} />
              <label><span>품목</span><select name="boxProduct">
                {availableBoxplots.map((entry) => <option value={entry.product} selected={entry.product === activeBoxplot?.product}>{entry.product}</option>)}
              </select></label>
              <button type="submit">그래프 보기</button>
            </form> : null}
          </div>
          {activeBoxplot ? <>
            <div class="boxplot-legend" aria-label="상자그림 범례">
              <span><i class="legend-box"></i>25–75 백분위</span><span><i class="legend-median"></i>중앙값</span><span><i class="legend-whisker"></i>수염</span><span><i class="legend-outlier"></i>이상치</span>
              <strong>{boxplotSection.unit}</strong>
            </div>
            <div class="boxplot-chart-wrap">
              <svg class="boxplot-chart" viewBox={`0 0 ${boxSvgWidth} 286`} role="img" aria-label={`${machine.name} ${activeBoxplot.product} 월별 ${boxplotSection.title} 상자그림`}>
                {boxTicks.map((tick) => {
                  const y = boxY(tick)
                  return <g class="boxplot-grid"><line x1={boxPlotLeft} x2={boxPlotRight} y1={y} y2={y} /><text x={boxPlotLeft - 10} y={y + 3} text-anchor="end">{formatStatistic(tick)}</text></g>
                })}
                <line class="boxplot-axis" x1={boxPlotLeft} x2={boxPlotRight} y1={boxPlotBottom} y2={boxPlotBottom} />
                {boxChartMarks}
                {boxplotData.months.map((month, index) => {
                  const x = boxPlotLeft + ((index + 0.5) * boxPlotWidth) / 12
                  const sampleCount = activeBoxplot.months[index]?.n ?? 0
                  return <g class="boxplot-labels"><text class="boxplot-month-label" x={x} y={boxPlotBottom + 17} text-anchor="middle">{month}</text><text class="boxplot-count-label" x={x} y={boxPlotBottom + 31} text-anchor="middle">{sampleCount ? `n=${sampleCount}` : ''}</text></g>
                })}
              </svg>
            </div>
            <div class="boxplot-footnote">`초지345`에서 측정값이 있는 모든 품목을 표시합니다. 원본 Excel 차트의 exclusive 사분위수 기준을 적용하고, 월별 표본 수가 4개 미만이면 보간 방식으로 계산합니다. 상자에 마우스를 올리면 Q1·중앙값·Q3·표본 수를 볼 수 있습니다.</div>
          </> : <div class="boxplot-empty-state">현재 파일의 차트 연결 범위에서 이 호기·항목에 해당하는 유효 검사값을 찾지 못했습니다.</div>}
        </section>
        <section class="panel statistics-panel" aria-label={`${machine.name} ${activeStatistics.title} 통계분석`}>
          <div class="statistics-header">
            <div class="panel-heading">
              <div><p class="statistics-kicker">WORKBOOK STATISTICS</p><h2>통계분석 정리 <span>(초지)</span></h2><p>{activeStatistics.title}의 품목별 기준과 월별 통계</p></div>
              <span class="statistics-source">엑셀 시트 연동 시안</span>
            </div>
            <nav class="statistics-tabs" aria-label="통계 항목 선택">
              {statisticsTabs.map((tab) => (
                <a class={`statistics-tab ${sectionKey === tab.key ? 'active' : ''}`} href={`/machine/${machine.id}?section=${tab.key}`}>{tab.label}</a>
              ))}
            </nav>
          </div>
          <div class="statistics-overview">
            <div><span>통계표 행</span><strong>{machineStatistics.length}<small>행</small></strong></div>
            <div><span>품목·유형</span><strong>{trackedItems}<small>개</small></strong></div>
            <div><span>표에 포함된 CPK</span><strong>{cpkCount}<small>항목</small></strong></div>
            <div class="overview-caption"><span class="summary-icon blue">i</span><span>값은 업로드된 엑셀 시트에 저장된 표시값입니다.</span></div>
          </div>
          <div class="statistics-table-wrap">
            <table class="statistics-table">
              <thead><tr>
                <th>지종 / 분류</th><th>품명 / 용도</th>{sectionKey === 'tensile' ? <th>방향</th> : null}
                <th>기준 ({activeStatistics.unit})</th><th>통계</th><th>{activeStatistics.averageLabel}</th>
                {statisticsData.months.map((month) => <th>{month}</th>)}
              </tr></thead>
              <tbody>
                {machineStatistics.map((row) => (
                  <tr class={`statistics-row ${row.statistic === 'Cpk' ? 'cpk-row' : ''} ${row.statistic === 'σ' ? 'sigma-row' : ''}`}>
                    <td class="category-cell">{row.category || '—'}</td>
                    <td class="product-cell">{row.product || '—'}</td>
                    {sectionKey === 'tensile' ? <td>{row.measure || '—'}</td> : null}
                    <td>{formatStatistic(row.spec)}</td>
                    <td><span class={`stat-type ${row.statistic === 'Cpk' ? 'cpk-type' : row.statistic === 'σ' ? 'sigma-type' : ''}`}>{row.statistic}</span></td>
                    <td class="numeric-cell">{formatStatistic(row.average)}</td>
                    {row.months.map((value) => <td class="numeric-cell">{formatStatistic(value)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="statistics-footnote">
            <span>σ는 엑셀 표기 그대로 표시합니다. CPK가 비어 있는 칸은 원본 시트에 계산값이 없는 경우입니다.</span>
            <span>월별 열은 가로로 스크롤할 수 있습니다.</span>
          </div>
        </section>
        <section class="panel records-panel">
          <div class="panel-heading records-heading"><div><h2>최근 검사 기록</h2><p>업로드된 검사성적서에서 가져온 샘플 기록</p></div><span class="data-badge">엑셀 데이터</span></div>
          <div class="table-scroll"><table>
            <thead><tr><th>검사일</th><th>LOT 번호</th><th>품명</th><th>평량 (g/㎡)</th><th>판정</th></tr></thead>
            <tbody>{machine.recent.map((record) => (
              <tr><td>{record.date}</td><td class="lot-number">{record.lot}</td><td>{record.product}</td><td>{record.weight}</td><td><span class={`verdict ${record.verdict === '불합격' ? 'verdict-fail' : ''}`}>{record.verdict}</span></td></tr>
            ))}</tbody>
          </table></div>
          <p class="table-disclaimer">※ 이 화면은 업로드된 파일의 요약 시안입니다. 본 시스템의 데이터베이스와 실시간 연동된 상태는 아닙니다.</p>
        </section>
        <footer class="page-footer">품질 데이터 관리 시스템 <span><a href="/">초지 호기 선택으로 돌아가기</a></span></footer>
      </main>
    </div>
  )
})

app.get('/inspection', (c) => {
  return c.render(
    <div class="app-shell">
      {navigation(undefined, 'inspection')}
      <main class="main-content inspection-content">
        <header class="topbar">
          <div class="breadcrumb"><a href="/">전체 현황</a><span class="breadcrumb-divider">/</span><strong>초지345 원본 데이터</strong></div>
          <div class="source-chip"><span class="source-dot"></span>검사성적서 · 초지345</div>
        </header>
        <section class="page-heading inspection-heading">
          <div>
            <p class="eyebrow">SOURCE DATA BROWSER</p>
            <h1>초지345 원본 데이터</h1>
            <p class="page-description">엑셀 원본 행을 필터링해 조회하고, 통계적으로 튀는 입력값을 검토합니다.</p>
          </div>
          <div class="date-range"><span class="calendar-icon">▦</span>원본 시트 전체 범위</div>
        </section>
        <section class="inspection-summary" aria-label="초지345 원본 데이터 요약">
          <article class="summary-card"><div class="summary-label">검사 데이터 행</div><div id="inspection-record-count" class="summary-value">불러오는 중</div><div class="summary-note"><span class="summary-icon blue">▤</span>초지345 시트 원본</div></article>
          <article class="summary-card"><div class="summary-label">현재 필터 결과</div><div id="inspection-filtered-count" class="summary-value">—</div><div class="summary-note"><span class="summary-icon blue">⌕</span>필터 조건 적용 후 표시</div></article>
          <article class="summary-card alert-summary-card"><div class="summary-label">확인 필요 후보</div><div id="inspection-alert-count" class="summary-value">—</div><div class="summary-note"><span class="summary-icon coral">!</span>통계적 이상값 후보</div></article>
          <article class="summary-card"><div class="summary-label">검사 항목 열</div><div id="inspection-column-count" class="summary-value">—</div><div class="summary-note"><span class="summary-icon green">✓</span>원본 열 전체 표시</div></article>
        </section>
        <section class="panel inspection-filter-panel" aria-label="원본 검사 데이터 필터">
          <div class="inspection-panel-heading"><div><h2>데이터 필터</h2><p>호기, 월, 품명, 판정 또는 검색어로 원본 행을 찾습니다.</p></div><button type="button" id="reset-inspection-filters" class="quiet-button">조건 초기화</button></div>
          <form id="inspection-filter-form" class="inspection-filters">
            <label><span>생산 호기</span><select id="filter-machine"><option value="">전체 호기</option></select></label>
            <label><span>월</span><select id="filter-month"><option value="">전체 월</option></select></label>
            <label class="product-filter"><span>품명</span><select id="filter-product"><option value="">전체 품명</option></select></label>
            <label><span>판정</span><select id="filter-verdict"><option value="">전체 판정</option></select></label>
            <label><span>행 종류</span><select id="filter-row-type"><option value="inspection">검사 데이터</option><option value="all">전체 사용 행</option><option value="auxiliary">보조 계산 행</option></select></label>
            <label class="search-filter"><span>빠른 검색</span><input id="filter-query" type="search" placeholder="LOT, 검사자, 비고 등" /></label>
            <label class="check-filter"><input id="filter-suspicious-only" type="checkbox" /><span>의심값만 보기</span></label>
            <label><span>페이지당 행</span><select id="filter-page-size"><option value="50">50행</option><option value="100">100행</option><option value="200">200행</option></select></label>
          </form>
          <div class="filter-status"><span id="inspection-filter-description">엑셀 원본 데이터를 읽는 중입니다.</span><span id="inspection-page-status"></span></div>
        </section>
        <section class="panel inspection-alert-panel" aria-label="의심 입력값 검토">
          <div class="inspection-panel-heading alert-panel-heading">
            <div><div class="alert-heading-line"><span class="alert-mark">!</span><h2>확인 필요 후보</h2><span id="unreviewed-alert-badge" class="review-count-badge">계산 중</span></div><p>같은 호기·품명·검사 항목의 분포와 크게 다른 숫자입니다. 자동 수정하지 않으며, 담당자가 확인해야 합니다.</p></div>
            <button id="restore-dismissed-alerts" type="button" class="quiet-button">확인 처리 복구</button>
          </div>
          <div id="inspection-alert-list" class="inspection-alert-list"><div class="inspection-loading">입력값을 확인하고 있습니다.</div></div>
        </section>
        <section class="panel source-table-panel" aria-label="초지345 전체 원본 표">
          <div class="inspection-panel-heading source-table-heading"><div><h2>원본 데이터 표</h2><p>전체 엑셀 열을 유지합니다. 표는 가로·세로 스크롤할 수 있습니다.</p></div><span id="inspection-row-range" class="data-badge">—</span></div>
          <div id="inspection-load-error" class="inspection-load-error" hidden></div>
          <div class="source-table-scroll"><table class="source-data-table"><thead id="inspection-table-head"></thead><tbody id="inspection-table-body"><tr><td colSpan={45} class="inspection-loading">초지345 데이터를 불러오는 중입니다.</td></tr></tbody></table></div>
          <nav class="inspection-pagination" aria-label="원본 표 페이지 이동"><button id="inspection-prev-page" type="button" class="quiet-button">이전</button><span id="inspection-page-label">—</span><button id="inspection-next-page" type="button" class="quiet-button">다음</button></nav>
          <p class="table-disclaimer">알림은 통계적 의심 후보입니다. 올바른 특이값도 있을 수 있으므로 원본 숫자는 바꾸지 않으며, 확인 처리는 현재 브라우저에만 저장되는 시안 동작입니다.</p>
        </section>
        <footer class="page-footer">품질 데이터 관리 시스템 <span><a href="/">전체 현황으로 돌아가기</a></span></footer>
      </main>
      <script src="/static/inspection.js" defer></script>
    </div>
  )
})

app.get('/products', async (c) => {
  const session = await getAdminSession(c)
  if (!session || session.admin.must_change) return c.redirect('/?admin=1')
  return c.render(
    <div class="app-shell">
      {navigation(undefined)}
        <main class="main-content data-admin-content">
        <header class="topbar"><div class="breadcrumb"><a href="/">전체 현황</a><span class="breadcrumb-divider">/</span><strong>품명 관리</strong></div><div class="source-chip"><span class="source-dot"></span>초지345 품목 사전</div></header>
        <section class="page-heading"><div><p class="eyebrow">PRODUCT MASTER</p><h1>표준 품명·별칭 관리</h1><p class="page-description">표기가 다른 같은 제품은 표준 품명으로 연결하고, 신제품은 여기서 등록합니다.</p></div></section>
        <section class="alias-info-strip"><span class="alias-info-icon">i</span><p>원본 품명 표시와 분석용 표준 품명을 각각 수정할 수 있습니다. 변경 표시는 필터·비교에 반영되며, 실제 엑셀 원본 행은 보존됩니다. 품명은 이름이 비슷하다는 이유만으로 자동 병합하지 않습니다.</p></section>
        <details class="panel product-form-panel product-admin-details">
          <summary class="product-admin-summary"><span><strong>관리자 품명 설정</strong><small>표준 품명·별칭과 원본 품명 표시를 수정합니다.</small></span><span class="admin-summary-action">설정 열기</span></summary>
          <div class="product-admin-content">
            <div class="inspection-panel-heading"><div><h2 id="product-form-title">품명 설정</h2><p>표준 품명, 별칭 및 원본 품명 표시를 등록하거나 수정합니다.</p></div><button type="button" id="cancel-product-edit" class="quiet-button" hidden>편집 취소</button></div>
            <form id="product-form" class="product-form">
              <input type="hidden" id="product-edit-key" />
              <label><span>호기</span><select id="product-machine" required><option value="초지3">초지3</option><option value="초지4">초지4</option><option value="초지5">초지5</option></select></label>
              <label class="product-name-field"><span id="product-canonical-label">표준 품명</span><input id="product-canonical" type="text" maxLength={100} placeholder="예: 깨/나 (일반) 2P" required /></label>
              <label id="product-alias-field" class="product-name-field"><span id="product-alias-label">추가할 원본 별칭 (선택)</span><input id="product-alias" type="text" maxLength={100} placeholder="예: 깨/나 (일반) 2P (초3)" /></label>
              <label id="source-name-fixed-field" class="product-name-field" hidden><span>원본 품명 표시 (수정 가능)</span><input id="source-name-fixed" type="text" maxLength={100} required /></label>
              <button type="submit" id="save-product-entry" class="primary-button">품명 등록</button>
            </form>
            <div id="product-manager-status" class="product-manager-status" role="status"></div>
          </div>
        </details>
        <details class="panel admin-security-details">
          <summary class="product-admin-summary"><span><strong>비밀번호 및 복구 설정</strong><small>관리자 PIN 변경과 복구 코드 관리</small></span><span class="admin-summary-action">보안 설정 열기</span></summary>
          <div class="admin-security-actions"><button type="button" class="quiet-button" data-admin-change-pin>비밀번호 변경</button><button type="button" class="quiet-button" data-admin-rotate-recovery>복구 코드 재발급</button><button type="button" class="quiet-button" data-admin-logout>로그아웃</button><p>복구 코드는 비밀번호를 잊었을 때 사용할 수 있습니다. 재발급하면 이전 코드는 폐기됩니다.</p></div>
        </details>
        <section class="panel product-list-panel">
          <div class="inspection-panel-heading product-list-heading"><div><h2>등록된 표준 품명</h2><p>엑셀 원본에서 발견한 품명과 직접 등록한 표준 품명·별칭을 표시합니다.</p></div><label class="product-search"><span>검색</span><input id="product-search" type="search" placeholder="품명 검색" /></label></div>
          <div class="product-list-wrap"><table class="product-list-table"><thead><tr><th>호기</th><th>분석용 표준 품명</th><th>원본 품명 표시</th><th>관리</th></tr></thead><tbody id="product-list-body"><tr><td colSpan={4} class="inspection-loading">품명 사전을 불러오는 중입니다.</td></tr></tbody></table></div>
          <p class="table-disclaimer">품명 관리는 관리자 PIN 확인 후 이용할 수 있습니다. PIN과 복구 코드 검증은 D1에 저장되지만, 품명 변경값은 현재 브라우저 localStorage에 저장됩니다. 실제 엑셀 원본은 보존됩니다.</p>
        </section>
        <footer class="page-footer">품질 데이터 관리 시스템 <span><a href="/compare">상자그림 비교로 이동</a></span></footer>
      </main>
      <script src="/static/products.js" defer></script>
    </div>
  )
})

app.get('/reports', async (c) => {
  if (!await hasAdminAccess(c)) return c.redirect('/?admin=1&next=%2Freports')
  return c.render(
    <div class="app-shell">
      {navigation(undefined, 'reports')}
      <main class="main-content data-admin-content">
        <header class="topbar"><div class="breadcrumb"><a href="/">전체 현황</a><span class="breadcrumb-divider">/</span><strong>검사성적서 첨부</strong></div><div class="source-chip"><span class="source-dot"></span>일일 수령 파일 관리</div></header>
        <section class="page-heading"><div><p class="eyebrow">DAILY INSPECTION REPORTS</p><h1>검사성적서 보관함</h1><p class="page-description">매일 아침 받은 신규·변경 검사성적서를 날짜별로 첨부하고 이전 버전도 함께 보관합니다.</p></div></section>
        <section class="report-info-strip"><span class="alias-info-icon">i</span><p>Excel 파일을 첨부하면 `초지345` 시트의 초지 3·4·5호기 검사행을 읽습니다. 새로운 검사행은 추가하고, 기존 식별정보(호기·검사일·시간·LOT)가 같은 행의 측정값이 바뀌었으면 새 엑셀 값으로 갱신합니다. 새 파일에 없는 기존 기록은 삭제하지 않습니다. 파일 안에서 같은 식별정보가 서로 다르게 반복된 경우만 자동 반영을 보류합니다.</p></section>
        <section class="panel report-upload-panel">
          <div class="inspection-panel-heading"><div><h2>새 성적서 첨부</h2><p>수령일과 간단한 변경 메모를 남기면 이력에서 바로 찾을 수 있습니다.</p></div><span class="data-badge">관리자 전용</span></div>
          <form id="report-upload-form" class="report-upload-form">
            <label><span>수령일</span><input id="report-received-date" name="receivedDate" type="date" required /></label>
            <label class="report-file-field"><span>검사성적서 파일</span><input id="report-file" name="file" type="file" accept=".xlsx,.xls,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /><small>예: 2026 화장지 검사성적서.xlsx · 최대 25MB</small></label>
            <label class="report-note-field"><span>변경 내용 / 메모 (선택)</span><input id="report-note" name="note" type="text" maxLength={500} placeholder="예: 신규 검사 행 추가, 규격 변경" /></label>
            <button id="report-upload-button" type="submit" class="primary-button">성적서 저장</button>
          </form>
          <div id="report-import-preview" class="report-import-preview" role="status" aria-live="polite" hidden></div>
          <div id="report-upload-status" class="report-status" role="status" aria-live="polite"></div>
        </section>
        <section class="panel report-history-panel">
          <div class="inspection-panel-heading"><div><h2>첨부 이력</h2><p>수령일 최신순으로 표시합니다. 파일을 내려받거나 불필요한 항목을 삭제할 수 있습니다.</p></div><button type="button" id="refresh-reports" class="quiet-button">새로고침</button></div>
          <div class="report-table-wrap"><table class="report-table"><thead><tr><th>수령일</th><th>파일명</th><th>메모</th><th>파일 크기</th><th>분석 반영 결과</th><th>등록 시각</th><th>관리</th></tr></thead><tbody id="report-list"><tr><td colSpan={7} class="inspection-loading">첨부 이력을 불러오는 중입니다.</td></tr></tbody></table></div>
          <p class="table-disclaimer">신규 검사행은 초지345 원본 표, 호기별 건수·월별 검사 추이 및 품질 비교·분포 화면에 추가됩니다. 기존 행은 유지됩니다. 호기 상세의 사전 계산 통계표와 월별 상자그림은 새 파일만으로 다시 계산하지 않으며, 변경된 기존 측정값은 덮어쓰지 않고 재확인 대상으로 표시합니다.</p>
        </section>
        <footer class="page-footer">품질 데이터 관리 시스템 <span><a href="/">전체 현황으로 돌아가기</a></span></footer>
      </main>
      <script src="/static/xlsx.full.min.js" defer></script>
      <script src="/static/reports.js" defer></script>
    </div>
  )
})

app.get('/compare', (c) => {
  return c.render(
    <div class="app-shell">
      {navigation(undefined, 'compare')}
      <main class="main-content data-admin-content">
          <header class="topbar"><div class="breadcrumb"><a href="/">전체 현황</a><span class="breadcrumb-divider">/</span><strong>품질·FELT 추이</strong></div><div class="source-chip"><span class="source-dot"></span>초지345 검사 데이터 · 초지5 FELT 운영 기록</div></header>
        <section class="page-heading"><div><p class="eyebrow">QUALITY & FELT TRENDS</p><h1>품질·FELT 추이 비교</h1><p class="page-description">품목별 월 추이와 FELT 교체 주기별 일별 운전조건을 같은 화면에서 살펴봅니다.</p></div></section>
        <nav class="compare-view-tabs" aria-label="비교 보기 선택">
          <button type="button" class="compare-view-tab active" data-compare-view="combined">품질·FELT 함께 보기</button>
          <button type="button" class="compare-view-tab" data-compare-view="quality">품목 품질 추이</button>
          <button type="button" class="compare-view-tab" data-compare-view="felt">FELT 일별 운전조건</button>
          <button type="button" class="compare-view-tab" data-compare-view="distribution">분포 비교</button>
        </nav>
        <section id="quality-trend-panel" class="panel compare-control-panel compare-view-panel">
          <div class="compare-filter-grid trend-filter-grid">
            <label><span>검사항목</span><select id="trend-measure"></select></label>
            <label><span>시작 월</span><select id="trend-start-month"></select></label>
            <label><span>종료 월</span><select id="trend-end-month"></select></label>
            <label><span>월 집계</span><select id="trend-statistic"><option value="average">월평균</option><option value="median">월중앙값</option></select></label>
            <label class="trend-search-filter"><span>품목 검색</span><input id="trend-product-search" type="search" placeholder="품명 검색" /></label>
          </div>
          <div class="compare-target-heading"><div><h2>비교 품목</h2><p>같은 검사항목·단위의 품목을 2~6개 선택하세요.</p></div><span id="trend-target-count" class="data-badge">0개 선택</span></div>
          <div id="trend-target-list" class="compare-target-list"><div class="inspection-loading">품목 목록을 불러오는 중입니다.</div></div>
          <div class="compare-actions"><p id="trend-status" role="status">월별 평균값과 표본 수를 비교합니다.</p><button type="button" id="run-trend-comparison" class="primary-button">월별 추이 보기</button></div>
          <div class="compare-trend-chart-panel">
            <div class="inspection-panel-heading"><div><h2 id="trend-chart-title">월별 품질 추이</h2><p id="trend-chart-subtitle">품목을 선택하고 비교를 실행하세요.</p></div><span id="trend-sample-total" class="data-badge">—</span></div>
            <div id="trend-chart" class="compare-chart-area"><div class="compare-empty-state">검사항목과 품목을 선택한 뒤 ‘월별 추이 보기’를 누르세요.</div></div>
            <div id="trend-legend" class="trend-legend"></div>
          </div>
        </section>
        <section id="felt-trend-panel" class="panel compare-control-panel compare-view-panel">
          <div class="felt-source-notice"><strong>데이터 안내</strong><span>‘1-2’ 시트는 기록 연도 수정 전까지 제외했습니다. 측정값이 없는 예약 날짜는 차트에 표시하지 않습니다.</span></div>
          <div class="compare-filter-grid trend-filter-grid felt-filter-grid">
            <label><span>FELT 주기</span><select id="felt-cycle-select"></select></label>
            <label><span>운전조건</span><select id="felt-metric-select"></select></label>
            <label><span>시작일</span><input id="felt-start-date" type="date" /></label>
            <label><span>종료일</span><input id="felt-end-date" type="date" /></label>
            <label class="felt-sync-option"><input id="felt-sync-quality-period" type="checkbox" checked /><span>품질 월 기간에 맞춤</span></label>
          </div>
          <div class="compare-actions"><p id="felt-trend-status" role="status">일별 측정값과 FELT 교체일을 함께 표시합니다.</p><button type="button" id="run-felt-trend" class="primary-button">일별 추이 보기</button></div>
          <div class="compare-trend-chart-panel">
            <div class="inspection-panel-heading"><div><h2 id="felt-chart-title">FELT 일별 운전조건</h2><p id="felt-chart-subtitle">운전조건을 선택하고 추이를 확인하세요.</p></div><span id="felt-record-count" class="data-badge">—</span></div>
            <div id="felt-chart" class="compare-chart-area"><div class="compare-empty-state">조건을 선택한 뒤 ‘일별 추이 보기’를 누르세요.</div></div>
            <div id="felt-event-list" class="felt-event-list"></div>
            <div class="felt-chart-footnote">빈 날짜는 선으로 연결하지 않고 공백으로 표시합니다. FELT 교체 시점은 세로선으로, 운휴·현장 메모는 아래 이력으로 확인합니다. 엑셀 원본에 단위가 없는 항목은 수치만 표시합니다.</div>
          </div>
        </section>
        <section id="compare-control-panel" class="panel compare-control-panel compare-view-panel" hidden>
          <div class="compare-filter-grid">
            <label><span>검사항목</span><select id="compare-measure"></select></label>
            <label><span>비교 기간</span><select id="compare-period"><option value="all">전체 기간</option><option value="month">월 선택</option><option value="custom">기간 직접 선택</option></select></label>
            <label id="compare-month-wrap"><span>월 선택</span><select id="compare-month"><option value="">전체 월</option></select></label>
            <label id="compare-start-wrap" hidden><span>시작일</span><input id="compare-start-date" type="date" /></label>
            <label id="compare-end-wrap" hidden><span>종료일</span><input id="compare-end-date" type="date" /></label>
          </div>
          <div class="compare-target-heading"><div><h2>비교 대상</h2><p>최소 2개, 최대 6개를 선택하세요. 호기가 달라도 비교할 수 있습니다.</p></div><span id="compare-target-count" class="data-badge">0개 선택</span></div>
          <div id="compare-target-list" class="compare-target-list"><div class="inspection-loading">품목 목록을 불러오는 중입니다.</div></div>
          <div class="compare-actions"><p id="compare-status" role="status">조건을 선택하면 그래프를 표시합니다.</p><button type="button" id="run-comparison" class="primary-button">상자그림 비교</button></div>
        </section>
        <section id="compare-distribution-panel" class="panel compare-chart-panel compare-view-panel" hidden>
          <div class="inspection-panel-heading"><div><h2 id="compare-chart-title">비교 결과</h2><p id="compare-chart-subtitle">선택한 데이터의 중앙값과 사분위 범위를 함께 표시합니다.</p></div><span id="compare-sample-total" class="data-badge">—</span></div>
          <div id="compare-chart" class="compare-chart-area"><div class="compare-empty-state">검사항목·기간·비교 대상을 선택한 뒤 ‘상자그림 비교’를 누르세요.</div></div>
          <div class="boxplot-legend compare-legend"><span><i class="legend-box"></i>25–75 백분위</span><span><i class="legend-median"></i>중앙값</span><span><i class="legend-whisker"></i>수염</span><span><i class="legend-outlier"></i>이상치</span></div>
            <p class="table-disclaimer">분포 비교는 선택한 기간의 검사값을 합쳐 품목별 분포를 보여줍니다. 품명 별칭은 표준 품명으로 묶습니다.</p>
        </section>
        <footer class="page-footer">품질 데이터 관리 시스템 <span><a href="/inspection">초지345 원본 데이터</a></span></footer>
      </main>
          <script src="/static/compare.js" defer></script>
          <script src="/static/compare-trends.js" defer></script>
    </div>
  )
})

export default app
