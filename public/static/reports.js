(() => {
  const form = document.getElementById('report-upload-form')
  const dateInput = document.getElementById('report-received-date')
  const fileInput = document.getElementById('report-file')
  const uploadButton = document.getElementById('report-upload-button')
  const status = document.getElementById('report-upload-status')
  const preview = document.getElementById('report-import-preview')
  const reportList = document.getElementById('report-list')
  const refreshButton = document.getElementById('refresh-reports')
  const noteInput = document.getElementById('report-note')

  if (!form || !dateInput || !fileInput || !reportList) return

  let importPreview = null
  const localDate = new Date()
  dateInput.value = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`

  function setStatus(message, kind = '') {
    status.textContent = message
    status.className = `report-status ${kind}`.trim()
  }

  function formatSize(size) {
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
    return `${Math.max(1, Math.round(size / 1024))} KB`
  }

  function formatTimestamp(value) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  function cell(row, value, className = '') {
    const td = document.createElement('td')
    if (className) td.className = className
    td.textContent = value || '—'
    row.append(td)
    return td
  }

  function normalizeDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
    if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
      const parts = window.XLSX.SSF.parse_date_code(value)
      if (parts?.y && parts?.m && parts?.d) return `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`
    }
    const text = String(value ?? '').trim()
    const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
    return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : ''
  }

  function recordKey(values) {
    const machine = String(values[1] ?? '').trim()
    const date = normalizeDate(values[2])
    const lot = String(values[9] ?? '').trim()
    if (!['초지3', '초지4', '초지5'].includes(machine) || !date || !lot) return null
    const hour = Number(values[5] ?? 0)
    const minute = Number(values[6] ?? 0)
    if (!Number.isInteger(hour) || hour < 0 || hour > 24 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null
    return JSON.stringify([machine, date, hour, minute, lot])
  }

  function comparable(value, index) {
    if (index === 2) return normalizeDate(value)
    if (index === 0) return String(value ?? '').replace(/^0+(?=\d)/, '').trim()
    return typeof value === 'string' ? value.trim() : value
  }

  function sameRecord(left, right) {
    return left.length === right.length && left.every((value, index) => {
      const a = comparable(value, index)
      const b = comparable(right[index], index)
      if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-7
      return a === b
    })
  }

  function renderPreview(result) {
    importPreview = result
    preview.hidden = false
    preview.className = `report-import-preview ${result.conflictCount ? 'has-conflicts' : 'is-ready'}`
    preview.textContent = `분석 반영 미리보기 — 신규 ${result.rows.length.toLocaleString('ko-KR')}건 · 기존과 동일 ${result.duplicateCount.toLocaleString('ko-KR')}건 · 값이 달라 확인 필요 ${result.conflictCount.toLocaleString('ko-KR')}건 · 형식 제외 ${result.skippedCount.toLocaleString('ko-KR')}행. 저장하면 신규 건만 추가하고 기존 행은 변경하지 않습니다.`
  }

  async function prepareExcelImport(file) {
    importPreview = null
    preview.hidden = true
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls'].includes(extension)) return null
    if (!window.XLSX) throw new Error('엑셀 읽기 모듈을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.')
    setStatus('엑셀의 초지345 시트를 읽고 기존 기록과 대조하고 있습니다. 파일을 다시 선택하거나 창을 닫지 마세요.')
    const datasetPromise = window.qInsightLoadInspectionDataset()
    const workbook = window.XLSX.read(await file.arrayBuffer(), {
      type: 'array',
      cellDates: true,
      dense: true,
      sheets: ['초지345'],
      sheetRows: 10000,
    })
    const sheet = workbook.Sheets['초지345']
    if (!sheet) throw new Error('엑셀에서 `초지345` 시트를 찾을 수 없습니다.')
    const sourceRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })
    const headings = sourceRows[2] || []
    if (!String(headings[1] || '').includes('생산호기') || !String(headings[2] || '').includes('날짜')) {
      throw new Error('초지345 시트의 열 구조가 예상과 다릅니다. 원본 데이터는 추가하지 않았습니다.')
    }
    const dataset = await datasetPromise
    const existing = new Map()
    dataset.rows.forEach((row) => {
      if (row.auxiliaryOnly) return
      const key = recordKey(row.values)
      if (key && !existing.has(key)) existing.set(key, row.values)
    })

    const newRows = []
    const incoming = new Map()
    let duplicateCount = 0
    let conflictCount = 0
    let skippedCount = 0
    for (let index = 3; index < sourceRows.length; index += 1) {
      const source = sourceRows[index]
      if (!source || !String(source[1] || '').trim()) continue
      const machine = String(source[1] || '').trim()
      if (!['초지3', '초지4', '초지5'].includes(machine)) continue
      if (!normalizeDate(source[2]) || !String(source[9] || '').trim()) {
        skippedCount += 1
        continue
      }
      const values = Array.from({ length: 44 }, (_, column) => source[column] ?? null)
      values[0] = `${Number(normalizeDate(values[2]).slice(5, 7))}월`
      values[2] = normalizeDate(values[2])
      const key = recordKey(values)
      if (!key) {
        skippedCount += 1
        continue
      }
      const previousIncoming = incoming.get(key)
      if (previousIncoming) {
        if (sameRecord(previousIncoming, values)) duplicateCount += 1
        else conflictCount += 1
        continue
      }
      incoming.set(key, values)
      const previous = existing.get(key)
      if (previous) {
        if (sameRecord(previous, values)) duplicateCount += 1
        else conflictCount += 1
        continue
      }
      newRows.push({ values, excelRow: index + 1 })
    }
    const result = { rows: newRows, duplicateCount, conflictCount: conflictCount + skippedCount, skippedCount }
    renderPreview(result)
    setStatus('엑셀 비교가 완료됐습니다. 미리보기 결과를 확인한 뒤 저장해 주세요.', 'success')
    return result
  }

  async function loadReports() {
    reportList.innerHTML = '<tr><td colspan="7" class="inspection-loading">첨부 이력을 불러오는 중입니다.</td></tr>'
    try {
      const response = await fetch('/api/reports', { credentials: 'same-origin' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '첨부 이력을 불러오지 못했습니다.')
      reportList.replaceChildren()
      if (!result.reports?.length) {
        reportList.innerHTML = '<tr><td colspan="7" class="report-empty">아직 등록된 검사성적서가 없습니다. 오늘 받은 파일을 첨부해 보세요.</td></tr>'
        return
      }
      result.reports.forEach((report) => {
        const row = document.createElement('tr')
        cell(row, report.received_date)
        cell(row, report.original_name, 'report-name-cell')
        cell(row, report.note || '—', 'report-note-cell')
        cell(row, formatSize(report.size_bytes))
        const summary = report.import_status === 'imported' || report.import_status === 'needs_review'
          ? `신규 ${Number(report.imported_count || 0)}건 · 중복 ${Number(report.duplicate_count || 0)}건${Number(report.conflict_count || 0) ? ` · 확인 ${Number(report.conflict_count)}건` : ''}`
          : report.import_status === 'failed' ? '분석 반영 실패' : report.import_status === 'archive_only' ? '원본만 보관' : '미처리'
        const summaryCell = cell(row, summary, 'report-import-cell')
        if (report.import_status === 'needs_review' || Number(report.conflict_count || 0)) summaryCell.classList.add('report-import-warning')
        cell(row, formatTimestamp(report.uploaded_at))
        const actions = document.createElement('td')
        actions.className = 'report-actions'
        const download = document.createElement('a')
        download.className = 'report-download-link'
        download.href = `/api/reports/${encodeURIComponent(report.id)}/download`
        download.textContent = '다운로드'
        download.setAttribute('aria-label', `${report.original_name} 다운로드`)
        actions.append(download)
        if (Number(report.imported_count || 0) === 0) {
          const remove = document.createElement('button')
          remove.type = 'button'
          remove.className = 'report-delete-button'
          remove.dataset.reportDelete = report.id
          remove.textContent = '삭제'
          actions.append(remove)
        } else {
          const applied = document.createElement('span')
          applied.className = 'report-protected-label'
          applied.textContent = '반영됨'
          actions.append(applied)
        }
        row.append(actions)
        reportList.append(row)
      })
    } catch (error) {
      reportList.innerHTML = ''
      const row = document.createElement('tr')
      const message = document.createElement('td')
      message.colSpan = 7
      message.className = 'report-empty report-error'
      message.textContent = error instanceof Error ? error.message : '첨부 이력을 불러오지 못했습니다.'
      row.append(message)
      reportList.append(row)
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    importPreview = null
    preview.hidden = true
    if (!file || !/\.xlsx?$/i.test(file.name)) {
      setStatus(file ? 'PDF는 원본만 보관됩니다. 검사 데이터에는 자동 반영되지 않습니다.' : '')
      return
    }
    uploadButton.disabled = true
    try {
      await prepareExcelImport(file)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '엑셀 시트를 읽지 못했습니다.', 'error')
    } finally {
      uploadButton.disabled = false
    }
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const file = fileInput.files?.[0]
    if (!file) {
      setStatus('첨부할 파일을 선택해 주세요.', 'error')
      return
    }
    const isExcel = /\.xlsx?$/i.test(file.name)
    uploadButton.disabled = true
    try {
      if (isExcel && !importPreview) await prepareExcelImport(file)
      if (isExcel && !importPreview) throw new Error('엑셀 미리보기를 만들지 못해 저장을 중단했습니다.')
      const data = new FormData(form)
      if (isExcel) data.set('inspectionRows', JSON.stringify(importPreview))
      setStatus('원본 파일과 신규 검사행을 저장하고 있습니다. 파일 크기에 따라 잠시 걸릴 수 있습니다.')
      const response = await fetch('/api/reports', { method: 'POST', credentials: 'same-origin', body: data })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '파일을 저장하지 못했습니다.')
      if (isExcel) {
        setStatus(`저장 완료 — 신규 ${Number(result.importedCount || 0).toLocaleString('ko-KR')}건 반영, 동일 ${Number(result.duplicateCount || 0).toLocaleString('ko-KR')}건 건너뜀, 확인 필요 ${Number(result.conflictCount || 0).toLocaleString('ko-KR')}건.`, result.conflictCount ? 'warning' : 'success')
      } else {
        setStatus('원본 파일을 보관했습니다. PDF 내용은 분석 데이터에 반영되지 않습니다.', 'success')
      }
      fileInput.value = ''
      noteInput.value = ''
      importPreview = null
      preview.hidden = true
      await loadReports()
      window.qInsightInspectionDatasetPromise = null
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '파일을 저장하지 못했습니다.', 'error')
    } finally {
      uploadButton.disabled = false
    }
  })

  reportList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-report-delete]')
    if (!button) return
    const row = button.closest('tr')
    const name = row.querySelector('.report-name-cell')?.textContent?.trim() || '이 파일'
    if (!window.confirm(`${name}을(를) 첨부 이력에서 영구 삭제할까요?`)) return
    button.disabled = true
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(button.dataset.reportDelete)}`, { method: 'DELETE', credentials: 'same-origin' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '삭제하지 못했습니다.')
      setStatus('파일과 이력을 삭제했습니다.', 'success')
      await loadReports()
    } catch (error) {
      button.disabled = false
      setStatus(error instanceof Error ? error.message : '삭제하지 못했습니다.', 'error')
    }
  })

  refreshButton.addEventListener('click', loadReports)
  loadReports()
})()
