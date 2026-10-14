(() => {
  const ALIAS_KEY = 'q-insight-product-aliases-v1'
  const COLORS = ['#4268e8', '#43a486', '#d9805f', '#8a6cc4', '#3295aa', '#bf9b3b']
  const MEASURES = [
    { key: 'width', label: '지폭', column: 13, unit: 'mm' },
    { key: 'weight', label: '평량', column: 14, unit: 'g/㎡' },
    { key: 'white', label: '백색도', column: 15, unit: '%' },
    { key: 'burst', label: '파열강도', column: 16, unit: 'mN' },
    { key: 'md', label: 'MD', column: 21, unit: 'gf/100mm' },
    { key: 'cd', label: 'CD', column: 22, unit: 'gf/100mm' },
    { key: 'wetCd', label: 'wet-CD', column: 23, unit: 'gf/100mm' },
    { key: 'absorb', label: '흡수도', column: 24, unit: 'mm' },
    { key: 'elong4', label: '신4', column: 28, unit: '%' },
    { key: 'elong', label: '신장율2', column: 29, unit: '%' },
    { key: 'thickness', label: '두께', column: 30, unit: 'mm' },
    { key: 'wetDissolve', label: '물풀링성', column: 31, unit: 'sec' },
    { key: 'airPerm', label: '투기도', column: 32, unit: 'cc/㎠/sec' },
  ]
  const ui = {
    tabs: [...document.querySelectorAll('[data-compare-view]')],
    panels: {
      quality: document.getElementById('quality-trend-panel'),
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
  }
  let inspectionDataset = null
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
    ui.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.compareView === view))
    ui.panels.quality.hidden = view !== 'quality'
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
    const observedMonths = [...new Set(qualityTargets.flatMap((target) => [...target.counts.keys()]))].sort()
    const years = [...new Set(observedMonths.map((month) => month.slice(0, 4)))].sort()
    qualityMonths = years.flatMap((year) => Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`))
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

  async function start() {
    ui.tabs.forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.compareView)))
    setView('quality')
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
        if (ui.qualityTargets.querySelector('input:checked')) drawQualityTrend()
      })
      ui.qualityEndMonth.addEventListener('change', () => {
        if (ui.qualityTargets.querySelector('input:checked')) drawQualityTrend()
      })
    } catch (error) {
      ui.qualityStatus.textContent = error instanceof Error ? error.message : '초지345 데이터를 읽지 못했습니다.'
      ui.qualityTargets.innerHTML = '<div class="compare-empty-state">원본 검사 데이터를 읽지 못했습니다.</div>'
    }
  }

  start()
})()
