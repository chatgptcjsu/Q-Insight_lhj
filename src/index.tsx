import { Hono } from 'hono'
import { renderer } from './renderer'

const app = new Hono()
app.use(renderer)

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

const navigation = (activeId?: string) => (
  <aside class="sidebar">
    <a class="brand" href="/" aria-label="품질관리 홈">
      <span class="brand-mark">Q</span>
      <span><strong>Q·INSIGHT</strong><small>공정 품질 관리</small></span>
    </a>
    <div class="nav-caption">품질 현황</div>
    <nav class="machine-nav" aria-label="초지기별 메뉴">
      <a class={`nav-link ${activeId ? '' : 'active'}`} href="/">
        <span class="nav-icon overview-icon">▦</span><span>전체 현황</span>
      </a>
      {machines.map((machine) => (
        <a class={`nav-link ${activeId === machine.id ? 'active' : ''}`} href={`/machine/${machine.id}`}>
          <span class="nav-icon machine-icon">{machine.id}</span><span>{machine.name}</span>
          {machine.failures > 0 ? <span class="nav-alert">{machine.failures}</span> : null}
        </a>
      ))}
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
          <div><strong>현재는 검사성적서의 초지 데이터 기준 화면입니다.</strong><p>CPK·상자수염그래프와 Felt 사용조건 연계는 데이터 기준을 확정한 뒤 단계적으로 연결합니다.</p></div>
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
          <article class="summary-card"><div class="summary-label">엑셀 판정 불합격</div><div class="summary-value">{machine.failures}<span>건</span></div><div class="summary-note"><span class={`summary-icon ${machine.failures ? 'coral' : 'green'}`}>{machine.failures ? '!' : '✓'}</span>{machine.failures ? '확인 필요' : '현재 등록된 불합격 없음'}</div></article>
          <article class="summary-card"><div class="summary-label">판정 합격률</div><div class="summary-value">{passRate}<span>%</span></div><div class="summary-note"><span class="summary-icon green">↗</span>판정 기록 기준 · 참고 지표</div></article>
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
                    <div class={`chart-bar ${index === 9 ? 'current-month' : ''}`} style={`height:${count ? Math.max(8, Math.round(count / maxMonthly * 150)) : 0}px`}></div>
                    <span class="bar-label">{monthLabels[index]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div class="chart-footnote"><span class="legend-dot"></span>검사 데이터가 있는 월 기준 · 2026년 10월 7일까지</div>
          </section>
          <section class="panel checklist-panel">
            <div class="panel-heading"><div><h2>검사 항목</h2><p>검사성적서에 포함된 대표 항목</p></div><span class="list-icon">≡</span></div>
            <div class="inspection-tags">
              <span>평량</span><span>백색도</span><span>파열강도</span><span>인장강도 MD/CD</span><span>흡수도</span><span>신장율</span><span>두께</span><span>핀홀·반점</span>
            </div>
            <div class="analysis-note"><span class="analysis-note-icon">↗</span><div><strong>통계 분석 화면은 다음 단계에서 연결됩니다.</strong><p>CPK는 품목·검사항목·규격 상하한을 분리해 계산하도록 설계합니다.</p></div></div>
          </section>
        </div>
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

export default app
