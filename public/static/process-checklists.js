(() => {
  const MACHINE_NAMES = ['초지3', '초지4', '초지5']
  const QUALITY_MEASURES = [
    { key: 'weight', label: '평량', column: 14, unit: 'g/㎡' },
    { key: 'md', label: 'MD', column: 21, unit: 'gf/100mm' },
    { key: 'burst', label: '파열강도', column: 16, unit: 'mN' },
    { key: 'cd', label: 'CD', column: 22, unit: 'gf/100mm' },
    { key: 'wetCd', label: 'wet-CD', column: 23, unit: 'gf/100mm' },
    { key: 'white', label: '백색도', column: 15, unit: '%' },
    { key: 'absorb', label: '흡수도', column: 24, unit: 'mm' },
    { key: 'elongation', label: '신4', column: 28, unit: '%' },
    { key: 'thickness', label: '두께', column: 30, unit: 'mm' },
  ]
  const GLOSSARY = [
    { key: 'yd-speed', test: /y\s*[-‐–]?\s*d.*선속/i, label: 'Y-D 선속', description: 'Yankee Dryer(양키드라이어) 표면의 운전 속도입니다.', influence: '건조·크레이핑 조건과 함께 변하며 수분, 벌크, 인장 특성과 연관될 수 있습니다. 평량 자체를 직접 결정하는 값은 아닙니다.' },
    { key: 'pr-speed', test: /p\s*[-‐–]?\s*r.*선속/i, label: 'P-R 선속', description: 'Press Roll(프레스 롤) 측의 선속으로 기재된 현장 항목입니다.', influence: 'Y-D와의 속도 비율은 지필의 이송·크레이핑 상태와 관련될 수 있습니다. 공장 내 P-R의 정확한 명칭은 현장 용어집 확인이 필요합니다.' },
    { key: 'crepe-ratio', test: /crepe\s*ratio/i, label: 'Crepe Ratio', description: '양키드라이어와 릴 속도 차이 등으로 만들어지는 크레이프(주름) 비율을 나타내는 운전 지표입니다.', influence: '크레이프 구조는 부드러움·벌크·신장률·인장 특성과 연관될 수 있습니다.' },
    { key: 'steam-pressure', test: /steam.*압력|스팀.*압력/i, label: 'Steam 압력', description: '양키드라이어에 공급되는 증기의 압력입니다.', influence: '양키 표면의 가열·건조 조건과 연결됩니다. 수분과 생산 속도 변화에 영향을 줄 수 있지만 품질 결과와의 관계는 다른 조건을 함께 보아야 합니다.' },
    { key: 'fan-pump', test: /fan\s*pump/i, label: 'Fan Pump RPM', description: '팬 펌프 회전수입니다. 지료를 헤드박스 쪽으로 보내는 유량·압력 조건과 관련됩니다.', influence: '유량·희석·지필 형성의 변동과 관련될 수 있습니다. 농도, 밸브·압력 조건 없이 RPM만으로 품질 영향을 단정할 수 없습니다.' },
    { key: 'screen-amp', test: /pressure\s*screen/i, label: 'Pressure Screen AMP', description: '압력 스크린 구동 모터 전류입니다.', influence: '스크린 부하·지료 통과 상태를 간접적으로 살펴보는 운전값입니다. 막힘이나 농도 변화를 확인할 때 보조 지표로 볼 수 있습니다.' },
    { key: 'headbox-pressure', test: /head\s*box.*압력|head\s*box.*pressure/i, label: 'Head Box 입구 압력', description: '헤드박스에 들어가는 지료 압력입니다.', influence: '지료 분배와 지필 형성의 안정성과 연관될 수 있습니다. 지폭·농도·유량과 함께 비교해야 합니다.' },
    { key: 'hood-fan', test: /exhaust\s*fan/i, label: 'Hood 배기팬', description: '후드의 습기와 열기를 배출하는 팬의 속도 설정 또는 전류입니다.', influence: '후드 내 습공기 배출·건조 효율과 연결됩니다. Hood 온도·순환량과 함께 보면 해석이 좋습니다.' },
    { key: 'hood-circulation', test: /circulation/i, label: 'Hood 순환', description: '후드의 열풍 순환 속도 설정 또는 모터 전류입니다. wet/dry 표시는 습부·건조부 구간을 구분합니다.', influence: '열풍 분포와 건조 상태에 연관될 수 있습니다. 배기량·버너 온도와 함께 비교해야 합니다.' },
    { key: 'burner-temp', test: /burner/i, label: 'Hood 버너 온도', description: '후드 버너의 설정/측정 온도입니다. wet/dry 또는 No.1/No.2는 위치·구간을 구분합니다.', influence: '건조 열량 조건과 연관되어 수분에 영향을 줄 수 있습니다. 과도한 건조나 공정 변동 여부는 다른 측정과 함께 확인해야 합니다.' },
    { key: 'vacuum', test: /진공도|vacuum|suction/i, label: '진공도', description: '흡입 롤·터보 계통의 진공 수준을 나타냅니다.', influence: '지필의 탈수와 형성에 연결될 수 있어 수분·균일성 변동을 살펴볼 때 참고합니다.' },
    { key: 'lip-opening', test: /lip\s*(개도|setpoint)|lips/i, label: 'LIP 개도', description: '현장 양식에 표시된 LIP 개도/설정값입니다. 위치와 장치 명칭은 호기별 운전 표준을 확인해 주세요.', influence: '헤드박스 또는 Nipcoflex 설정일 수 있으며 양식만으로 설비 위치를 확정할 수 없습니다. 현장 확인 후 영향 해석을 보강하는 것이 안전합니다.' },
    { key: 'roll-pressure', test: /선압|nipcoflex.*load|nipcoflex.*lip/i, label: '롤·Nipcoflex 선압/부하', description: '롤 또는 Nipcoflex 계통에 설정·측정된 선압이나 부하값입니다. FS/DS는 양식상의 좌·우 또는 구동측 구분을 보존합니다.', influence: '압착·탈수 조건은 수분, 벌크, 강도에 연관될 수 있습니다. FS/DS 구분 및 단위는 해당 호기의 기준서를 확인해야 합니다.' },
    { key: 'doctor-pressure', test: /doctor.*압력|creping/i, label: 'Doctor / Creping 압력', description: '양키에서 지필을 분리하고 크레이프를 만드는 닥터 계통의 압력 설정입니다.', influence: '크레이프 형성·시트 분리와 관련됩니다. Crepe Ratio와 함께 MD/CD·신장률·벌크를 비교할 수 있습니다.' },
    { key: 'coating', test: /코팅제|박리제|coating/i, label: '코팅·박리제', description: 'Y-D(양키드라이어) 또는 Wire 표면에 쓰이는 코팅제·박리제·보조제의 투입값입니다.', influence: '시트와 양키 표면의 부착·분리 및 표면 상태에 연결될 수 있습니다. 투입 기준과 단위가 호기별로 다르므로 표기값 그대로 비교합니다.' },
    { key: 'tension', test: /tension|장력/i, label: 'Wire/FELT 장력', description: 'Wire 또는 FELT의 장력 표시입니다.', influence: '지필 이송과 탈수·접촉 상태에 관련될 수 있습니다. 마모, 장착 기간과 함께 해석해야 합니다.' },
    { key: 'dust-collector', test: /집진기|v-belt|belt/i, label: '집진기·청소 상태', description: '집진기 작동·청소 또는 벨트 상태를 기록합니다.', influence: '설비 관리 상태를 확인하는 참고 항목입니다. 합지·오염 이슈와 함께 정성적으로 검토합니다.' },
  ]
  const ui = {
    machine: document.getElementById('checklist-machine'),
    period: document.getElementById('checklist-period'),
    file: document.getElementById('checklist-file'),
    parse: document.getElementById('checklist-parse'),
    save: document.getElementById('checklist-save'),
    preview: document.getElementById('checklist-preview'),
    status: document.getElementById('checklist-status'),
    reports: document.getElementById('checklist-history'),
    analysisMachine: document.getElementById('checklist-analysis-machine'),
    processMeasure: document.getElementById('checklist-process-measure'),
    qualityMeasure: document.getElementById('checklist-quality-measure'),
    product: document.getElementById('checklist-product'),
    startDate: document.getElementById('checklist-start-date'),
    endDate: document.getElementById('checklist-end-date'),
    pairCount: document.getElementById('checklist-pair-count'),
    correlation: document.getElementById('checklist-correlation'),
    chart: document.getElementById('checklist-correlation-chart'),
    groups: document.getElementById('checklist-groups'),
    pairs: document.getElementById('checklist-pairs'),
    glossary: document.getElementById('checklist-glossary'),
  }
  let parsedUpload = null
  let currentDays = []
  let reports = []
  let qualityRows = []

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
  const normalizedText = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  const toIsoDate = (year, month, day) => {
    const y = Number(year); const m = Number(month); const d = Number(day)
    const date = new Date(Date.UTC(y, m - 1, d))
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
      ? `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      : ''
  }
  const parseDateText = (text) => {
    const match = String(text ?? '').match(/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/) || String(text ?? '').match(/(20\d{2})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})/)
    return match ? toIsoDate(match[1], match[2], match[3]) : ''
  }
  const numericValue = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    const text = normalizedText(value).replaceAll(',', '').replace(/%$/, '')
    return text && /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : text || null
  }
  const prettyNumber = (value, digits = 2) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: digits }) : '—'
  const glossaryFor = (label) => GLOSSARY.find((entry) => entry.test.test(label)) || {
    key: `other:${normalizedText(label).toLocaleLowerCase('ko-KR')}`,
    label: normalizedText(label),
    description: '공정 체크리스트 원본에 기록된 설비 조건 또는 현장 상태입니다.',
    influence: '공장별 약어·측정 위치를 확인한 뒤 품질 결과와 함께 비교하세요. 현재는 원본 항목명 보존이 우선입니다.',
  }
  const canonicalItemKey = (label) => normalizedText(label).normalize('NFKC').toLocaleLowerCase('ko-KR')
    .replace(/\([^)]*(?:이하|이상|±|~|bar|mpa|kpa|kn\/m|mm|kw|rpm|amp|%)[^)]*\)/gi, '')
    .replace(/\[[^\]]*(?:이하|이상|±|~|bar|mpa|kpa|kn\/m|mm|kw|rpm|amp|%)[^\]]*\]/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()
  const machineFromTitle = (text) => {
    const match = normalizedText(text).match(/([345])\s*M\s*\/\s*C\s*초지/i)
    return match ? `초지${match[1]}` : ''
  }
  const rowText = (row) => row.map(normalizedText).join(' ')
  const readSheetRows = (sheet) => window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })

  function getShiftLabels(rows, timeRowIndex) {
    const row = rows.find((cells, index) => index < timeRowIndex && cells.slice(0, 4).some((cell) => normalizedText(cell).includes('반별')))
    const result = Array(12).fill('')
    let current = ''
    for (let slot = 0; slot < 12; slot += 1) {
      const value = normalizedText(row?.[slot + 3]).replace(/[()\s]/g, '')
      if (value) current = value
      result[slot] = current
    }
    return result
  }

  function parseSheet(sheetName, sheet, selectedMachine, period) {
    if (!sheet || !sheet['!ref']) return { status: 'blank', date: '', readings: [] }
    const rows = readSheetRows(sheet)
    const headerText = rows.slice(0, 12).flat().map((value) => String(value ?? '')).join(' ')
    const titleMachine = machineFromTitle(headerText)
    const dateMatch = rows.slice(0, 12).flat().map(parseDateText).find(Boolean) || ''
    const timeRowIndex = rows.findIndex((cells) => cells.slice(0, 5).some((cell) => normalizedText(cell) === '시간'))
    if (timeRowIndex < 0) return { status: 'blank', date: dateMatch, readings: [], titleMachine }
    const hours = Array.from({ length: 12 }, (_, slot) => {
      const value = normalizedText(rows[timeRowIndex]?.[slot + 3])
      if (!/^\d{1,2}$/.test(value)) return null
      const hour = Number(value)
      return hour >= 0 && hour <= 23 ? hour : null
    })
    if (hours.filter((hour) => hour !== null).length < 4) return { status: 'skipped', date: dateMatch, readings: [], titleMachine }
    const shifts = getShiftLabels(rows, timeRowIndex)
    const labels = ['', '', '']
    let rollGroup = ''
    const continuationCount = new Map()
    const readings = []
    const rawRows = rows.slice(0, 60).map((row) => row.slice(0, 21))
    let blankValues = 0
    let measurementRows = 0
    let foundEnd = false
    for (let rowIndex = timeRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || []
      const labelCells = row.slice(0, 3).map(normalizedText)
      const leftText = labelCells.join(' ')
      if (/기타\s*참고\s*사항/.test(leftText)) { foundEnd = true; break }
      if (/소모품\s*사용\s*현황/.test(leftText)) break
      const rawValues = Array.from({ length: 12 }, (_, slot) => row[slot + 3])
      if (!rawValues.some((value) => normalizedText(value))) continue
      if (/^(S-T|2-T)$/i.test(labelCells[0])) rollGroup = labelCells[0]
      else if (labelCells[0] && !/^roll$/i.test(labelCells[0])) rollGroup = ''
      if (!labelCells[0] && /관리\s*전류|전류\s*AMP/i.test(labelCells[1])) labels[0] = ''
      if (/^roll$/i.test(labelCells[0]) && rollGroup) {
        labels[0] = rollGroup
        labels[1] = labelCells[0]
        labels[2] = ''
      } else {
        if (labelCells[0]) { labels[0] = labelCells[0]; labels[1] = ''; labels[2] = '' }
        if (labelCells[1]) { labels[1] = labelCells[1]; labels[2] = '' }
      }
      if (labelCells[2]) labels[2] = labelCells[2]
      let label = labels.filter(Boolean).join(' / ')
      if (!label) continue
      measurementRows += 1
      const hasOwnLabel = labelCells.some(Boolean)
      if (!hasOwnLabel) {
        const next = (continuationCount.get(label) || 0) + 1
        continuationCount.set(label, next)
        label = `${label} · ${next === 1 ? '하단 행' : `추가 ${next}`}`
      }
      const itemKey = canonicalItemKey(label)
      rawValues.forEach((rawValue, slot) => {
        const value = numericValue(rawValue)
        if (value === null || hours[slot] === null) { if (hours[slot] !== null) blankValues += 1; return }
        readings.push({ item: normalizedText(label), itemKey, hour: hours[slot], slot, shift: shifts[slot], value, sourceRow: rowIndex + 1 })
      })
    }
    if (!readings.length) return { status: 'blank', date: dateMatch, readings: [] }
    if (!dateMatch || dateMatch.slice(0, 7) !== period || titleMachine && titleMachine !== selectedMachine) return { status: 'skipped', date: dateMatch, readings: [], titleMachine }
    return { status: 'ready', date: dateMatch, titleMachine, readings, rawRows, blankValues, measurementRows, sheetName: String(sheetName) }
  }

  async function inspectWorkbook(file) {
    if (!window.XLSX) throw new Error('Excel 분석 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.')
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, dense: true })
    const dayNames = workbook.SheetNames.filter((name) => /^(?:[1-9]|[12]\d|3[01])$/.test(String(name)))
    if (!dayNames.length) throw new Error('1~31 숫자 이름의 날짜 시트를 찾지 못했습니다.')
    const firstDate = dayNames.map((name) => {
      const rows = readSheetRows(workbook.Sheets[name]).slice(0, 12)
      return rows.flat().map(parseDateText).find(Boolean) || ''
    }).find(Boolean) || ''
    const firstTitle = dayNames.map((name) => {
      const rows = readSheetRows(workbook.Sheets[name]).slice(0, 12)
      return machineFromTitle(rows.flat().map((value) => String(value ?? '')).join(' '))
    }).find(Boolean)
    if (firstTitle && MACHINE_NAMES.includes(firstTitle)) ui.machine.value = firstTitle
    const namedPeriod = file.name.match(/(20\d{2})[^\d]?(\d{1,2})\s*월/)
    const namedMonth = file.name.match(/(\d{1,2})\s*월/)
    const inferredPeriod = firstDate ? firstDate.slice(0, 7) : ''
    const filenamePeriod = namedPeriod
      ? `${namedPeriod[1]}-${String(namedPeriod[2]).padStart(2, '0')}`
      : inferredPeriod && (!namedMonth || Number(inferredPeriod.slice(5, 7)) === Number(namedMonth[1]))
        ? inferredPeriod
        : namedMonth ? `${new Date().getFullYear()}-${String(namedMonth[1]).padStart(2, '0')}` : ''
    if (filenamePeriod) ui.period.value = filenamePeriod
    const selectedMachine = ui.machine.value
    const days = []
    let blankCount = 0
    let skippedCount = 0
    let mismatchCount = 0
    for (const sheetName of dayNames) {
      const result = parseSheet(sheetName, workbook.Sheets[sheetName], selectedMachine, ui.period.value)
      if (result.status === 'ready') days.push({ checklistDate: result.date, sheetName: result.sheetName, readings: result.readings, rawRows: result.rawRows })
      else if (result.status === 'blank') blankCount += 1
      else { skippedCount += 1; if (result.titleMachine && result.titleMachine !== selectedMachine) mismatchCount += 1 }
    }
    if (!days.length) throw new Error(`선택한 호기·월의 기록을 찾지 못했습니다. 파일은 ${selectedMachine}, 시트 월은 ${ui.period.value}인지 확인해 주세요. 빈 시트 ${blankCount}개 · 제외 시트 ${skippedCount}개`)
    const allReadings = days.flatMap((day) => day.readings)
    const values = new Map()
    allReadings.forEach((reading) => values.set(reading.itemKey, { key: reading.itemKey, item: glossaryFor(reading.item).label || reading.item, sourceNames: new Set(), numericCount: 0, textCount: 0 }))
    allReadings.forEach((reading) => {
      const entry = values.get(reading.itemKey)
      entry.sourceNames.add(reading.item)
      if (typeof reading.value === 'number') entry.numericCount += 1
      else entry.textCount += 1
    })
    let newCount = 0; let updatedCount = 0; let duplicateCount = 0; let conflictCount = 0
    for (const day of days) {
      const oldDay = currentDays.find((entry) => entry.machine === selectedMachine && entry.checklistDate === day.checklistDate)
      const oldValues = new Map((oldDay?.readings || []).map((reading) => [JSON.stringify([reading.itemKey, reading.hour, reading.slot]), reading]))
      const incoming = new Map()
      const conflicts = new Set()
      for (const reading of day.readings) {
        const key = JSON.stringify([reading.itemKey, reading.hour, reading.slot])
        const seen = incoming.get(key)
        if (seen && seen.value !== reading.value) conflicts.add(key)
        else if (seen) duplicateCount += 1
        else incoming.set(key, reading)
      }
      conflicts.forEach((key) => { incoming.delete(key); conflictCount += 1 })
      incoming.forEach((reading, key) => {
        const old = oldValues.get(key)
        if (!old) newCount += 1
        else if (old.value === reading.value) duplicateCount += 1
        else updatedCount += 1
      })
    }
    const numericCount = allReadings.filter((reading) => typeof reading.value === 'number' && Number.isFinite(reading.value)).length
    parsedUpload = { machine: selectedMachine, period: ui.period.value, originalName: file.name, file, days, blankCount, skippedCount, mismatchCount, newCount, updatedCount, duplicateCount, conflictCount, numericCount, textCount: allReadings.length - numericCount, values: [...values.values()].map((value) => ({ ...value, sourceNames: [...value.sourceNames] })), totalReadings: allReadings.length }
    return parsedUpload
  }

  function resetPreview() {
    parsedUpload = null
    ui.preview.hidden = true
    ui.preview.replaceChildren()
    ui.save.disabled = true
  }

  function renderImportPreview(upload) {
    const newCount = upload.totalReadings
    const examples = upload.values.slice(0, 15).map((item) => `<li><span title="${escapeHtml(item.sourceNames.join(' · '))}">${escapeHtml(item.item)}</span><strong>${item.numericCount.toLocaleString('ko-KR')}개 숫자</strong></li>`).join('')
    ui.preview.hidden = false
    ui.preview.innerHTML = `<div class="checklist-preview-heading"><strong>${escapeHtml(upload.machine)} · ${escapeHtml(upload.period)} Excel 분석</strong><span>${upload.days.length}개 날짜 시트 · ${newCount.toLocaleString('ko-KR')}개 항목·시간값</span></div><div class="checklist-preview-counts"><span>신규 <b>${upload.newCount.toLocaleString('ko-KR')}</b></span><span>값 변경 <b>${upload.updatedCount.toLocaleString('ko-KR')}</b></span><span>중복 <b>${upload.duplicateCount.toLocaleString('ko-KR')}</b></span><span>충돌 <b>${upload.conflictCount.toLocaleString('ko-KR')}</b></span><span>빈 날짜 <b>${upload.blankCount}</b></span><span>제외 <b>${upload.skippedCount}</b></span></div><p>숫자 공정값 ${upload.numericCount.toLocaleString('ko-KR')}개 · 문자/상태 기록 ${upload.textCount.toLocaleString('ko-KR')}개. 신규 항목은 추가하고 같은 날짜·항목·시간에서 값이 바뀐 경우만 갱신합니다. 해당 파일에 없는 기존 기록은 삭제하지 않으며, 충돌값은 자동 선택하지 않습니다. 원본 Excel도 함께 보관합니다.</p><ul>${examples}</ul>${upload.values.length > 15 ? `<small>외 ${upload.values.length - 15}개 공정항목</small>` : ''}`
    ui.save.disabled = false
  }

  function setStatus(message, kind = '') {
    ui.status.textContent = message
    ui.status.className = `checklist-status ${kind}`.trim()
  }

  async function importWorkbook() {
    if (!parsedUpload) return
    ui.save.disabled = true
    setStatus('Excel 원본과 날짜별 신규·수정 데이터를 저장하고 있습니다…')
    try {
      const formData = new FormData()
      formData.set('file', parsedUpload.file)
      formData.set('machine', parsedUpload.machine)
      formData.set('period', parsedUpload.period)
      formData.set('checklistData', JSON.stringify({ days: parsedUpload.days, blankCount: parsedUpload.blankCount, skippedCount: parsedUpload.skippedCount, conflictCount: parsedUpload.conflictCount }))
      const response = await fetch('/api/process-checklists', { method: 'POST', credentials: 'same-origin', body: formData })
      const result = await response.json().catch(() => ({}))
      if (response.status === 401) throw new Error('원본 파일 저장에는 관리자 로그인이 필요합니다. 사이드바의 관리자 메뉴에서 로그인한 뒤 다시 저장해 주세요.')
      if (!response.ok) throw new Error(result.error || 'Excel 데이터를 저장하지 못했습니다.')
      const summary = `완료 — 신규 ${result.importedCount.toLocaleString('ko-KR')}개 추가 · 변경 ${result.updatedCount.toLocaleString('ko-KR')}개 갱신 · 동일 ${result.duplicateCount.toLocaleString('ko-KR')}개 건너뜀 · 빈 시트 ${result.blankCount}개.`
      setStatus(summary, 'success')
      resetPreview()
      ui.file.value = ''
      await loadData()
      window.qInsightInspectionDatasetPromise = null
      qualityRows = []
      await loadAnalysis()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Excel 데이터를 저장하지 못했습니다.', 'error')
      ui.save.disabled = false
    }
  }

  function renderReports() {
    if (!reports.length) {
      ui.reports.innerHTML = '<tr><td colspan="7" class="inspection-loading">저장된 체크리스트 Excel이 없습니다.</td></tr>'
      return
    }
    ui.reports.innerHTML = reports.map((report) => `<tr><td>${escapeHtml(report.period)}</td><td>${escapeHtml(report.machine)}</td><td class="report-name-cell">${escapeHtml(report.original_name)}</td><td>${Number(report.sheet_count).toLocaleString('ko-KR')}일</td><td>신규 ${Number(report.imported_count).toLocaleString('ko-KR')} · 갱신 ${Number(report.updated_count).toLocaleString('ko-KR')} · 중복 ${Number(report.duplicate_count).toLocaleString('ko-KR')}${Number(report.conflict_count) ? ` · 충돌 ${Number(report.conflict_count)}` : ''}</td><td>${escapeHtml(new Date(report.uploaded_at).toLocaleString('ko-KR'))}</td><td><a class="report-download-link" href="/api/process-checklists/reports/${encodeURIComponent(report.id)}/download">원본 다운로드</a></td></tr>`).join('')
  }

  async function loadData() {
    const response = await fetch('/api/process-checklists', { credentials: 'same-origin', cache: 'no-store' })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || '공정 체크리스트 기록을 읽지 못했습니다.')
    currentDays = result.current || []
    reports = result.reports || []
    renderReports()
    renderMeasureOptions()
    renderGlossary()
    renderAnalysis()
  }

  async function loadAnalysis() {
    if (!qualityRows.length) {
      const dataset = await window.qInsightLoadInspectionDataset()
      qualityRows = dataset.rows.filter((row) => !row.auxiliaryOnly && MACHINE_NAMES.includes(row.values[1]))
    }
    renderProductOptions()
    renderAnalysis()
  }

  function selectedProcessKey() {
    return ui.processMeasure.value
  }

  function selectedQuality() {
    return QUALITY_MEASURES.find((measure) => measure.key === ui.qualityMeasure.value) || QUALITY_MEASURES[0]
  }

  function renderProductOptions() {
    const machine = ui.analysisMachine.value
    const selected = ui.product.value
    const products = [...new Set(qualityRows.filter((row) => row.values[1] === machine).map((row) => String(row.values[10] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
    ui.product.innerHTML = `<option value="">전체 품목</option>${products.map((product) => `<option value="${escapeHtml(product)}">${escapeHtml(product)}</option>`).join('')}`
    if (products.includes(selected)) ui.product.value = selected
  }

  function processSamples(machine, itemKey, start, end) {
    return currentDays.filter((day) => day.machine === machine && day.checklistDate >= start && day.checklistDate <= end)
      .flatMap((day) => day.readings.filter((reading) => reading.itemKey === itemKey && typeof reading.value === 'number' && Number.isFinite(reading.value)).map((reading) => {
        const date = new Date(`${day.checklistDate}T00:00:00Z`)
        if (reading.hour < 7) date.setUTCDate(date.getUTCDate() + 1)
        const sampleDate = date.toISOString().slice(0, 10)
        const timestamp = Date.parse(`${sampleDate}T00:00:00Z`) + reading.hour * 3600000 + reading.minute * 60000
        const minute = Number(reading.minute || 0)
        return { ...reading, minute, checklistDate: day.checklistDate, sampleDate, timestamp: timestamp + minute * 60000 }
      }))
  }

  function matchedPairs() {
    const machine = ui.analysisMachine.value
    const processKey = selectedProcessKey()
    const quality = selectedQuality()
    const start = ui.startDate.value
    const end = ui.endDate.value
    if (!processKey || !start || !end || start > end) return []
    const qualityEnd = new Date(`${end}T00:00:00Z`)
    qualityEnd.setUTCDate(qualityEnd.getUTCDate() + 1)
    const qualityEndDate = qualityEnd.toISOString().slice(0, 10)
    const samples = processSamples(machine, processKey, start, end).sort((a, b) => a.timestamp - b.timestamp)
    const byTimestamp = new Map()
    samples.forEach((sample) => {
      if (!byTimestamp.has(sample.timestamp)) byTimestamp.set(sample.timestamp, sample)
    })
    const sortedSamples = [...byTimestamp.values()]
    return qualityRows.filter((row) => row.values[1] === machine && (!ui.product.value || String(row.values[10] || '') === ui.product.value) && String(row.values[2] || '') >= start && String(row.values[2] || '') <= qualityEndDate)
      .map((row) => {
        const hour = Number(row.values[5] || 0)
        const minute = Number(row.values[6] || 0)
        const qDate = String(row.values[2] || '').slice(0, 10)
        const qTimestamp = Date.parse(`${qDate}T00:00:00Z`) + hour * 3600000 + minute * 60000
        let best = null
        let delta = Infinity
        for (const sample of sortedSamples) {
          if (sample.timestamp > qTimestamp + 120 * 60000) break
          const distance = Math.abs(qTimestamp - sample.timestamp)
          if (distance < delta) { best = sample; delta = distance }
        }
        const qualityValue = row.values[quality.column]
        if (!best || delta > 120 * 60000 || typeof qualityValue !== 'number' || !Number.isFinite(qualityValue)) return null
        return { date: qDate, hour, minute, product: String(row.values[10] || '—'), lot: String(row.values[9] || '—'), processValue: best.value, processItem: best.item, processTime: `${best.sampleDate} ${String(best.hour).padStart(2, '0')}:00`, qualityValue, deltaMinutes: Math.round(delta / 60000) }
      }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour || a.minute - b.minute)
  }

  function correlation(pairs) {
    if (pairs.length < 3) return null
    const xs = pairs.map((pair) => pair.processValue)
    const ys = pairs.map((pair) => pair.qualityValue)
    const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length
    const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length
    let numerator = 0; let sumX = 0; let sumY = 0
    pairs.forEach((pair) => { const x = pair.processValue - meanX; const y = pair.qualityValue - meanY; numerator += x * y; sumX += x * x; sumY += y * y })
    const denominator = Math.sqrt(sumX * sumY)
    return denominator ? numerator / denominator : null
  }

  function groupPairs(pairs) {
    if (!pairs.length) return []
    const sorted = [...pairs].sort((a, b) => a.processValue - b.processValue)
    const meanAll = pairs.reduce((sum, pair) => sum + pair.qualityValue, 0) / pairs.length
    if (sorted.length < 3) {
      return [{ label: '소표본 전체', count: sorted.length, min: sorted[0].processValue, max: sorted[sorted.length - 1].processValue, processMean: sorted.reduce((sum, pair) => sum + pair.processValue, 0) / sorted.length, qualityMean: meanAll, delta: 0 }]
    }
    return [0, 1, 2].map((group) => {
      const start = Math.floor(group * sorted.length / 3)
      const end = Math.floor((group + 1) * sorted.length / 3)
      const items = sorted.slice(start, end)
      if (!items.length) return null
      return { label: ['낮은 공정값', '중간 공정값', '높은 공정값'][group], count: items.length, min: items[0].processValue, max: items[items.length - 1].processValue, processMean: items.reduce((sum, pair) => sum + pair.processValue, 0) / items.length, qualityMean: items.reduce((sum, pair) => sum + pair.qualityValue, 0) / items.length, delta: items.reduce((sum, pair) => sum + pair.qualityValue, 0) / items.length - meanAll }
    }).filter(Boolean)
  }

  function drawScatter(pairs, processLabel, quality) {
    if (pairs.length < 2) { ui.chart.innerHTML = '<div class="compare-empty-state">일치하는 품질 표본이 2개 이상 있어야 관계를 표시할 수 있습니다.</div>'; return }
    const width = Math.max(720, Math.min(1200, pairs.length * 8 + 180))
    const height = 360; const left = 68; const right = width - 25; const top = 24; const bottom = 294
    const xs = pairs.map((pair) => pair.processValue); const ys = pairs.map((pair) => pair.qualityValue)
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys)
    const padX = minX === maxX ? Math.max(Math.abs(minX) * .05, 1) : (maxX - minX) * .08
    const padY = minY === maxY ? Math.max(Math.abs(minY) * .05, 1) : (maxY - minY) * .1
    const lowX = minX - padX; const highX = maxX + padX; const lowY = minY - padY; const highY = maxY + padY
    const x = (value) => left + (value - lowX) / (highX - lowX) * (right - left)
    const y = (value) => bottom - (value - lowY) / (highY - lowY) * (bottom - top)
    const grid = Array.from({ length: 5 }, (_, i) => {
      const xv = highX - (highX - lowX) * i / 4; const yv = highY - (highY - lowY) * i / 4
      return `<g class="trend-grid"><line x1="${left}" x2="${right}" y1="${y(yv)}" y2="${y(yv)}"/><text x="${left - 8}" y="${y(yv) + 4}" text-anchor="end">${prettyNumber(yv)}</text><line x1="${x(xv)}" x2="${x(xv)}" y1="${top}" y2="${bottom}"/><text x="${x(xv)}" y="${bottom + 20}" text-anchor="middle">${prettyNumber(xv)}</text></g>`
    }).join('')
    const dots = pairs.map((pair) => `<circle class="checklist-scatter-point" cx="${x(pair.processValue)}" cy="${y(pair.qualityValue)}" r="4"><title>${escapeHtml(pair.date)} ${String(pair.hour).padStart(2, '0')}:${String(pair.minute).padStart(2, '0')} · ${escapeHtml(pair.product)} · ${escapeHtml(processLabel)} ${prettyNumber(pair.processValue)} · ${escapeHtml(quality.label)} ${prettyNumber(pair.qualityValue)} · 시각차 ${pair.deltaMinutes}분</title></circle>`).join('')
    ui.chart.innerHTML = `<svg class="compare-svg checklist-scatter-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(processLabel)}와 ${escapeHtml(quality.label)}의 연계 표본 산점도">${grid}<line class="compare-axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>${dots}<text class="checklist-axis-label" x="${(left + right) / 2}" y="${height - 8}" text-anchor="middle">${escapeHtml(processLabel)}</text><text class="checklist-axis-label" x="14" y="${(top + bottom) / 2}" transform="rotate(-90 14 ${(top + bottom) / 2})" text-anchor="middle">${escapeHtml(quality.label)} (${escapeHtml(quality.unit)})</text></svg>`
  }

  function renderAnalysis() {
    const pairs = matchedPairs()
    const processOption = ui.processMeasure.selectedOptions?.[0]
    const processLabel = processOption?.textContent || '공정값'
    const quality = selectedQuality()
    const r = correlation(pairs)
    ui.pairCount.textContent = `${pairs.length.toLocaleString('ko-KR')}개 표본`
    ui.correlation.textContent = r === null ? '—' : r.toFixed(3)
    drawScatter(pairs, processLabel, quality)
    const groups = groupPairs(pairs)
    ui.groups.innerHTML = groups.length ? groups.map((group) => `<tr><td><strong>${group.label}</strong></td><td>${prettyNumber(group.min)}–${prettyNumber(group.max)}</td><td>${group.count}</td><td>${prettyNumber(group.processMean)}</td><td>${prettyNumber(group.qualityMean)} ${escapeHtml(quality.unit)}</td><td class="${group.delta > 0 ? 'impact-up' : group.delta < 0 ? 'impact-down' : ''}">${group.delta > 0 ? '+' : ''}${prettyNumber(group.delta)} ${escapeHtml(quality.unit)}</td></tr>`).join('') : '<tr><td colspan="6" class="inspection-loading">같은 시각 ±120분 내에 매칭된 품질 검사값이 없습니다.</td></tr>'
    ui.pairs.innerHTML = pairs.length ? pairs.slice(0, 250).map((pair) => `<tr><td>${escapeHtml(pair.date)} ${String(pair.hour).padStart(2, '0')}:${String(pair.minute).padStart(2, '0')}</td><td>${escapeHtml(pair.product)}</td><td>${prettyNumber(pair.processValue)}</td><td>${prettyNumber(pair.qualityValue)} ${escapeHtml(quality.unit)}</td><td>${pair.deltaMinutes}분</td><td>${escapeHtml(pair.lot)}</td></tr>`).join('') : '<tr><td colspan="6" class="inspection-loading">표시할 연계 표본이 없습니다.</td></tr>'
  }

  function renderMeasureOptions() {
    const selected = ui.processMeasure.value
    const machine = ui.analysisMachine.value
    const available = new Map()
    currentDays.filter((day) => day.machine === machine).flatMap((day) => day.readings).filter((reading) => typeof reading.value === 'number' && Number.isFinite(reading.value)).forEach((reading) => {
      if (!available.has(reading.itemKey)) available.set(reading.itemKey, reading.item)
    })
    const items = [...available.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko'))
    ui.processMeasure.innerHTML = items.map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(glossaryFor(label).label || label)}</option>`).join('')
    if (items.some(([key]) => key === selected)) ui.processMeasure.value = selected
    else if (items.length) ui.processMeasure.value = items[0][0]
    const dates = currentDays.filter((day) => day.machine === machine).map((day) => day.checklistDate).sort()
    ui.startDate.value = dates[0] || ''
    ui.endDate.value = dates[dates.length - 1] || ''
  }

  function renderGlossary() {
    const entries = new Map()
    currentDays.filter((day) => day.machine === ui.analysisMachine.value).flatMap((day) => day.readings).forEach((reading) => {
      const info = glossaryFor(reading.item)
      if (!entries.has(info.key)) entries.set(info.key, { ...info, sourceNames: new Set() })
      entries.get(info.key).sourceNames.add(reading.item)
    })
    ui.glossary.innerHTML = [...entries.values()].sort((a, b) => a.label.localeCompare(b.label, 'ko')).map((item) => `<article class="checklist-glossary-card"><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml([...item.sourceNames].slice(0, 2).join(' / '))}</small></div><p>${escapeHtml(item.description)}</p><p><b>품질과 볼 때:</b> ${escapeHtml(item.influence)}</p></article>`).join('') || '<p class="inspection-loading">Excel을 등록하면 호기별 항목 설명이 나타납니다.</p>'
  }

  function bindEvents() {
    ui.file.addEventListener('change', () => { resetPreview(); if (ui.file.files?.[0]) setStatus('파일을 선택했습니다. 미리보기로 날짜별 시트와 중복·신규 항목을 분석하세요.') })
    ui.parse.addEventListener('click', async () => {
      const file = ui.file.files?.[0]
      if (!file) { setStatus('먼저 업로드할 Excel 파일을 선택해 주세요.', 'error'); return }
      ui.parse.disabled = true
      setStatus('날짜별 시트를 읽고, 기존 공정 기록과 대조하고 있습니다…')
      try {
        const result = await inspectWorkbook(file)
        renderImportPreview(result)
        setStatus('분석이 끝났습니다. 호기·월·날짜별 처리 요약을 확인한 다음 저장하세요.', 'success')
      } catch (error) {
        resetPreview()
        setStatus(error instanceof Error ? error.message : 'Excel을 분석하지 못했습니다.', 'error')
      } finally { ui.parse.disabled = false }
    })
    ui.save.addEventListener('click', importWorkbook)
    ui.analysisMachine.addEventListener('change', () => { renderMeasureOptions(); renderProductOptions(); renderGlossary(); renderAnalysis() })
    ;[ui.processMeasure, ui.qualityMeasure, ui.product, ui.startDate, ui.endDate].forEach((element) => element.addEventListener('change', renderAnalysis))
  }

  async function start() {
    ui.qualityMeasure.innerHTML = QUALITY_MEASURES.map((measure) => `<option value="${escapeHtml(measure.key)}">${escapeHtml(measure.label)} (${escapeHtml(measure.unit)})</option>`).join('')
    bindEvents()
    try {
      await loadData()
      await loadAnalysis()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '공정/품질 데이터를 불러오지 못했습니다.', 'error')
      if (/관리자/.test(error.message)) ui.reports.innerHTML = '<tr><td colspan="7">관리자 로그인 후 확인할 수 있습니다.</td></tr>'
    }
  }

  start()
})()
