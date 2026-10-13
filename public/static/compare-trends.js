(() => {
  const FELT_DATA_URL = '/static/felt-operations.json'
  const ALIAS_KEY = 'q-insight-product-aliases-v1'
  const COLORS = ['#4268e8', '#43a486', '#d9805f', '#8a6cc4', '#3295aa', '#bf9b3b']
  const MEASURES = [
    { key: 'width', label: '지폭', column: 13, unit: 'mm' },
    { key: 'weight', label: '평량', column: 14, unit: 'g/㎡' },
    { key: 'white', label: '백색도', column: 15, unit: '%' },
    { key: 'burst', label: '파열강도', column: 16, unit: 'mN' },
    { key: 'md1', label: 'MD-1', column: 17, unit: 'gf/100mm' },
    { key: 'md2', label: 'MD-2', column: 18, unit: 'gf/100mm' },
    { key: 'md3', label: 'MD-3', column: 19, unit: 'gf/100mm' },
    { key: 'md4', label: 'MD-4', column: 20, unit: 'gf/100mm' },
    { key: 'md', label: 'MD', column: 21, unit: 'gf/100mm' },
    { key: 'cd', label: 'CD', column: 22, unit: 'gf/100mm' },
    { key: 'wetCd', label: 'wet-CD', column: 23, unit: 'gf/100mm' },
    { key: 'absorb', label: '흡수도', column: 24, unit: 'mm' },
    { key: 'elong1', label: '신1', column: 25, unit: '%' },
    { key: 'elong2', label: '신2', column: 26, unit: '%' },
    { key: 'elong3', label: '신3', column: 27, unit: '%' },
    { key: 'elong4', label: '신4', column: 28, unit: '%' },
    { key: 'elong', label: '신장율2', column: 29, unit: '%' },
    { key: 'thickness', label: '두께', column: 30, unit: 'mm' },
    { key: 'wetDissolve', label: '물풀링성', column: 31, unit: 'sec' },
    { key: 'airPerm', label: '투기도', column: 32, unit: 'cc/㎠/sec' },
    { key: 'md3ply', label: 'MD(3겹)', column: 38, unit: 'gf/100mm' },
    { key: 'cd3ply', label: 'CD(3겹)', column: 39, unit: 'gf/100mm' },
    { key: 'md3ply2', label: 'MD(3겹)2', column: 40, unit: 'gf/100mm' },
    { key: 'cd3ply3', label: 'CD(3겹)3', column: 41, unit: 'gf/100mm' },
  ]
  const METRICS = [
    { key: 'speed', label: '선속', unit: '' },
    { key: 'basisWeight', label: '평량', unit: '' },
    { key: 'sRoll', label: 'S/Roll', unit: 'KPa' },
    { key: 'nipKnPerM', label: 'NIP', unit: 'KN/m' },
    { key: 'blowerKpa', label: 'Turbo Blower 압력', unit: 'KPa' },
    { key: 'blowerMeasure1', label: 'Turbo Blower 측정값 #1', unit: '' },
    { key: 'blowerAmp', label: 'Turbo Blower AMP', unit: 'AMP' },
    { key: 'feltKpa1', label: 'FELT 압력 #1', unit: 'KPa' },
    { key: 'feltKpa2', label: 'FELT 압력 #2', unit: 'KPa' },
    { key: 'highPressureShower', label: '고압샤워', unit: '' },
    { key: 'hoodWet', label: 'HOOD 온도 wet', unit: '' },
    { key: 'hoodDry', label: 'HOOD 온도 dry', unit: '' },
    { key: 'steamBar', label: '스팀', unit: 'Bar' },
  ]
  const ui = {
    tabs: [...document.querySelectorAll('[data-compare-view]')],
    panels: {
      quality: document.getElementById('quality-trend-panel'),
      felt: document.getElementById('felt-trend-panel'),
      distribution: document.getElementById('compare-control-panel'),
      distributionChart: document.getElementById('compare-distribution-panel'),
    },
    qualityMeasure: document.getElementById('trend-measure'),
    qualityStartMonth: document.getElementById('trend-start-month'),
    qualityEndMonth: document.getElementById('trend-end-month'),
    qualityStatistic: document.getElementById('trend-statistic'),
    qualitySearch: document.getElementById('trend-product-search'),
    qualityTargets: document.getElementById('trend-target-list'),
    qualityCount: document.getElementById('trend-target-count'),
    qualityStatus: document.getElementById('trend-status'),
    qualityRun: document.getElementById('run-trend-comparison'),
    qualityChart: document.getElementById('trend-chart'),
    qualityTitle: document.getElementById('trend-chart-title'),
    qualitySubtitle: document.getElementById('trend-chart-subtitle'),
    qualityTotal: document.getElementById('trend-sample-total'),
    qualityLegend: document.getElementById('trend-legend'),
    feltCycle: document.getElementById('felt-cycle-select'),
    feltMetric: document.getElementById('felt-metric-select'),
    feltStart: document.getElementById('felt-start-date'),
    feltEnd: document.getElementById('felt-end-date'),
    feltSyncQuality: document.getElementById('felt-sync-quality-period'),
    feltStatus: document.getElementById('felt-trend-status'),
    feltRun: document.getElementById('run-felt-trend'),
    feltChart: document.getElementById('felt-chart'),
    feltTitle: document.getElementById('felt-chart-title'),
    feltSubtitle: document.getElementById('felt-chart-subtitle'),
    feltCount: document.getElementById('felt-record-count'),
    feltEvents: document.getElementById('felt-event-list'),
  }
  let inspectionDataset = null
  let feltDataset = null
  let aliases = new Map()
  let sourceRenames = []
  let qualityTargets = []
  let qualityMonths = []

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
  }

  function formatNumber(value, maximumFractionDigits = 2) {
    return value === null || value === undefined || !Number.isFinite(value)
      ? '—'
      : value.toLocaleString('ko-KR', { maximumFractionDigits })
  }

  function setView(view) {
    const combined = view === 'combined'
    ui.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.compareView === view))
    ui.panels.quality.hidden = !combined && view !== 'quality'
    ui.panels.felt.hidden = !combined && view !== 'felt'
    ui.panels.distribution.hidden = view !== 'distribution'
    ui.panels.distributionChart.hidden = view !== 'distribution'
  }

  function readAliases() {
    let saved = {}
    try { saved = JSON.parse(localStorage.getItem(ALIAS_KEY) || '{}') } catch { saved = {} }
    const defaults = [{ machine: '초지3', alias: '깨/나 (일반) 2P (초3)', canonical: '깨/나 (일반) 2P' }]
    const disabled = Array.isArray(saved.disabledDefaults) ? saved.disabledDefaults : []
    const entries = [...defaults.filter((entry) => !disabled.includes(JSON.stringify([entry.machine, entry.alias]))), ...(Array.isArray(saved.aliases) ? saved.aliases : [])]
    aliases = new Map(entries.map((entry) => [`${entry.machine}\u0000${entry.alias}`, entry.canonical]))
    sourceRenames = Array.isArray(saved.sourceRenames) ? saved.sourceRenames : []
  }

  function displayedSourceName(machine, sourceName) {
    return sourceRenames.find((entry) => entry.machine === machine && entry.sourceName === sourceName)?.displayName || sourceName
  }

  function canonicalName(machine, sourceName) {
    const shownName = displayedSourceName(machine, sourceName)
    return aliases.get(`${machine}\u0000${shownName}`) || shownName
  }

  function fillSelect(select, options) {
    select.innerHTML = options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('')
  }

  function percentile(values, fraction) {
    if (!values.length) return null
    const sorted = [...values].sort((left, right) => left - right)
    const position = (sorted.length - 1) * fraction
    const low = Math.floor(position)
    const high = Math.ceil(position)
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
  }

  function buildQualityTargets() {
    const grouped = new Map()
    inspectionDataset.rows.forEach((row) => {
      if (row.auxiliaryOnly) return
      const values = row.values
      const machine = values[1]
      const rawSourceName = values[10]
      const date = String(values[2] || '')
      if (!machine || !rawSourceName || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
      const product = canonicalName(machine, rawSourceName)
      const key = JSON.stringify([machine, product])
      if (!grouped.has(key)) grouped.set(key, { key, machine, product, sourceNames: new Set(), counts: new Map() })
      const target = grouped.get(key)
      target.sourceNames.add(displayedSourceName(machine, rawSourceName))
      const month = date.slice(0, 7)
      if (!target.counts.has(month)) target.counts.set(month, new Array(42).fill(null).map(() => []))
      const bucket = target.counts.get(month)
      MEASURES.forEach((measure) => {
        const value = values[measure.column]
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) bucket[measure.column].push(value)
      })
    })
    qualityTargets = [...grouped.values()].map((target) => ({ ...target, sourceNames: [...target.sourceNames] }))
      .sort((left, right) => left.machine.localeCompare(right.machine, 'ko') || left.product.localeCompare(right.product, 'ko'))
    qualityMonths = [...new Set(qualityTargets.flatMap((target) => [...target.counts.keys()]))].sort()
  }

  function renderQualityMonthOptions() {
    const options = qualityMonths.map((month) => ({ value: month, label: `${Number(month.slice(5))}월` }))
    fillSelect(ui.qualityStartMonth, options)
    fillSelect(ui.qualityEndMonth, options)
    ui.qualityStartMonth.value = options[0]?.value || ''
    ui.qualityEndMonth.value = options[options.length - 1]?.value || ''
  }

  function renderQualityTargets() {
    const measure = MEASURES.find((item) => item.key === ui.qualityMeasure.value)
    const query = ui.qualitySearch.value.trim().toLocaleLowerCase('ko-KR')
    const selected = new Set([...ui.qualityTargets.querySelectorAll('input:checked')].map((input) => input.value))
    const visible = qualityTargets.filter((target) => {
      const matchingRows = [...target.counts.values()].some((bucket) => bucket[measure.column].length)
      return matchingRows && `${target.machine} ${target.product} ${target.sourceNames.join(' ')}`.toLocaleLowerCase('ko-KR').includes(query)
    })
    if (!visible.length) {
      ui.qualityTargets.innerHTML = '<div class="compare-empty-state">선택한 검사항목에서 비교할 품목을 찾지 못했습니다.</div>'
      updateQualityCount()
      return
    }
    ui.qualityTargets.innerHTML = visible.map((target) => {
      const sampleCount = [...target.counts.values()].reduce((sum, bucket) => sum + bucket[measure.column].length, 0)
      const isChecked = selected.has(target.key)
      return `<label class="compare-target-option"><input type="checkbox" value="${escapeHtml(target.key)}" ${isChecked ? 'checked' : ''}><span><strong>${escapeHtml(target.machine)} · ${escapeHtml(target.product)}</strong><small>${target.sourceNames.length > 1 ? `원본 ${target.sourceNames.length}개 통합 · ` : ''}${sampleCount.toLocaleString('ko-KR')}개 검사값</small></span></label>`
    }).join('')
    updateQualityCount()
  }

  function updateQualityCount(event) {
    const checked = ui.qualityTargets.querySelectorAll('input:checked')
    if (checked.length > 6) {
      const interacted = event?.target?.matches?.('input[type="checkbox"]') && event.target.checked ? event.target : null
      ;(interacted || checked[checked.length - 1]).checked = false
    }
    ui.qualityCount.textContent = `${ui.qualityTargets.querySelectorAll('input:checked').length}개 선택`
  }

  function monthlyValue(values, statistic) {
    if (!values.length) return null
    if (statistic === 'median') return percentile(values, 0.5)
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  function makeTrendPath(points, y, x) {
    let path = ''
    let active = false
    points.forEach((point, index) => {
      if (point.value === null) { active = false; return }
      path += `${active ? 'L' : 'M'} ${x(index)} ${y(point.value)} `
      active = true
    })
    return path.trim()
  }

  function drawQualityTrend() {
    const selectedKeys = [...ui.qualityTargets.querySelectorAll('input:checked')].map((input) => input.value)
    if (selectedKeys.length < 2) {
      ui.qualityStatus.textContent = '월별 추이를 비교할 품목을 최소 2개 선택해 주세요.'
      return
    }
    if (selectedKeys.length > 6) {
      ui.qualityStatus.textContent = '한 번에 비교할 수 있는 품목은 최대 6개입니다.'
      return
    }
    const measure = MEASURES.find((item) => item.key === ui.qualityMeasure.value)
    if (!measure) return
    const startMonth = ui.qualityStartMonth.value
    const endMonth = ui.qualityEndMonth.value
    if (!startMonth || !endMonth || startMonth > endMonth) {
      ui.qualityStatus.textContent = '시작 월과 종료 월을 확인해 주세요.'
      return
    }
    const months = qualityMonths.filter((month) => month >= startMonth && month <= endMonth)
    const statistic = ui.qualityStatistic.value
    const targetsByKey = new Map(qualityTargets.map((target) => [target.key, target]))
    const series = selectedKeys.map((key) => {
      const target = targetsByKey.get(key)
      const points = months.map((month) => {
        const values = target.counts.get(month)?.[measure.column] || []
        return { month, value: monthlyValue(values, statistic), count: values.length }
      })
      return { target, points }
    })
    drawMonthlyChart(series, months, measure)
    const sampleTotal = series.reduce((sum, item) => sum + item.points.reduce((subtotal, point) => subtotal + point.count, 0), 0)
    ui.qualityTotal.textContent = `총 검사값 ${sampleTotal.toLocaleString('ko-KR')}개`
    ui.qualityTitle.textContent = `품목별 ${measure.label} 월별 추이`
    ui.qualitySubtitle.textContent = `${months[0]?.slice(5)}월–${months[months.length - 1]?.slice(5)}월 · ${statistic === 'median' ? '월중앙값' : '월평균'} · ${measure.unit}`
    ui.qualityStatus.textContent = '각 점의 표본 수는 마우스를 올리면 확인할 수 있습니다. 값이 없는 달은 선을 끊어 표시합니다.'
    ui.qualityLegend.innerHTML = series.map((item, index) => `<span><i style="--trend-color:${COLORS[index % COLORS.length]}"></i>${escapeHtml(item.target.machine)} · ${escapeHtml(item.target.product)}</span>`).join('')
  }

  function drawMonthlyChart(series, months, measure) {
    const width = Math.max(820, months.length * 88 + 140)
    const height = 380
    const left = 70; const right = width - 24; const top = 28; const bottom = 300
    const allValues = series.flatMap((item) => item.points.map((point) => point.value).filter((value) => value !== null))
    if (!allValues.length) {
      ui.qualityChart.innerHTML = '<div class="compare-empty-state">선택한 기간에 유효한 검사값이 없습니다.</div>'
      return
    }
    const low = Math.min(...allValues); const high = Math.max(...allValues)
    const padding = low === high ? Math.max(Math.abs(low) * 0.06, 1) : (high - low) * 0.12
    const yMin = low - padding; const yMax = high + padding
    const y = (value) => bottom - ((value - yMin) / (yMax - yMin)) * (bottom - top)
    const x = (index) => months.length === 1 ? (left + right) / 2 : left + (index * (right - left)) / (months.length - 1)
    const ticks = Array.from({ length: 5 }, (_, index) => yMax - (yMax - yMin) * index / 4)
    const grid = ticks.map((tick) => `<g class="trend-grid"><line x1="${left}" x2="${right}" y1="${y(tick)}" y2="${y(tick)}"/><text x="${left - 10}" y="${y(tick) + 4}" text-anchor="end">${escapeHtml(formatNumber(tick))}</text></g>`).join('')
    const xGrid = months.map((month, index) => `<g class="trend-x-grid"><line x1="${x(index)}" x2="${x(index)}" y1="${top}" y2="${bottom}"/><text x="${x(index)}" y="${bottom + 23}" text-anchor="middle">${Number(month.slice(5))}월</text></g>`).join('')
    const paths = series.map((item, seriesIndex) => {
      const color = COLORS[seriesIndex % COLORS.length]
      const path = makeTrendPath(item.points, y, x)
      const dots = item.points.map((point, index) => point.value === null ? '' : `<circle class="trend-point" cx="${x(index)}" cy="${y(point.value)}" r="4.5" fill="${color}"><title>${escapeHtml(item.target.machine)} · ${escapeHtml(item.target.product)} · ${Number(point.month.slice(5))}월: ${formatNumber(point.value)} ${escapeHtml(measure.unit)} · n=${point.count}</title></circle>`).join('')
      return `<path class="trend-line" d="${path}" stroke="${color}"/>${dots}`
    }).join('')
    const svg = `<svg class="compare-svg trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(measure.label)} 품목별 월별 추이"><text class="trend-unit-label" x="${left}" y="13">${escapeHtml(measure.unit)}</text>${grid}${xGrid}<line class="compare-axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>${paths}</svg>`
    ui.qualityChart.innerHTML = svg
  }

  function loadFeltData() {
    return fetch(FELT_DATA_URL).then((response) => {
      if (!response.ok) throw new Error('FELT 관리 자료를 읽지 못했습니다.')
      return response.json()
    })
  }

  function fillFeltCycles() {
    const options = [{ value: 'all', label: '모든 교체 주기' }, ...feltDataset.cycles.map((cycle) => ({
      value: cycle.sheet,
      label: `${cycle.installDate || '날짜 미상'} · ${cycle.feltNo || 'FELT 번호 미상'}${cycle.design ? ` · ${cycle.design}` : ''}`,
    }))]
    fillSelect(ui.feltCycle, options)
    setFeltCycleRange()
  }

  function getFeltCycleBounds() {
    const cycle = feltDataset.cycles.find((entry) => entry.sheet === ui.feltCycle.value)
    const cycleRows = cycle ? feltDataset.rows.filter((row) => row.sheet === cycle.sheet) : feltDataset.rows
    const dates = cycleRows.map((row) => row.date).sort()
    return dates.length ? { min: dates[0], max: dates[dates.length - 1] } : { min: '', max: '' }
  }

  function setFeltCycleRange() {
    const { min, max } = getFeltCycleBounds()
    ui.feltStart.min = min
    ui.feltStart.max = max
    ui.feltEnd.min = min
    ui.feltEnd.max = max
    ui.feltStart.value = min
    ui.feltEnd.value = max
  }

  function syncFeltDatesToQuality() {
    const startMonth = ui.qualityStartMonth.value
    const endMonth = ui.qualityEndMonth.value
    if (!startMonth || !endMonth || startMonth > endMonth) return false
    const bounds = getFeltCycleBounds()
    if (!bounds.min || !bounds.max) return false
    const endYear = Number(endMonth.slice(0, 4))
    const endNumber = Number(endMonth.slice(5, 7))
    const qualityStart = `${startMonth}-01`
    const qualityEnd = new Date(Date.UTC(endYear, endNumber, 0)).toISOString().slice(0, 10)
    const start = qualityStart > bounds.min ? qualityStart : bounds.min
    const end = qualityEnd < bounds.max ? qualityEnd : bounds.max
    if (start > end) {
      ui.feltStart.value = ''
      ui.feltEnd.value = ''
      ui.feltStatus.textContent = '선택한 품질 월 기간과 FELT 주기의 기간이 겹치지 않습니다.'
      ui.feltChart.innerHTML = '<div class="compare-empty-state">선택한 월 범위에 해당하는 FELT 운전 기록이 없습니다.</div>'
      ui.feltCount.textContent = '겹치는 기간 없음'
      renderFeltEvents([])
      return false
    }
    ui.feltStart.value = start
    ui.feltEnd.value = end
    return true
  }

  function renderFeltEvents(rows) {
    const events = rows.filter((row) => row.note || row.downtime).sort((left, right) => right.date.localeCompare(left.date))
    if (!events.length) {
      ui.feltEvents.innerHTML = '<div class="felt-event-empty">선택한 기간에 기록된 운휴·특기사항이 없습니다.</div>'
      return
    }
    ui.feltEvents.innerHTML = `<h3>운휴·현장 특이사항</h3><ul>${events.map((row) => `<li><time>${escapeHtml(row.date)}</time><span class="felt-event-cycle">${escapeHtml(row.feltNo || row.sheet)}</span><span>${row.downtime ? `<strong>운휴</strong> ${escapeHtml(row.downtime)} ` : ''}${escapeHtml(row.note || '')}</span></li>`).join('')}</ul>`
  }

  function drawFeltChart() {
    if (!feltDataset) return
    const metric = METRICS.find((item) => item.key === ui.feltMetric.value)
    if (!metric) return
    const start = ui.feltStart.value
    const end = ui.feltEnd.value
    if (!start || !end) {
      ui.feltStatus.textContent = '선택한 품질 월 기간과 FELT 주기의 기간이 겹치지 않습니다. 기간을 조정해 주세요.'
      ui.feltChart.innerHTML = '<div class="compare-empty-state">선택한 조건에 해당하는 FELT 운전 기록이 없습니다.</div>'
      ui.feltCount.textContent = '겹치는 기간 없음'
      renderFeltEvents([])
      return
    }
    if (start > end) {
      ui.feltStatus.textContent = '시작일이 종료일보다 늦습니다.'
      return
    }
    const cycleName = ui.feltCycle.value
    const rows = feltDataset.rows.filter((row) => row.date >= start && row.date <= end && (cycleName === 'all' || row.sheet === cycleName))
      .sort((left, right) => left.date.localeCompare(right.date))
    const validRows = rows.filter((row) => typeof row[metric.key] === 'number' && Number.isFinite(row[metric.key]))
    if (!validRows.length) {
      ui.feltChart.innerHTML = '<div class="compare-empty-state">선택한 운전조건과 기간에 표시할 측정값이 없습니다.</div>'
      ui.feltCount.textContent = '표본 없음'
      ui.feltSubtitle.textContent = `${metric.label}${metric.unit ? ` · ${metric.unit}` : ''}`
      renderFeltEvents(rows)
      return
    }
    drawDailyFeltChart(validRows, metric, start, end, cycleName)
    const cycle = feltDataset.cycles.find((item) => item.sheet === cycleName)
    ui.feltTitle.textContent = `${metric.label} 일별 추이`
    ui.feltSubtitle.textContent = `${cycle ? `${cycle.installDate} · FELT ${cycle.feltNo || cycle.sheet}` : '전체 교체 이력'} · ${start}–${end}${metric.unit ? ` · ${metric.unit}` : ''}`
    ui.feltCount.textContent = `${validRows.length.toLocaleString('ko-KR')}일 측정`
    ui.feltStatus.textContent = '각 점에 마우스를 올리면 날짜·측정값·FELT 번호를 확인할 수 있습니다. 날짜가 비면 선은 이어지지 않습니다.'
    renderFeltEvents(rows)
  }

  function drawDailyFeltChart(rows, metric, start, end, cycleName) {
    const width = Math.max(820, Math.min(1400, rows.length * 13 + 150))
    const height = 390
    const left = 74; const right = width - 26; const top = 30; const bottom = 305
    const startTime = Date.parse(`${start}T00:00:00Z`)
    const endTime = Date.parse(`${end}T00:00:00Z`)
    const totalTime = Math.max(endTime - startTime, 86400000)
    const xDate = (date) => left + ((Date.parse(`${date}T00:00:00Z`) - startTime) / totalTime) * (right - left)
    const values = rows.map((row) => row[metric.key])
    const min = Math.min(...values); const max = Math.max(...values)
    const pad = min === max ? Math.max(Math.abs(max) * 0.06, 1) : (max - min) * 0.1
    const low = min - pad; const high = max + pad
    const y = (value) => bottom - ((value - low) / (high - low)) * (bottom - top)
    const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date))
    const rowByDate = new Map(sortedRows.map((row) => [row.date, row]))
    const dailySamples = []
    const sampleDate = new Date(`${start}T00:00:00Z`)
    const finalDate = new Date(`${end}T00:00:00Z`)
    while (sampleDate <= finalDate) {
      const date = sampleDate.toISOString().slice(0, 10)
      const row = rowByDate.get(date)
      dailySamples.push({ date, row, value: row ? row[metric.key] : null })
      sampleDate.setUTCDate(sampleDate.getUTCDate() + 1)
    }
    let path = ''
    let connected = false
    dailySamples.forEach((sample) => {
      if (sample.value === null || sample.value === undefined) { connected = false; return }
      path += `${connected ? 'L' : 'M'} ${xDate(sample.date)} ${y(sample.value)} `
      connected = true
    })
    const ticks = Array.from({ length: 5 }, (_, index) => high - (high - low) * index / 4)
    const grid = ticks.map((tick) => `<g class="trend-grid"><line x1="${left}" x2="${right}" y1="${y(tick)}" y2="${y(tick)}"/><text x="${left - 10}" y="${y(tick) + 4}" text-anchor="end">${escapeHtml(formatNumber(tick))}</text></g>`).join('')
    const monthTicks = [start]
    const startMonth = new Date(`${start}T00:00:00Z`)
    const tick = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + 1, 1))
    while (tick.getTime() <= endTime) {
      monthTicks.push(tick.toISOString().slice(0, 10))
      tick.setUTCMonth(tick.getUTCMonth() + 1)
    }
    const xGrid = monthTicks.map((date) => `<g class="trend-x-grid"><line x1="${xDate(date)}" x2="${xDate(date)}" y1="${top}" y2="${bottom}"/><text x="${xDate(date)}" y="${bottom + 22}" text-anchor="middle">${Number(date.slice(5, 7))}월</text></g>`).join('')
    const cycleLines = feltDataset.cycles.filter((cycle) => cycle.installDate >= start && cycle.installDate <= end && (cycleName === 'all' || cycle.sheet === cycleName))
      .map((cycle) => `<g class="felt-cycle-marker"><line x1="${xDate(cycle.installDate)}" x2="${xDate(cycle.installDate)}" y1="${top}" y2="${bottom}"/><text x="${xDate(cycle.installDate) + 4}" y="${top + 11}" transform="rotate(90 ${xDate(cycle.installDate) + 4} ${top + 11})">교체 ${escapeHtml(cycle.feltNo || '')}</text></g>`).join('')
    const eventRows = feltDataset.rows.filter((row) => row.date >= start && row.date <= end && (cycleName === 'all' || row.sheet === cycleName) && (row.note || row.downtime))
    const eventMarkers = eventRows.map((row) => `<circle class="felt-event-marker" cx="${xDate(row.date)}" cy="${bottom - 5}" r="4"><title>${escapeHtml(row.date)} · ${escapeHtml([row.downtime, row.note].filter(Boolean).join(' '))}</title></circle>`).join('')
    const points = dailySamples.filter((sample) => sample.row && typeof sample.value === 'number').map((sample) => `<circle class="trend-point felt-point" cx="${xDate(sample.date)}" cy="${y(sample.value)}" r="3.4"><title>${escapeHtml(sample.date)} · ${escapeHtml(metric.label)} ${formatNumber(sample.value)}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ''} · FELT ${escapeHtml(sample.row.feltNo || sample.row.sheet)}</title></circle>`).join('')
    const svg = `<svg class="compare-svg trend-svg felt-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="FELT ${escapeHtml(metric.label)} 일별 추이">${grid}${xGrid}${cycleLines}<line class="compare-axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/><path class="trend-line felt-line" d="${path}"/>${points}${eventMarkers}</svg><div class="felt-marker-legend"><span><i class="felt-cycle-swatch"></i>FELT 교체</span><span><i class="felt-event-swatch"></i>운휴·특기사항 (마커에 마우스를 올려 확인)</span></div>`
    ui.feltChart.innerHTML = svg
  }

  async function start() {
    ui.tabs.forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.compareView)))
    setView('combined')
    try {
      inspectionDataset = await window.qInsightLoadInspectionDataset()
      readAliases()
      buildQualityTargets()
      fillSelect(ui.qualityMeasure, MEASURES.map((measure) => ({ value: measure.key, label: `${measure.label}${measure.unit ? ` (${measure.unit})` : ''}` })))
      ui.qualityMeasure.value = 'weight'
      renderQualityMonthOptions()
      renderQualityTargets()
      ui.qualityMeasure.addEventListener('change', renderQualityTargets)
      ui.qualitySearch.addEventListener('input', renderQualityTargets)
      ui.qualityTargets.addEventListener('change', updateQualityCount)
      ui.qualityRun.addEventListener('click', drawQualityTrend)
      ui.qualityStatistic.addEventListener('change', () => { if (ui.qualityTargets.querySelector('input:checked')) drawQualityTrend() })
      ui.qualityStartMonth.addEventListener('change', () => {
        if (ui.feltSyncQuality.checked && feltDataset) { syncFeltDatesToQuality(); drawFeltChart() }
        if (ui.qualityTargets.querySelector('input:checked')) drawQualityTrend()
      })
      ui.qualityEndMonth.addEventListener('change', () => {
        if (ui.feltSyncQuality.checked && feltDataset) { syncFeltDatesToQuality(); drawFeltChart() }
        if (ui.qualityTargets.querySelector('input:checked')) drawQualityTrend()
      })
      try {
        feltDataset = await loadFeltData()
        fillFeltCycles()
        fillSelect(ui.feltMetric, feltDataset.metrics.map((metric) => ({ value: metric.key, label: `${metric.label}${metric.unit ? ` (${metric.unit})` : ''}` })))
        ui.feltMetric.value = 'feltKpa1'
      syncFeltDatesToQuality()
      ui.feltCycle.addEventListener('change', () => {
        setFeltCycleRange()
        if (ui.feltSyncQuality.checked) syncFeltDatesToQuality()
        drawFeltChart()
      })
      ui.feltMetric.addEventListener('change', drawFeltChart)
      ui.feltStart.addEventListener('change', () => { ui.feltSyncQuality.checked = false; drawFeltChart() })
      ui.feltEnd.addEventListener('change', () => { ui.feltSyncQuality.checked = false; drawFeltChart() })
      ui.feltSyncQuality.addEventListener('change', () => { if (ui.feltSyncQuality.checked) syncFeltDatesToQuality(); drawFeltChart() })
        ui.feltRun.addEventListener('click', drawFeltChart)
        drawFeltChart()
      } catch (error) {
        ui.feltStatus.textContent = error instanceof Error ? error.message : 'FELT 운영 데이터를 읽지 못했습니다.'
        ui.feltChart.innerHTML = '<div class="compare-empty-state">FELT 운영 데이터를 읽지 못했습니다.</div>'
      }
    } catch (error) {
      ui.qualityStatus.textContent = error instanceof Error ? error.message : '초지345 데이터를 읽지 못했습니다.'
      ui.qualityTargets.innerHTML = '<div class="compare-empty-state">원본 검사 데이터를 읽지 못했습니다.</div>'
    }
  }

  start()
})()
