(() => {
  const ALIAS_KEY = 'q-insight-product-aliases-v1'
  const DEFAULT_ALIASES = [
    { machine: '초지3', alias: '깨/나 (일반) 2P (초3)', canonical: '깨/나 (일반) 2P' },
  ]
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
    measure: document.getElementById('compare-measure'),
    period: document.getElementById('compare-period'),
    monthWrap: document.getElementById('compare-month-wrap'),
    month: document.getElementById('compare-month'),
    startWrap: document.getElementById('compare-start-wrap'),
    endWrap: document.getElementById('compare-end-wrap'),
    startDate: document.getElementById('compare-start-date'),
    endDate: document.getElementById('compare-end-date'),
    targetList: document.getElementById('compare-target-list'),
    targetCount: document.getElementById('compare-target-count'),
    status: document.getElementById('compare-status'),
    run: document.getElementById('run-comparison'),
    chart: document.getElementById('compare-chart'),
    chartTitle: document.getElementById('compare-chart-title'),
    chartSubtitle: document.getElementById('compare-chart-subtitle'),
    sampleTotal: document.getElementById('compare-sample-total'),
  }
  let dataset = null
  let targets = []
  let aliasMap = new Map()
  let sourceRenames = []

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
  }

  function readAliases() {
    let saved = { aliases: [] }
    try { saved = JSON.parse(localStorage.getItem(ALIAS_KEY) || '{}') } catch { saved = { aliases: [] } }
    const disabledDefaults = Array.isArray(saved.disabledDefaults) ? saved.disabledDefaults : []
    sourceRenames = Array.isArray(saved.sourceRenames) ? saved.sourceRenames : []
    const defaultEntries = DEFAULT_ALIASES.filter((entry) => !disabledDefaults.includes(JSON.stringify([entry.machine, entry.alias])))
    const entries = [...defaultEntries, ...(Array.isArray(saved.aliases) ? saved.aliases : [])]
    aliasMap = new Map()
    entries.forEach((entry) => aliasMap.set(`${entry.machine}\u0000${entry.alias}`, entry.canonical))
  }

  function displayedSourceName(machine, sourceName) {
    return sourceRenames.find((entry) => entry.machine === machine && entry.sourceName === sourceName)?.displayName || sourceName
  }

  function canonicalName(machine, sourceName) {
    const displayedName = displayedSourceName(machine, sourceName)
    return aliasMap.get(`${machine}\u0000${displayedName}`) || displayedName
  }

  function fillSelect(select, entries, placeholder) {
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${entries.map((entry) => `<option value="${escapeHtml(entry.value)}">${escapeHtml(entry.label)}</option>`).join('')}`
  }

  function prepareTargets() {
    const map = new Map()
    dataset.rows.forEach((row) => {
      if (row.auxiliaryOnly) return
      const machine = row.values[1]
      const rawSourceName = row.values[10]
      if (!machine || !rawSourceName || !['초지3', '초지4', '초지5'].includes(machine)) return
      const sourceName = displayedSourceName(machine, rawSourceName)
      const canonical = canonicalName(machine, rawSourceName)
      const key = JSON.stringify([machine, canonical])
      if (!map.has(key)) map.set(key, { key, machine, canonical, sourceNames: new Set(), count: 0, measureCounts: {} })
      const target = map.get(key)
      target.sourceNames.add(sourceName)
      target.count += 1
      MEASURES.forEach((measure) => {
        const value = row.values[measure.column]
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) target.measureCounts[measure.key] = (target.measureCounts[measure.key] || 0) + 1
      })
    })
    targets = [...map.values()].map((target) => ({ ...target, sourceNames: [...target.sourceNames] }))
      .sort((left, right) => left.machine.localeCompare(right.machine, 'ko') || left.canonical.localeCompare(right.canonical, 'ko'))
  }

  function renderTargets() {
    const previouslySelected = new Set([...ui.targetList.querySelectorAll('input:checked')].map((input) => input.value))
    const measureKey = ui.measure.value || 'weight'
    const availableTargets = targets.filter((target) => (target.measureCounts[measureKey] || 0) > 0)
    if (!availableTargets.length) {
      ui.targetList.innerHTML = '<div class="compare-empty-state">선택한 검사 항목의 숫자 측정값이 있는 품목이 없습니다.</div>'
      updateTargetCount()
      return
    }
    ui.targetList.innerHTML = availableTargets.map((target) => {
      const label = `${target.machine} · ${target.canonical}`
      const sourceNote = target.sourceNames.length > 1 ? `원본 표기 ${target.sourceNames.length}개 통합 · ` : ''
      return `<label class="compare-target-option"><input type="checkbox" value="${escapeHtml(target.key)}" ${previouslySelected.has(target.key) ? 'checked' : ''}><span><strong>${escapeHtml(label)}</strong><small>${sourceNote}${target.measureCounts[measureKey].toLocaleString('ko-KR')}개 측정값</small></span></label>`
    }).join('')
    updateTargetCount()
  }

  function updateTargetCount(event) {
    const selected = ui.targetList.querySelectorAll('input:checked')
    if (selected.length > 6) {
      const interacted = event?.target?.matches?.('input[type="checkbox"]') && event.target.checked ? event.target : null
      const latest = interacted || selected[selected.length - 1]
      latest.checked = false
      ui.status.textContent = '비교 대상은 최대 6개까지 선택할 수 있습니다.'
    }
    const count = ui.targetList.querySelectorAll('input:checked').length
    ui.targetCount.textContent = `${count}개 선택`
  }

  function updatePeriodControls() {
    const isMonth = ui.period.value === 'month'
    const isCustom = ui.period.value === 'custom'
    ui.monthWrap.hidden = !isMonth
    ui.startWrap.hidden = !isCustom
    ui.endWrap.hidden = !isCustom
  }

  function selectedDates() {
    const mode = ui.period.value
    if (mode === 'month') {
      const monthNumber = Number.parseInt(ui.month.value, 10)
      if (!monthNumber) return null
      return { month: monthNumber }
    }
    if (mode === 'custom') {
      return { start: ui.startDate.value || '', end: ui.endDate.value || '' }
    }
    return null
  }

  function percentile(sortedValues, quantile) {
    const n = sortedValues.length
    if (n < 4) {
      const position = (n - 1) * quantile
      const low = Math.floor(position)
      const high = Math.ceil(position)
      return sortedValues[low] + (sortedValues[high] - sortedValues[low]) * (position - low)
    }
    const position = (n + 1) * quantile
    const low = Math.floor(position)
    const fraction = position - low
    if (low < 1) return sortedValues[0]
    if (low >= n) return sortedValues[n - 1]
    return sortedValues[low - 1] + fraction * (sortedValues[low] - sortedValues[low - 1])
  }

  function summarize(values) {
    const sorted = [...values].sort((left, right) => left - right)
    const q1 = percentile(sorted, 0.25)
    const median = percentile(sorted, 0.5)
    const q3 = percentile(sorted, 0.75)
    const iqr = q3 - q1
    const lowFence = q1 - 1.5 * iqr
    const highFence = q3 + 1.5 * iqr
    const inliers = sorted.filter((value) => value >= lowFence && value <= highFence)
    return {
      n: sorted.length,
      q1,
      median,
      q3,
      lower: inliers[0] ?? sorted[0],
      upper: inliers[inliers.length - 1] ?? sorted[sorted.length - 1],
      outliers: sorted.filter((value) => value < lowFence || value > highFence),
    }
  }

  function valuesForTarget(target, measure, dateFilter) {
    const aliasSet = new Set(target.sourceNames)
    const values = []
    dataset.rows.forEach((row) => {
      const rowValues = row.values
      if (row.auxiliaryOnly || rowValues[1] !== target.machine || !aliasSet.has(displayedSourceName(rowValues[1], rowValues[10]))) return
      const rawValue = rowValues[measure.column]
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue <= 0) return
      const dateText = rowValues[2]
      if (dateFilter?.month && Number.parseInt(String(dateText).slice(5, 7), 10) !== dateFilter.month) return
      if (dateFilter?.start && dateText < dateFilter.start) return
      if (dateFilter?.end && dateText > dateFilter.end) return
      values.push(rawValue)
    })
    return values
  }

  function drawChart(results, measure, periodLabel) {
    const width = Math.max(760, results.length * 150 + 150)
    const height = 410
    const left = 78; const right = width - 24; const top = 28; const bottom = 300
    const chartHeight = bottom - top
    const chartWidth = right - left
    const allValues = results.flatMap((result) => [result.stats.lower, result.stats.upper, ...result.stats.outliers])
    const min = Math.min(...allValues); const max = Math.max(...allValues)
    const padding = max === min ? Math.max(Math.abs(max) * 0.1, 1) : (max - min) * 0.08
    const yMin = min - padding; const yMax = max + padding
    const y = (value) => bottom - ((value - yMin) / (yMax - yMin)) * chartHeight
    const ticks = Array.from({ length: 5 }, (_, index) => yMin + (yMax - yMin) * index / 4).reverse()
    const colors = ['#6681df', '#55a68c', '#df8a6c', '#8d70cc', '#43a6b8', '#c19a48']
    const slot = chartWidth / results.length
    const boxWidth = Math.min(46, slot * 0.42)
    const gridMarkup = ticks.map((tick) => `<g class="compare-grid"><line x1="${left}" x2="${right}" y1="${y(tick)}" y2="${y(tick)}"/><text x="${left - 12}" y="${y(tick) + 4}" text-anchor="end">${escapeHtml(tick.toLocaleString('ko-KR', { maximumFractionDigits: 3 }))}</text></g>`).join('')
    const boxMarkup = results.map((result, index) => {
      const x = left + slot * (index + 0.5)
      const color = colors[index % colors.length]
      const stats = result.stats
      const boxTop = y(stats.q3); const boxBottom = y(stats.q1)
      const outliers = stats.outliers.map((value) => `<circle class="compare-outlier" cx="${x}" cy="${y(value)}" r="3" fill="${color}"><title>${escapeHtml(result.target.machine)} ${escapeHtml(result.target.canonical)} 이상치 ${escapeHtml(value)}</title></circle>`).join('')
      return `<g><title>${escapeHtml(result.target.machine)} · ${escapeHtml(result.target.canonical)} · 표본 ${stats.n}개 · Q1 ${stats.q1} · 중앙값 ${stats.median} · Q3 ${stats.q3}</title>
        <line class="compare-whisker" stroke="${color}" x1="${x}" x2="${x}" y1="${y(stats.upper)}" y2="${boxTop}"/><line class="compare-whisker" stroke="${color}" x1="${x}" x2="${x}" y1="${boxBottom}" y2="${y(stats.lower)}"/>
        <line class="compare-cap" stroke="${color}" x1="${x-boxWidth*.28}" x2="${x+boxWidth*.28}" y1="${y(stats.upper)}" y2="${y(stats.upper)}"/><line class="compare-cap" stroke="${color}" x1="${x-boxWidth*.28}" x2="${x+boxWidth*.28}" y1="${y(stats.lower)}" y2="${y(stats.lower)}"/>
        <rect class="compare-box" fill="${color}24" stroke="${color}" x="${x-boxWidth/2}" y="${boxTop}" width="${boxWidth}" height="${Math.max(1,boxBottom-boxTop)}" rx="4"/><line class="compare-median" x1="${x-boxWidth/2}" x2="${x+boxWidth/2}" y1="${y(stats.median)}" y2="${y(stats.median)}"/>
        ${outliers}<text class="compare-target-label" x="${x}" y="${bottom+22}" text-anchor="middle">${escapeHtml(result.target.machine)}</text><text class="compare-target-label" x="${x}" y="${bottom+38}" text-anchor="middle">${escapeHtml(result.target.canonical.length>22?`${result.target.canonical.slice(0,21)}…`:result.target.canonical)}</text><text class="compare-target-count" x="${x}" y="${bottom+55}" text-anchor="middle">n=${stats.n}</text>
      </g>`
    }).join('')
    ui.chart.innerHTML = `<svg class="compare-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(measure.label)} 상자그림 비교">${gridMarkup}<line class="compare-axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>${boxMarkup}</svg>`
    const total = results.reduce((sum, result) => sum + result.stats.n, 0)
    ui.sampleTotal.textContent = `총 표본 ${total.toLocaleString('ko-KR')}개`
    ui.chartTitle.textContent = `${measure.label} 상자그림 비교`
    ui.chartSubtitle.textContent = `${periodLabel} · ${results.length}개 대상 · 단위 ${measure.unit}`
  }

  function runComparison() {
    const selectedKeys = [...ui.targetList.querySelectorAll('input:checked')].map((input) => input.value)
    if (selectedKeys.length < 2) {
      ui.status.textContent = '비교 대상을 최소 2개 선택해 주세요.'
      return
    }
    const measure = MEASURES.find((item) => item.key === ui.measure.value)
    if (!measure) return
    const filter = selectedDates()
    if (ui.period.value === 'month' && !filter?.month) {
      ui.status.textContent = '비교할 월을 선택해 주세요.'
      return
    }
    if (ui.period.value === 'custom' && filter?.start && filter?.end && filter.start > filter.end) {
      ui.status.textContent = '시작일이 종료일보다 늦습니다.'
      return
    }
    const byKey = new Map(targets.map((target) => [target.key, target]))
    const results = selectedKeys.map((key) => byKey.get(key)).filter(Boolean).map((target) => ({ target, stats: summarize(valuesForTarget(target, measure, filter)) })).filter((item) => item.stats.n > 0)
    if (results.length < 2) {
      ui.chart.innerHTML = '<div class="compare-empty-state">선택한 항목과 기간에 유효한 숫자 데이터가 있는 비교 대상이 2개 미만입니다.</div>'
      ui.sampleTotal.textContent = '표본 부족'
      ui.status.textContent = '품목 또는 기간을 바꾸어 다시 선택해 주세요.'
      return
    }
    const periodLabel = ui.period.value === 'all' ? '전체 기간' : ui.period.value === 'month' ? ui.month.options[ui.month.selectedIndex].text : `${filter.start || '시작일 미지정'} ~ ${filter.end || '종료일 미지정'}`
    drawChart(results, measure, periodLabel)
    ui.status.textContent = `비교 그래프를 표시했습니다. 표본 수와 품명 차이를 함께 확인해 주세요.`
  }

  async function start() {
    try {
      dataset = await window.qInsightLoadInspectionDataset()
      readAliases()
      prepareTargets()
      fillSelect(ui.measure, MEASURES.map((item) => ({ value: item.key, label: `${item.label} (${item.unit})` })), '검사항목 선택')
      ui.measure.value = 'weight'
      const monthOptions = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}월` }))
      fillSelect(ui.month, monthOptions, '월 선택')
      ui.month.value = '1'
      renderTargets()
      ui.period.addEventListener('change', updatePeriodControls)
      ui.measure.addEventListener('change', () => { renderTargets(); ui.status.textContent = '선택한 검사 항목에 데이터가 있는 비교 대상을 다시 선택하세요.' })
      ui.targetList.addEventListener('change', updateTargetCount)
      ui.run.addEventListener('click', runComparison)
      updatePeriodControls()
      ui.status.textContent = `측정값이 있는 비교 조합 ${targets.length}개를 준비했습니다.`
    } catch (error) {
      ui.status.textContent = error instanceof Error ? error.message : '비교 데이터를 읽지 못했습니다.'
      ui.targetList.innerHTML = '<div class="compare-empty-state">원본 검사 데이터를 읽지 못했습니다.</div>'
    }
  }

  start()
})()
