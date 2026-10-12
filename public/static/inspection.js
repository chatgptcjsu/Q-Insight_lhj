(() => {
  const DATA_URL = '/static/inspection-data.json'
  const ACK_KEY = 'q-insight-inspection-alerts-reviewed-v1'
  const PRODUCT_SETTINGS_KEY = 'q-insight-product-aliases-v1'
  const QUALITY_COLUMNS = [7, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 38, 39, 40, 41]
  const MIN_GROUP_SIZE = 12
  const elements = {
    recordCount: document.getElementById('inspection-record-count'),
    filteredCount: document.getElementById('inspection-filtered-count'),
    alertCount: document.getElementById('inspection-alert-count'),
    columnCount: document.getElementById('inspection-column-count'),
    machine: document.getElementById('filter-machine'),
    month: document.getElementById('filter-month'),
    product: document.getElementById('filter-product'),
    verdict: document.getElementById('filter-verdict'),
    rowType: document.getElementById('filter-row-type'),
    query: document.getElementById('filter-query'),
    suspiciousOnly: document.getElementById('filter-suspicious-only'),
    pageSize: document.getElementById('filter-page-size'),
    description: document.getElementById('inspection-filter-description'),
    pageStatus: document.getElementById('inspection-page-status'),
    rowRange: document.getElementById('inspection-row-range'),
    tableHead: document.getElementById('inspection-table-head'),
    tableBody: document.getElementById('inspection-table-body'),
    alertList: document.getElementById('inspection-alert-list'),
    alertBadge: document.getElementById('unreviewed-alert-badge'),
    error: document.getElementById('inspection-load-error'),
    prevPage: document.getElementById('inspection-prev-page'),
    nextPage: document.getElementById('inspection-next-page'),
    pageLabel: document.getElementById('inspection-page-label'),
    reset: document.getElementById('reset-inspection-filters'),
    restore: document.getElementById('restore-dismissed-alerts'),
  }

  const state = {
    dataset: null,
    anomalies: [],
    anomalyByCell: new Map(),
    reviewed: loadReviewed(),
    sourceRenames: loadSourceRenames(),
    filteredRows: [],
    page: 1,
  }

  function loadReviewed() {
    try {
      const stored = JSON.parse(localStorage.getItem(ACK_KEY) || '[]')
      return new Set(Array.isArray(stored) ? stored : [])
    } catch {
      return new Set()
    }
  }

  function saveReviewed() {
    try {
      localStorage.setItem(ACK_KEY, JSON.stringify([...state.reviewed]))
    } catch {
      // Acknowledge actions still apply to the current page if browser storage is unavailable.
    }
  }

  function loadSourceRenames() {
    try {
      const saved = JSON.parse(localStorage.getItem(PRODUCT_SETTINGS_KEY) || '{}')
      return Array.isArray(saved.sourceRenames) ? saved.sourceRenames : []
    } catch {
      return []
    }
  }

  function displayedSourceName(machine, sourceName) {
    return state.sourceRenames.find((entry) => entry.machine === machine && entry.sourceName === sourceName)?.displayName || sourceName
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character])
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === '') return '—'
    if (typeof value === 'number') return value.toLocaleString('ko-KR', { maximumFractionDigits: 4 })
    return String(value)
  }

  function rowField(row, index) {
    if (index === 10) return displayedSourceName(row.values[1], row.values[index])
    return row.values[index]
  }

  function getAlertKey(rowId, columnIndex, value) {
    return `${rowId}:${columnIndex}:${String(value ?? '')}`
  }

  function percentile(sortedValues, quantile) {
    const index = (sortedValues.length - 1) * quantile
    const lowerIndex = Math.floor(index)
    const upperIndex = Math.ceil(index)
    if (lowerIndex === upperIndex) return sortedValues[lowerIndex]
    const weight = index - lowerIndex
    return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight
  }

  function findSuspiciousValues() {
    const groups = new Map()
    const rows = state.dataset.rows

    rows.forEach((row) => {
      if (row.auxiliaryOnly) return
      const machine = rowField(row, 1)
      const product = rowField(row, 10)
      if (!machine || !product) return
      QUALITY_COLUMNS.forEach((columnIndex) => {
        const value = rowField(row, columnIndex)
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return
        const nominalStandard = rowField(row, 7) ?? ''
        const groupKey = `${machine}\u0000${product}\u0000${nominalStandard}\u0000${columnIndex}`
        if (!groups.has(groupKey)) groups.set(groupKey, [])
        groups.get(groupKey).push({ value, row })
      })
    })

    groups.forEach((points, groupKey) => {
      if (points.length < MIN_GROUP_SIZE) return
      const sorted = points.map((point) => point.value).sort((left, right) => left - right)
      const q1 = percentile(sorted, 0.25)
      const median = percentile(sorted, 0.5)
      const q3 = percentile(sorted, 0.75)
      const iqrLimit = Math.max((q3 - q1) * 3, Math.abs(median) * 5, 1e-9)
      const columnIndex = Number(groupKey.split('\u0000')[3])
      const column = state.dataset.headers[columnIndex]

      points.forEach(({ value, row }) => {
        const distance = Math.abs(value - median)
        if (distance <= iqrLimit) return
        const key = getAlertKey(row.id, columnIndex, value)
        state.anomalies.push({
          key,
          row,
          columnIndex,
          columnLabel: column.label,
          value,
          median,
          ratio: distance / iqrLimit,
          reason: `같은 호기·품명 그룹 중앙값 ${formatValue(median)}과 크게 다릅니다.`,
        })
        state.anomalyByCell.set(key, state.anomalies[state.anomalies.length - 1])
      })
    })

    state.anomalies.sort((left, right) => right.ratio - left.ratio)
  }

  function appendOptions(select, values, placeholder, comparator) {
    const uniqueValues = [...new Set(values.filter((value) => value !== null && value !== undefined && String(value).trim() !== ''))]
    const normalized = uniqueValues.sort(comparator || ((left, right) => String(left).localeCompare(String(right), 'ko')))
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${normalized.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`
  }

  function renderTableHeader() {
    const headers = state.dataset.headers
    elements.tableHead.innerHTML = `<tr><th class="excel-row-head">엑셀 행</th>${headers.map((column, index) => `<th class="source-column source-column-${index}" title="${escapeHtml(column.label)}">${escapeHtml(column.label)}</th>`).join('')}</tr>`
  }

  function getVisibleAlerts() {
    return state.anomalies.filter((alert) => !state.reviewed.has(alert.key))
  }

  function renderAlerts() {
    const alerts = getVisibleAlerts()
    elements.alertCount.textContent = alerts.length.toLocaleString('ko-KR')
    elements.alertBadge.textContent = alerts.length ? `${alerts.length}건 확인 필요` : '미확인 후보 없음'
    elements.alertBadge.classList.toggle('no-open-alerts', alerts.length === 0)

    if (!alerts.length) {
      elements.alertList.innerHTML = '<div class="no-alerts-state"><span class="no-alerts-check">✓</span><div><strong>확인할 의심값 후보가 없습니다.</strong><p>후보가 발견되면 이곳에서 원본 행과 항목을 함께 확인할 수 있습니다.</p></div></div>'
      return
    }

    const visible = alerts.slice(0, 30)
    elements.alertList.innerHTML = visible.map((alert) => {
      const date = rowField(alert.row, 2)
      const machine = rowField(alert.row, 1)
      const product = rowField(alert.row, 10)
      const lot = rowField(alert.row, 9)
      return `<article class="inspection-alert-card">
        <div class="inspection-alert-main">
          <div class="inspection-alert-title"><span class="alert-value">${escapeHtml(formatValue(alert.value))}</span><span class="alert-unit">${escapeHtml(alert.columnLabel)}</span><span class="alert-strength">의심 후보</span></div>
          <p>${escapeHtml(machine)} · ${escapeHtml(product)} · ${escapeHtml(formatValue(date))} · LOT ${escapeHtml(formatValue(lot))} · 엑셀 ${alert.row.excelRow}행</p>
          <small>${escapeHtml(alert.reason)}</small>
        </div>
        <button type="button" class="acknowledge-alert" data-alert-key="${escapeHtml(alert.key)}">확인 완료</button>
      </article>`
    }).join('') + (alerts.length > visible.length ? `<p class="alert-more-note">의심 후보 ${alerts.length}건 중 상위 ${visible.length}건을 표시 중입니다. 나머지는 ‘의심값만 보기’ 필터에서 확인할 수 있습니다.</p>` : '')
  }

  function activeFilters() {
    return {
      machine: elements.machine.value,
      month: elements.month.value,
      product: elements.product.value,
      verdict: elements.verdict.value,
      rowType: elements.rowType.value,
      query: elements.query.value.trim().toLocaleLowerCase('ko-KR'),
      suspiciousOnly: elements.suspiciousOnly.checked,
    }
  }

  function matchesFilters(row, filters) {
    if (filters.rowType === 'inspection' && row.auxiliaryOnly) return false
    if (filters.rowType === 'auxiliary' && !row.auxiliaryOnly) return false
    if (filters.machine && rowField(row, 1) !== filters.machine) return false
    if (filters.month && rowField(row, 0) !== filters.month) return false
    if (filters.product && rowField(row, 10) !== filters.product) return false
    if (filters.verdict && rowField(row, 36) !== filters.verdict) return false
    if (filters.query) {
      const searchable = row.values.map((value) => String(value ?? '')).join(' ').toLocaleLowerCase('ko-KR')
      if (!searchable.includes(filters.query)) return false
    }
    if (filters.suspiciousOnly) {
      const hasOpenAlert = state.anomalies.some((alert) => alert.row.id === row.id && !state.reviewed.has(alert.key))
      if (!hasOpenAlert) return false
    }
    return true
  }

  function renderTable() {
    const filters = activeFilters()
    state.filteredRows = state.dataset.rows.filter((row) => matchesFilters(row, filters))
    const pageSize = Number(elements.pageSize.value) || 50
    const pageCount = Math.max(1, Math.ceil(state.filteredRows.length / pageSize))
    state.page = Math.min(Math.max(state.page, 1), pageCount)
    const start = (state.page - 1) * pageSize
    const pageRows = state.filteredRows.slice(start, start + pageSize)
    const alertsByRow = new Map()

    state.anomalies.forEach((alert) => {
      if (state.reviewed.has(alert.key)) return
      if (!alertsByRow.has(alert.row.id)) alertsByRow.set(alert.row.id, new Map())
      alertsByRow.get(alert.row.id).set(alert.columnIndex, alert)
    })

    if (!pageRows.length) {
      elements.tableBody.innerHTML = `<tr><td class="inspection-empty-row" colspan="${state.dataset.headers.length + 1}">조건에 맞는 원본 행이 없습니다.</td></tr>`
    } else {
      elements.tableBody.innerHTML = pageRows.map((row) => {
        const cellAlerts = alertsByRow.get(row.id) || new Map()
        const auxiliaryClass = row.auxiliaryOnly ? 'auxiliary-row' : ''
        const cells = row.values.map((rawValue, index) => {
          const value = index === 10 ? rowField(row, index) : rawValue
          const alert = cellAlerts.get(index)
          const classNames = ['source-cell', `source-column-${index}`]
          if (alert) classNames.push('suspicious-cell')
          if (typeof value === 'number' && Number.isFinite(value)) classNames.push('source-numeric')
          const shown = `<span class="source-cell-value">${escapeHtml(formatValue(value))}</span>`
          const badge = alert ? `<span class="cell-alert-label" title="${escapeHtml(alert.reason)}">확인 필요</span><button type="button" class="cell-acknowledge" data-alert-key="${escapeHtml(alert.key)}" aria-label="${escapeHtml(state.dataset.headers[index].label)} 값 확인 완료">확인</button>` : ''
          return `<td class="${classNames.join(' ')}">${shown}${badge}</td>`
        }).join('')
        const openAlertCount = [...cellAlerts.values()].filter((alert) => !state.reviewed.has(alert.key)).length
        return `<tr class="${auxiliaryClass} ${openAlertCount ? 'row-has-alert' : ''}"><th scope="row" class="excel-row-number">${row.excelRow}${openAlertCount ? `<span class="row-alert-count">${openAlertCount}</span>` : ''}</th>${cells}</tr>`
      }).join('')
    }

    const shownStart = state.filteredRows.length ? start + 1 : 0
    const shownEnd = Math.min(start + pageSize, state.filteredRows.length)
    elements.filteredCount.textContent = state.filteredRows.length.toLocaleString('ko-KR')
    elements.pageLabel.textContent = `${state.page.toLocaleString('ko-KR')} / ${pageCount.toLocaleString('ko-KR')} 페이지`
    elements.pageStatus.textContent = `${shownStart.toLocaleString('ko-KR')}–${shownEnd.toLocaleString('ko-KR')}행 표시`
    elements.rowRange.textContent = `${shownStart.toLocaleString('ko-KR')}–${shownEnd.toLocaleString('ko-KR')} / ${state.filteredRows.length.toLocaleString('ko-KR')}`
    elements.prevPage.disabled = state.page <= 1
    elements.nextPage.disabled = state.page >= pageCount
    elements.description.textContent = `${filters.rowType === 'inspection' ? '검사 행' : filters.rowType === 'auxiliary' ? '보조 계산 행' : '전체 행'} ${state.filteredRows.length.toLocaleString('ko-KR')}건이 조건에 맞습니다.`
  }

  function refresh() {
    renderAlerts()
    renderTable()
  }

  function acknowledgeAlert(key) {
    if (!state.anomalyByCell.has(key)) return
    state.reviewed.add(key)
    saveReviewed()
    refresh()
  }

  function resetFilters() {
    elements.machine.value = ''
    elements.month.value = ''
    elements.product.value = ''
    elements.verdict.value = ''
    elements.rowType.value = 'inspection'
    elements.query.value = ''
    elements.suspiciousOnly.checked = false
    elements.pageSize.value = '50'
    state.page = 1
    refresh()
  }

  function bindEvents() {
    ;[elements.machine, elements.month, elements.product, elements.verdict, elements.rowType, elements.pageSize].forEach((element) => {
      element.addEventListener('change', () => { state.page = 1; renderTable() })
    })
    elements.query.addEventListener('input', () => { state.page = 1; renderTable() })
    elements.suspiciousOnly.addEventListener('change', () => { state.page = 1; renderTable() })
    elements.prevPage.addEventListener('click', () => { state.page -= 1; renderTable(); window.scrollTo({ top: 0, behavior: 'smooth' }) })
    elements.nextPage.addEventListener('click', () => { state.page += 1; renderTable(); window.scrollTo({ top: 0, behavior: 'smooth' }) })
    elements.reset.addEventListener('click', resetFilters)
    elements.restore.addEventListener('click', () => {
      state.reviewed.clear()
      saveReviewed()
      refresh()
    })
    elements.alertList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-alert-key]')
      if (button) acknowledgeAlert(button.dataset.alertKey)
    })
    elements.tableBody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-alert-key]')
      if (button) acknowledgeAlert(button.dataset.alertKey)
    })
  }

  async function start() {
    try {
      const response = await fetch(DATA_URL)
      if (!response.ok) throw new Error(`초지345 데이터를 불러오지 못했습니다. (${response.status})`)
      state.dataset = await response.json()
      appendOptions(elements.machine, state.dataset.rows.map((row) => row.values[1]), '전체 호기')
      appendOptions(elements.product, state.dataset.rows.filter((row) => !row.auxiliaryOnly).map((row) => rowField(row, 10)), '전체 품명')
      appendOptions(elements.verdict, state.dataset.rows.filter((row) => !row.auxiliaryOnly).map((row) => row.values[36]), '전체 판정')
      appendOptions(elements.month, state.dataset.rows.map((row) => row.values[0]), '전체 월', (left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10))
      renderTableHeader()
      findSuspiciousValues()
      elements.recordCount.textContent = state.dataset.recordCount.toLocaleString('ko-KR')
      elements.columnCount.textContent = state.dataset.headers.length.toLocaleString('ko-KR')
      bindEvents()
      refresh()
    } catch (error) {
      elements.error.hidden = false
      elements.error.textContent = error instanceof Error ? error.message : '데이터를 불러오는 중 문제가 발생했습니다.'
      elements.tableBody.innerHTML = '<tr><td class="inspection-empty-row">원본 데이터를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.</td></tr>'
      elements.recordCount.textContent = '오류'
      elements.alertCount.textContent = '—'
      elements.alertBadge.textContent = '읽기 실패'
    }
  }

  start()
})()
