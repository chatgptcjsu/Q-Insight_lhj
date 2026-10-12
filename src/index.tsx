import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { renderer } from './renderer'
import statisticsJson from './statistics-data.json'
import boxplotJson from './boxplot-data.json'

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
  run(): Promise<unknown>
}
type AppBindings = { DB: { prepare(query: string): D1Statement } }
type AdminRecord = { pin_hash: string; must_change: number; recovery_hash: string | null }
type AdminSession = { must_change: number }
type AppContext = Context<{ Bindings: AppBindings }>

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

const navigation = (activeId?: string, activePage?: 'inspection' | 'compare') => (
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
        <span class="nav-icon overview-icon">▱</span><span>상자그림 비교</span>
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
      <span><strong>검사 데이터 기준</strong><small>2026.10.07까지 반영</small></span>
    </div>
  </aside>
)

app.get('/', (c) => {
  const totalRecords = machines.reduce((sum, machine) => sum + machine.records, 0)
  const totalFailures = machines.reduce((sum, machine) => sum + machine.failures, 0)
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
          <div class="date-range"><span class="calendar-icon">▣</span>2026.01.01 – 2026.10.07</div>
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
            {machines.map((machine) => (
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
          <div><strong>초지 호기별 검사성적서 요약입니다.</strong><p>월별 통계와 상자그림은 업로드 파일 기준이며, 신규 파일 자동 반영 및 Felt 조건 연계는 다음 단계에서 연결합니다.</p></div>
        </section>
        <footer class="page-footer">품질 데이터 관리 시스템 <span>초기 화면 시안 · 엑셀 데이터 요약</span></footer>
      </main>
    </div>
  )
})

app.get('/machine/:id', (c) => {
  const machine = machines.find((item) => item.id === c.req.param('id'))
  if (!machine) return c.notFound()

  const monthLabels = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월']
  const maxMonthly = Math.max(...machine.monthly)
  const passRate = ((machine.records - machine.failures) / machine.records * 100).toFixed(1)
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
        <section class={`summary-grid detail-summary ${machine.id === '3' ? 'machine-three-summary' : ''}`} aria-label={`${machine.name} 품질 요약`}>
          <article class="summary-card"><div class="summary-label">검사 기록</div><div class="summary-value">{machine.records.toLocaleString('ko-KR')}<span>건</span></div><div class="summary-note"><span class="summary-icon blue">▤</span>업로드된 엑셀 기준</div></article>
          {machine.id !== '3' ? <>
            <article class="summary-card"><div class="summary-label">엑셀 판정 불합격</div><div class="summary-value">{machine.failures}<span>건</span></div><div class="summary-note"><span class={`summary-icon ${machine.failures ? 'coral' : 'green'}`}>{machine.failures ? '!' : '✓'}</span>{machine.failures ? '확인 필요' : '현재 등록된 불합격 없음'}</div></article>
            <article class="summary-card"><div class="summary-label">판정 합격률</div><div class="summary-value">{passRate}<span>%</span></div><div class="summary-note"><span class="summary-icon green">↗</span>판정 기록 기준 · 참고 지표</div></article>
          </> : null}
          <article class="summary-card"><div class="summary-label">최근 검사일</div><div class="summary-value date-value">{machine.latest}</div><div class="summary-note"><span class="summary-icon blue">◷</span>{machine.latestProduct}</div></article>
        </section>
        <div class={`detail-columns ${machine.id === '3' ? 'machine-three-columns' : ''}`}>
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
                    <div class={`chart-bar ${index === 9 ? 'current-month' : ''}`} style={`height:${count ? Math.max(8, Math.round(count / maxMonthly * 150)) : 0}px`}></div>
                    <span class="bar-label">{monthLabels[index]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div class="chart-footnote"><span class="legend-dot"></span>검사 데이터가 있는 월 기준 · 2026년 10월 7일까지</div>
          </section>
          {machine.id !== '3' ? <section class="panel checklist-panel">
            <div class="panel-heading"><div><h2>검사 항목</h2><p>검사성적서에 포함된 대표 항목</p></div><span class="list-icon">≡</span></div>
            <div class="inspection-tags">
              <span>평량</span><span>백색도</span><span>파열강도</span><span>인장강도 MD/CD</span><span>흡수도</span><span>신장율</span><span>두께</span><span>핀홀·반점</span>
            </div>
            <div class="analysis-note"><span class="analysis-note-icon">↗</span><div><strong>통계 분석 화면은 다음 단계에서 연결됩니다.</strong><p>CPK는 품목·검사항목·규격 상하한을 분리해 계산하도록 설계합니다.</p></div></div>
          </section> : null}
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

app.get('/compare', (c) => {
  return c.render(
    <div class="app-shell">
      {navigation(undefined, 'compare')}
      <main class="main-content data-admin-content">
        <header class="topbar"><div class="breadcrumb"><a href="/">전체 현황</a><span class="breadcrumb-divider">/</span><strong>상자그림 비교</strong></div><div class="source-chip"><span class="source-dot"></span>초지345 검사 데이터</div></header>
        <section class="page-heading"><div><p class="eyebrow">COMPARE DISTRIBUTIONS</p><h1>상자그림 비교</h1><p class="page-description">검사 항목·기간·호기와 품명을 골라 여러 분포를 나란히 비교합니다.</p></div></section>
        <section class="panel compare-control-panel">
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
        <section class="panel compare-chart-panel">
          <div class="inspection-panel-heading"><div><h2 id="compare-chart-title">비교 결과</h2><p id="compare-chart-subtitle">선택한 데이터의 중앙값과 사분위 범위를 함께 표시합니다.</p></div><span id="compare-sample-total" class="data-badge">—</span></div>
          <div id="compare-chart" class="compare-chart-area"><div class="compare-empty-state">검사항목·기간·비교 대상을 선택한 뒤 ‘상자그림 비교’를 누르세요.</div></div>
          <div class="boxplot-legend compare-legend"><span><i class="legend-box"></i>25–75 백분위</span><span><i class="legend-median"></i>중앙값</span><span><i class="legend-whisker"></i>수염</span><span><i class="legend-outlier"></i>이상치</span></div>
          <p class="table-disclaimer">표본 수가 적은 품목은 상자그림 해석에 주의하세요. 품명 별칭은 표준 품명으로 묶어 비교합니다.</p>
        </section>
        <footer class="page-footer">품질 데이터 관리 시스템 <span><a href="/inspection">초지345 원본 데이터</a></span></footer>
      </main>
      <script src="/static/compare.js" defer></script>
    </div>
  )
})

export default app
