(() => {
  const form = document.getElementById('report-upload-form')
  const dateInput = document.getElementById('report-received-date')
  const fileInput = document.getElementById('report-file')
  const uploadButton = document.getElementById('report-upload-button')
  const status = document.getElementById('report-upload-status')
  const reportList = document.getElementById('report-list')
  const refreshButton = document.getElementById('refresh-reports')

  if (!form || !dateInput || !fileInput || !reportList) return

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

  async function loadReports() {
    reportList.innerHTML = '<tr><td colspan="6" class="inspection-loading">첨부 이력을 불러오는 중입니다.</td></tr>'
    try {
      const response = await fetch('/api/reports', { credentials: 'same-origin' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '첨부 이력을 불러오지 못했습니다.')
      reportList.replaceChildren()
      if (!result.reports?.length) {
        reportList.innerHTML = '<tr><td colspan="6" class="report-empty">아직 등록된 검사성적서가 없습니다. 오늘 받은 파일을 첨부해 보세요.</td></tr>'
        return
      }
      result.reports.forEach((report) => {
        const row = document.createElement('tr')
        cell(row, report.received_date)
        cell(row, report.original_name, 'report-name-cell')
        cell(row, report.note || '—', 'report-note-cell')
        cell(row, formatSize(report.size_bytes))
        cell(row, formatTimestamp(report.uploaded_at))
        const actions = document.createElement('td')
        actions.className = 'report-actions'
        const download = document.createElement('a')
        download.className = 'report-download-link'
        download.href = `/api/reports/${encodeURIComponent(report.id)}/download`
        download.textContent = '다운로드'
        download.setAttribute('aria-label', `${report.original_name} 다운로드`)
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'report-delete-button'
        remove.dataset.reportDelete = report.id
        remove.textContent = '삭제'
        actions.append(download, remove)
        row.append(actions)
        reportList.append(row)
      })
    } catch (error) {
      reportList.innerHTML = ''
      const row = document.createElement('tr')
      const message = document.createElement('td')
      message.colSpan = 6
      message.className = 'report-empty report-error'
      message.textContent = error instanceof Error ? error.message : '첨부 이력을 불러오지 못했습니다.'
      row.append(message)
      reportList.append(row)
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const file = fileInput.files?.[0]
    if (!file) {
      setStatus('첨부할 파일을 선택해 주세요.', 'error')
      return
    }
    uploadButton.disabled = true
    setStatus('파일을 안전하게 저장하고 있습니다. 파일 크기에 따라 잠시 걸릴 수 있습니다.')
    const data = new FormData(form)
    try {
      const response = await fetch('/api/reports', { method: 'POST', credentials: 'same-origin', body: data })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '파일을 저장하지 못했습니다.')
      setStatus('검사성적서를 저장했습니다. 첨부 이력에서 확인할 수 있습니다.', 'success')
      fileInput.value = ''
      document.getElementById('report-note').value = ''
      await loadReports()
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
    const name = row.querySelector('.report-name-cell')?.childNodes[0]?.textContent?.trim() || '이 파일'
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
