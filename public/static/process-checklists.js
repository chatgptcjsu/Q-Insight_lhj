(() => {
  const MACHINE_PRESETS = {
    '초지3': { source: '10 월', range: 'A1:U44' },
    '초지4': { source: '10월 초지 공정일지', range: 'A1:U43' },
    '초지5': { source: '10월 공정체크리스트', range: 'A1:U42' },
  }
  const ui = {
    machine: document.getElementById('checklist-machine'),
    date: document.getElementById('checklist-date'),
    paste: document.getElementById('checklist-paste'),
    parse: document.getElementById('checklist-parse'),
    save: document.getElementById('checklist-save'),
    preview: document.getElementById('checklist-preview'),
    status: document.getElementById('checklist-status'),
    chartMachine: document.getElementById('checklist-chart-machine'),
    metric: document.getElementById('checklist-chart-metric'),
    start: document.getElementById('checklist-start-date'),
    end: document.getElementById('checklist-end-date'),
    chart: document.getElementById('checklist-chart'),
    chartSummary: document.getElementById('checklist-chart-summary'),
    history: document.getElementById('checklist-history'),
  }
  let parsed = null
  let currentImports = []
  let history = []

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
  }

  function setStatus(message, kind = '') {
    ui.status.textContent = message
    ui.status.className = `checklist-status ${kind}`.trim()
  }

  function findDate(text) {
    const match = text.match(/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
    if (!match) return ''
    const [, year, month, day] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  function hourValue(value) {
    const match = String(value ?? '').match(/^\s*(\d{1,2})\s*$/)
    return match ? Number(match[1]) : null
  }

  function numberOrText(value) {
    const text = String(value ?? '').trim()
    if (!text) return null
    const numeric = text.replaceAll(',', '')
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(numeric)) return Number(numeric)
    return text
  }

  function parseClipboard() {
    const rawText = ui.paste.value.replace(/\r/g, '')
    if (!rawText.trim()) throw new Error('엑셀에서 복사한 표를 먼저 붙여 넣어 주세요.')
    if (rawText.length > 60000) throw new Error('붙여넣기 내용이 너무 깁니다. A1:U 범위만 복사해 주세요.')
    const machine = ui.machine.value
    const rows = rawText.replace(/\r/g, '').split('\n').map((line) => line.split('\t'))
    const checklistDate = findDate(rawText) || ui.date.value
    if (!checklistDate || !/^\d{4}-\d{2}-\d{2}$/.test(checklistDate)) throw new Error('붙여넣은 표에서 연·월·일을 찾지 못했습니다. 날짜를 직접 선택해 주세요.')
    const title = rawText.match(/([345])\s*M\/C\s*초지\s*공정\s*체크\s*리스트/i)
    if (title && `초지${title[1]}` !== machine) throw new Error(`붙여넣은 제목은 ${`초지${title[1]}`} 양식입니다. 선택한 호기를 확인해 주세요.`)

    const timeRowIndex = rows.findIndex((cells) => cells.slice(0, 4).some((cell) => String(cell).includes('시간')))
    if (timeRowIndex < 0) throw new Error('시간 행을 찾지 못했습니다. 엑셀에서 표 범위 전체를 복사했는지 확인해 주세요.')
    const timeCells = rows[timeRowIndex]
    const hours = Array.from({ length: 12 }, (_, index) => hourValue(timeCells[index + 3]))
    if (hours.filter((hour) => hour !== null).length < 4) throw new Error('시간별 열을 읽지 못했습니다. A1:U 범위로 복사해 주세요.')

    const shiftRow = rows.find((cells) => cells.slice(0, 4).some((cell) => String(cell).includes('반별')))
    const shifts = Array(12).fill('')
    let activeShift = ''
    for (let index = 0; index < shifts.length; index += 1) {
      const value = String(shiftRow?.[index + 3] ?? '').trim()
      if (value) activeShift = value.replace(/[()\s]/g, '')
      shifts[index] = activeShift
    }

    const readings = []
    const labels = new Map()
    const labelContext = ['', '', '']
    const continuationCounts = new Map()
    let stoppedAtNotes = false
    for (let rowIndex = timeRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const cells = rows[rowIndex]
      const rawLabels = cells.slice(0, 3).map((cell) => String(cell ?? '').trim())
      if (rawLabels.some((cell) => cell.includes('기타 참고 사항'))) { stoppedAtNotes = true; break }
      if (rawLabels.some((cell) => cell.includes('소모품 사용 현황'))) break
      const values = Array.from({ length: 12 }, (_, index) => numberOrText(cells[index + 3]))
      if (!values.some((value) => value !== null)) continue
      const hasOwnLabel = rawLabels.some(Boolean)
      if (rawLabels[0]) { labelContext[0] = rawLabels[0]; labelContext[1] = ''; labelContext[2] = '' }
      if (rawLabels[1]) { labelContext[1] = rawLabels[1]; labelContext[2] = '' }
      if (rawLabels[2]) labelContext[2] = rawLabels[2]
      const baseLabel = labelContext.filter(Boolean).join(' / ').replace(/\s+/g, ' ').trim()
      if (!baseLabel) continue
      let label = baseLabel
      if (!hasOwnLabel) {
        const occurrence = (continuationCounts.get(baseLabel) || 0) + 1
        continuationCounts.set(baseLabel, occurrence)
        label = `${baseLabel} · 추가 ${occurrence}`
      }
      labels.set(label, values.filter((value) => value !== null).length)
      values.forEach((value, slot) => {
        if (value === null || hours[slot] === null) return
        readings.push({ item: label, hour: hours[slot], slot, shift: shifts[slot], value, sourceRow: rowIndex + 1 })
      })
    }
    if (!readings.length) throw new Error('측정 항목을 찾지 못했습니다. 붙여넣기 범위에 시간별 수치가 포함되어 있는지 확인해 주세요.')
    if (!stoppedAtNotes) throw new Error('표의 끝(기타 참고 사항)을 확인하지 못했습니다. 해당 날짜의 전체 A1:U 범위를 복사해 주세요.')
    ui.date.value = checklistDate
    return { machine, checklistDate, sourceName: MACHINE_PRESETS[machine].source, rawText, readings, labels: [...labels.entries()] }
  }

  function renderPreview(result) {
    const numericCount = result.readings.filter((reading) => typeof reading.value === 'number').length
    const textCount = result.readings.length - numericCount
    const sample = result.labels.slice(0, 18).map(([item, count]) => `<li><span>${escapeHtml(item)}</span><strong>${count}개 값</strong></li>`).join('')
    ui.preview.hidden = false
    ui.preview.innerHTML = `<div class="checklist-preview-heading"><strong>${escapeHtml(result.machine)} · ${escapeHtml(result.checklistDate)} 미리보기</strong><span>${result.readings.length.toLocaleString('ko-KR')}개 셀 값</span></div><p>숫자 측정값 ${numericCount.toLocaleString('ko-KR')}개${textCount ? ` · 문자 기록 ${textCount.toLocaleString('ko-KR')}개` : ''}. 추이 그래프에는 숫자만 사용합니다. 기타 참고 사항·소모품 블록은 공정 측정 항목에서 제외했습니다.</p><ul>${sample}</ul>${result.labels.length > 18 ? `<small>외 ${result.labels.length - 18}개 항목</small>` : ''}`
    ui.save.disabled = false
  }

  function clearPreview() {
    parsed = null
    ui.save.disabled = true
    ui.preview.hidden = true
    ui.preview.replaceChildren()
  }

  async function saveImport() {
    if (!parsed) return
    ui.save.disabled = true
    setStatus('저장 중입니다…')
    try {
      const response = await fetch('/api/process-checklists', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '저장하지 못했습니다.')
      setStatus(`${parsed.machine} ${parsed.checklistDate} 데이터를 저장했습니다. 저장한 날의 최신 붙여넣기 내용이 추이 분석에 반영됩니다.`, 'success')
      clearPreview()
      await loadData()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '저장하지 못했습니다.', 'error')
      ui.save.disabled = false
    }
  }

  function currentReadings() {
    const start = ui.start.value
    const end = ui.end.value
    return currentImports.filter((record) => record.machine === ui.chartMachine.value && record.checklistDate >= start && record.checklistDate <= end)
      .flatMap((record) => record.readings.map((reading) => {
        const plotDate = new Date(`${record.checklistDate}T00:00:00Z`)
        if (reading.hour < 7) plotDate.setUTCDate(plotDate.getUTCDate() + 1)
        return { ...reading, date: plotDate.toISOString().slice(0, 10), sortDate: record.checklistDate }
      }))
      .filter((reading) => reading.item === ui.metric.value && typeof reading.value === 'number' && Number.isFinite(reading.value))
      .sort((left, right) => left.date.localeCompare(right.date) || left.hour - right.hour || left.sortDate.localeCompare(right.sortDate))
  }

  function renderChart() {
    const points = currentReadings()
    const item = ui.metric.value
    if (!points.length) {
      ui.chart.innerHTML = '<div class="compare-empty-state">선택한 호기·항목·기간에 숫자 기록이 없습니다.</div>'
      ui.chartSummary.textContent = '표본 없음'
      return
    }
    const width = Math.max(850, points.length * 42 + 110)
    const height = 360
    const left = 64; const right = width - 24; const top = 24; const bottom = 278
    const values = points.map((point) => point.value)
    const min = Math.min(...values); const max = Math.max(...values)
    const padding = min === max ? Math.max(Math.abs(min) * 0.05, 1) : (max - min) * 0.12
    const low = min - padding; const high = max + padding
    const x = (index) => points.length === 1 ? (left + right) / 2 : left + index * (right - left) / (points.length - 1)
    const y = (value) => bottom - (value - low) / (high - low) * (bottom - top)
    const ticks = Array.from({ length: 5 }, (_, index) => high - (high - low) * index / 4)
    const grid = ticks.map((tick) => `<g class="trend-grid"><line x1="${left}" x2="${right}" y1="${y(tick)}" y2="${y(tick)}"/><text x="${left - 9}" y="${y(tick) + 4}" text-anchor="end">${escapeHtml(tick.toLocaleString('ko-KR', { maximumFractionDigits: 2 }))}</text></g>`).join('')
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.value)}`).join(' ')
    const circles = points.map((point, index) => `<circle class="trend-point checklist-point" cx="${x(index)}" cy="${y(point.value)}" r="4"><title>${escapeHtml(point.date)} · ${point.hour}시 · ${escapeHtml(point.shift)} · ${escapeHtml(point.item)}: ${escapeHtml(point.value)}</title></circle>`).join('')
    const tickIndexes = [...new Set([0, ...points.map((point, index) => ({ point, index })).filter(({ point, index }) => index === points.length - 1 || points[index - 1]?.date !== point.date || points[index + 1]?.date !== point.date).map(({ index }) => index)])].sort((a, b) => a - b)
    const xLabels = tickIndexes.map((index) => `<g class="trend-x-grid"><line x1="${x(index)}" x2="${x(index)}" y1="${top}" y2="${bottom}"/><text x="${x(index)}" y="${bottom + 22}" text-anchor="middle">${escapeHtml(points[index].date.slice(5))} ${points[index].hour}시</text></g>`).join('')
    ui.chart.innerHTML = `<svg class="compare-svg trend-svg checklist-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(item)} 시간별 공정 체크리스트 추이">${grid}${xLabels}<line class="compare-axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/><path class="trend-line checklist-line" d="${path}"/>${circles}</svg>`
    ui.chartSummary.textContent = `${points.length.toLocaleString('ko-KR')}개 숫자 측정값 · ${min.toLocaleString('ko-KR')}–${max.toLocaleString('ko-KR')}`
  }

  function renderHistory() {
    if (!history.length) {
      ui.history.innerHTML = '<tr><td colspan="5" class="inspection-loading">아직 저장된 체크리스트가 없습니다.</td></tr>'
      return
    }
    ui.history.innerHTML = history.map((item) => `<tr><td>${escapeHtml(item.checklistDate)}</td><td>${escapeHtml(item.machine)}</td><td>${escapeHtml(item.sourceName)}</td><td>${Number(item.itemCount).toLocaleString('ko-KR')}개 값</td><td>${escapeHtml(String(item.importedAt || '').replace('T', ' ').slice(0, 16))}</td></tr>`).join('')
  }

  function fillMetricOptions() {
    const selected = ui.metric.value
    const machineRecords = currentImports.filter((record) => record.machine === ui.chartMachine.value)
    const items = [...new Set(machineRecords.flatMap((record) => record.readings.filter((reading) => typeof reading.value === 'number' && Number.isFinite(reading.value)).map((reading) => reading.item)))].sort((a, b) => a.localeCompare(b, 'ko'))
    ui.metric.innerHTML = items.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')
    if (items.includes(selected)) ui.metric.value = selected
    else if (items.length) ui.metric.value = items[0]
  }

  function syncChartDates() {
    const dates = currentImports.filter((record) => record.machine === ui.chartMachine.value).map((record) => record.checklistDate).sort()
    ui.start.value = dates[0] || ''
    ui.end.value = dates[dates.length - 1] || ''
    fillMetricOptions()
    renderChart()
  }

  async function loadData() {
    const response = await fetch('/api/process-checklists', { credentials: 'same-origin', cache: 'no-store' })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || '체크리스트 기록을 읽지 못했습니다.')
    currentImports = result.current || []
    history = result.history || []
    renderHistory()
    syncChartDates()
  }

  ui.machine.addEventListener('change', () => {
    clearPreview()
    ui.paste.placeholder = `엑셀 ${MACHINE_PRESETS[ui.machine.value].range} 범위를 복사해 여기에 붙여 넣으세요.`
  })
  ui.parse.addEventListener('click', () => {
    try {
      parsed = parseClipboard()
      renderPreview(parsed)
      setStatus('미리보기 내용을 확인한 뒤 저장해 주세요. 같은 날짜를 다시 저장하면 추이에는 가장 최근 내용이 사용됩니다.', 'success')
    } catch (error) {
      clearPreview()
      setStatus(error instanceof Error ? error.message : '붙여넣은 내용을 읽지 못했습니다.', 'error')
    }
  })
  ui.save.addEventListener('click', saveImport)
  ui.chartMachine.addEventListener('change', syncChartDates)
  ;[ui.metric, ui.start, ui.end].forEach((element) => element.addEventListener('change', renderChart))

  ui.paste.placeholder = `엑셀 ${MACHINE_PRESETS[ui.machine.value].range} 범위를 복사해 여기에 붙여 넣으세요.`
  loadData().catch((error) => {
    setStatus(error instanceof Error ? error.message : '체크리스트 데이터를 불러오지 못했습니다.', 'error')
    if (/관리자/.test(error.message)) ui.history.innerHTML = '<tr><td colspan="5">관리자 로그인 후 확인할 수 있습니다.</td></tr>'
  })
})()
