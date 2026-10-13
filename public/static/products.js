(() => {
  const SETTINGS_KEY = 'q-insight-product-aliases-v1'
  const DEFAULT_ALIASES = [
    { machine: '초지3', alias: '깨/나 (일반) 2P (초3)', canonical: '깨/나 (일반) 2P' },
  ]
  const ui = {
    form: document.getElementById('product-form'),
    machine: document.getElementById('product-machine'),
    canonical: document.getElementById('product-canonical'),
    alias: document.getElementById('product-alias'),
    aliasField: document.getElementById('product-alias-field'),
    aliasLabel: document.getElementById('product-alias-label'),
    canonicalLabel: document.getElementById('product-canonical-label'),
    sourceNameFixedField: document.getElementById('source-name-fixed-field'),
    sourceNameFixed: document.getElementById('source-name-fixed'),
    editKey: document.getElementById('product-edit-key'),
    title: document.getElementById('product-form-title'),
    save: document.getElementById('save-product-entry'),
    cancel: document.getElementById('cancel-product-edit'),
    status: document.getElementById('product-manager-status'),
    search: document.getElementById('product-search'),
    body: document.getElementById('product-list-body'),
  }
  let sourceProducts = []
  let settings = readSettings()
  let groups = []

  function readSettings() {
    try {
      const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
      return {
        aliases: Array.isArray(value.aliases) ? value.aliases : [],
        sourceRenames: Array.isArray(value.sourceRenames) ? value.sourceRenames : [],
        customProducts: Array.isArray(value.customProducts) ? value.customProducts : [],
        disabledDefaults: Array.isArray(value.disabledDefaults) ? value.disabledDefaults : [],
      }
    } catch {
      return { aliases: [], sourceRenames: [], customProducts: [], disabledDefaults: [] }
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      return true
    } catch {
      setStatus('브라우저 저장소에 기록하지 못했습니다. 이 설정은 유지되지 않을 수 있습니다.', 'error')
      return false
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
  }

  function setStatus(message, type = '') {
    ui.status.textContent = message
    ui.status.className = `product-manager-status ${type}`.trim()
  }

  function defaultAliasKey(machine, alias) {
    return JSON.stringify([machine, alias])
  }

  function encodeKey(parts) {
    return encodeURIComponent(JSON.stringify(parts))
  }

  function decodeKey(value) {
    try { return JSON.parse(decodeURIComponent(value)) } catch { return [] }
  }

  function displayedSourceName(machine, sourceName) {
    return settings.sourceRenames.find((entry) => entry.machine === machine && entry.sourceName === sourceName)?.displayName || sourceName
  }

  function aliasFor(machine, sourceName) {
    return settings.aliases.find((entry) => entry.machine === machine && entry.alias === sourceName)?.canonical || sourceName
  }

  function rebuildGroups() {
    const grouped = new Map()
    sourceProducts.forEach(({ machine, sourceName, rawSourceName, count }) => {
      const canonical = aliasFor(machine, sourceName)
      const key = JSON.stringify([machine, canonical])
      if (!grouped.has(key)) grouped.set(key, { machine, canonical, sourceNames: new Set(), sourceEntries: new Map(), rowCount: 0, custom: false })
      const group = grouped.get(key)
      group.sourceNames.add(sourceName)
      group.sourceEntries.set(JSON.stringify([rawSourceName, sourceName]), { rawSourceName, sourceName })
      group.rowCount += count
    })
    settings.customProducts.forEach((entry) => {
      const key = JSON.stringify([entry.machine, entry.canonical])
      if (!grouped.has(key)) grouped.set(key, { machine: entry.machine, canonical: entry.canonical, sourceNames: new Set(), sourceEntries: new Map(), rowCount: 0, custom: true })
      else grouped.get(key).custom = true
    })
    groups = [...grouped.values()].map((group) => ({ ...group, sourceNames: [...group.sourceNames].sort((a, b) => a.localeCompare(b, 'ko')), sourceEntries: [...group.sourceEntries.values()] }))
      .sort((a, b) => a.machine.localeCompare(b.machine, 'ko') || a.canonical.localeCompare(b.canonical, 'ko'))
  }

  function renderList() {
    const query = ui.search.value.trim().toLocaleLowerCase('ko-KR')
    const visibleGroups = groups.filter((group) => `${group.machine} ${group.canonical} ${group.sourceNames.join(' ')}`.toLocaleLowerCase('ko-KR').includes(query))
    if (!visibleGroups.length) {
      ui.body.innerHTML = '<tr><td colspan="4" class="inspection-empty-row">해당하는 품명이 없습니다. 새 표준 품명을 등록해 보세요.</td></tr>'
      return
    }
    ui.body.innerHTML = visibleGroups.map((group) => {
      const aliases = settings.aliases.filter((entry) => entry.machine === group.machine && entry.canonical === group.canonical)
      const namesForDisplay = [...new Set([...group.sourceNames, ...aliases.map((entry) => entry.alias)])]
      const originalNames = namesForDisplay.length ? namesForDisplay : ['원본 데이터 없음']
      const aliasMarkup = originalNames.map((name) => {
        const aliasEntry = aliases.find((entry) => entry.alias === name)
        return `<span class="product-name-chip ${aliasEntry ? 'mapped-chip' : ''}">${escapeHtml(name)}${aliasEntry ? '<small>별칭</small>' : ''}</span>`
      }).join('')
      const aliasActions = aliases.map((entry) => `<button type="button" class="text-action" data-edit-alias="${escapeHtml(encodeKey([entry.machine, entry.alias]))}">별칭 수정</button><button type="button" class="text-action danger-action" data-delete-alias="${escapeHtml(encodeKey([entry.machine, entry.alias]))}">삭제</button>`).join('')
      const correctionActions = group.sourceEntries.map(({ rawSourceName, sourceName }) => `<button type="button" class="text-action correction-action" data-correct-source="${escapeHtml(encodeKey([group.machine, rawSourceName, sourceName, group.canonical]))}">원본명 수정</button>`).join('')
      const customAction = group.custom ? `<button type="button" class="text-action" data-edit-custom="${escapeHtml(encodeKey([group.machine, group.canonical]))}">표준명 수정</button><button type="button" class="text-action danger-action" data-delete-custom="${escapeHtml(encodeKey([group.machine, group.canonical]))}">삭제</button>` : ''
      return `<tr><td><span class="machine-pill">${escapeHtml(group.machine)}</span></td><td><strong class="canonical-name">${escapeHtml(group.canonical)}</strong>${group.custom ? '<span class="custom-product-tag">직접 등록</span>' : ''}<small class="product-row-count">원본 검사 행 ${group.rowCount.toLocaleString('ko-KR')}건</small></td><td><div class="product-name-chips">${aliasMarkup}</div></td><td><div class="product-actions">${correctionActions}${aliasActions}${customAction}<button type="button" class="text-action add-alias-action" data-add-alias="${escapeHtml(encodeKey([group.machine, group.canonical]))}">별칭 추가</button></div></td></tr>`
    }).join('')
  }

  function resetForm() {
    ui.form.reset()
    ui.editKey.value = ''
    ui.machine.value = '초지3'
    ui.aliasField.hidden = false
    ui.sourceNameFixedField.hidden = true
    ui.sourceNameFixed.required = false
    ui.aliasLabel.textContent = '추가할 원본 별칭 (선택)'
    ui.canonicalLabel.textContent = '표준 품명'
    ui.title.textContent = '표준 품명 또는 별칭 추가'
    ui.save.textContent = '품명 등록'
    ui.cancel.hidden = true
  }

  function beginEdit(machine, canonical, alias = '') {
    const formPanel = ui.form.closest('.product-form-panel')
    if (formPanel) formPanel.open = true
    ui.machine.value = machine
    ui.canonical.value = canonical
    ui.alias.value = alias
    ui.aliasField.hidden = false
    ui.sourceNameFixedField.hidden = true
    ui.sourceNameFixed.required = false
    ui.aliasLabel.textContent = '원본 별칭'
    ui.canonicalLabel.textContent = '표준 품명'
    ui.editKey.value = JSON.stringify(alias ? ['alias', machine, alias] : ['custom', machine, canonical])
    ui.title.textContent = alias ? '품명 별칭 수정' : '직접 등록 품명 수정'
    ui.save.textContent = '변경 저장'
    ui.cancel.hidden = false
    setStatus('품명을 수정한 뒤 저장하세요.')
    ui.canonical.focus()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function beginSourceCorrection(machine, rawSourceName, sourceName, canonical) {
    const formPanel = ui.form.closest('.product-form-panel')
    if (formPanel) formPanel.open = true
    ui.machine.value = machine
    ui.canonical.value = canonical
    ui.alias.value = ''
    ui.editKey.value = JSON.stringify(['sourceCorrection', machine, rawSourceName, sourceName])
    ui.aliasField.hidden = true
    ui.sourceNameFixed.required = true
    ui.sourceNameFixed.value = sourceName
    ui.sourceNameFixedField.hidden = false
    ui.canonicalLabel.textContent = '분석에 사용할 표준 품명'
    ui.title.textContent = '원본 품명 표시 수정'
    ui.save.textContent = '변경 저장'
    ui.cancel.hidden = false
    setStatus('수정한 원본 품명 표시는 품목 필터·비교·관리 목록에 반영됩니다. 실제 엑셀 행은 보존됩니다.')
    ui.canonical.focus()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function removeAlias(machine, alias) {
    const existing = settings.aliases.find((entry) => entry.machine === machine && entry.alias === alias)
    if (!existing || !window.confirm(`‘${alias}’ 별칭 연결을 삭제할까요? 원본 데이터는 변경되지 않습니다.`)) return
    settings.aliases = settings.aliases.filter((entry) => !(entry.machine === machine && entry.alias === alias))
    if (DEFAULT_ALIASES.some((entry) => entry.machine === machine && entry.alias === alias)) {
      const key = defaultAliasKey(machine, alias)
      if (!settings.disabledDefaults.includes(key)) settings.disabledDefaults.push(key)
    }
    if (saveSettings()) {
      rebuildGroups(); renderList(); setStatus('별칭 연결을 삭제했습니다. 원본 행은 보존됩니다.', 'success')
    }
  }

  function removeCustom(machine, canonical) {
    if (!settings.customProducts.some((entry) => entry.machine === machine && entry.canonical === canonical)) return
    if (!window.confirm(`‘${canonical}’ 직접 등록 품명을 삭제할까요?`)) return
    settings.customProducts = settings.customProducts.filter((entry) => !(entry.machine === machine && entry.canonical === canonical))
    if (saveSettings()) {
      rebuildGroups(); renderList(); setStatus('직접 등록 품명을 삭제했습니다.', 'success')
    }
  }

  function bindEvents() {
    ui.form.addEventListener('submit', (event) => {
      event.preventDefault()
      const machine = ui.machine.value
      const canonical = ui.canonical.value.trim()
      const editKey = ui.editKey.value
      const editParts = editKey ? JSON.parse(editKey) : []
      const alias = ui.alias.value.trim()
      if (!canonical) return setStatus('표준 품명을 입력해 주세요.', 'error')
      if (editParts[0] === 'sourceCorrection') {
        const [, sourceMachine, rawSourceName, previousDisplayName] = editParts
        const displayName = ui.sourceNameFixed.value.trim()
        if (!displayName) return setStatus('수정할 원본 품명 표시를 입력해 주세요.', 'error')
        settings.sourceRenames = settings.sourceRenames.filter((entry) => !(entry.machine === sourceMachine && entry.sourceName === rawSourceName))
        if (displayName !== rawSourceName) settings.sourceRenames.push({ machine: sourceMachine, sourceName: rawSourceName, displayName })
        if (DEFAULT_ALIASES.some((entry) => entry.machine === sourceMachine && entry.alias === previousDisplayName)) {
          const key = defaultAliasKey(sourceMachine, previousDisplayName)
          if (!settings.disabledDefaults.includes(key)) settings.disabledDefaults.push(key)
        }
        settings.aliases = settings.aliases.filter((entry) => !(entry.machine === sourceMachine && entry.alias === previousDisplayName))
        if (displayName !== canonical) settings.aliases.push({ machine: sourceMachine, alias: displayName, canonical })
        if (saveSettings()) {
          rebuildGroups(); renderList(); resetForm()
          setStatus(`원본 품명 표시를 ‘${displayName}’(으)로 수정했습니다. 실제 엑셀 원본은 변경되지 않았습니다.`, 'success')
        }
        return
      }
      if (alias && alias === canonical) return setStatus('별칭과 표준 품명이 같습니다. 별칭을 비우고 저장해 주세요.', 'error')
      if (editParts[0] === 'alias') {
        if (DEFAULT_ALIASES.some((entry) => entry.machine === editParts[1] && entry.alias === editParts[2])) {
          const key = defaultAliasKey(editParts[1], editParts[2])
          if (!settings.disabledDefaults.includes(key)) settings.disabledDefaults.push(key)
        }
        settings.aliases = settings.aliases.filter((entry) => !(entry.machine === editParts[1] && entry.alias === editParts[2]))
      }
      if (editParts[0] === 'custom') settings.customProducts = settings.customProducts.filter((entry) => !(entry.machine === editParts[1] && entry.canonical === editParts[2]))

      if (alias) {
        const collision = settings.aliases.find((entry) => entry.machine === machine && entry.alias === alias && !(entry.machine === editParts[1] && entry.alias === editParts[2]))
        if (collision && collision.canonical !== canonical) return setStatus(`‘${alias}’ 표기는 이미 ‘${collision.canonical}’에 연결되어 있습니다. 기존 연결을 먼저 수정해 주세요.`, 'error')
        const editingThisAlias = editParts[0] === 'alias' && editParts[1] === machine && editParts[2] === alias
        const correctingThisSource = editParts[0] === 'sourceCorrection' && editParts[1] === machine && editParts[2] === alias
        const sameAsDifferentCanonical = sourceProducts.some((item) => item.machine === machine && item.sourceName === alias && aliasFor(machine, alias) !== canonical && !editingThisAlias && !correctingThisSource && !settings.aliases.some((entry) => entry.machine === machine && entry.alias === alias))
        if (sameAsDifferentCanonical) return setStatus('해당 표기가 실제 원본 품명으로 이미 사용 중입니다. 표준 품명으로 추가하거나 기존 품목을 확인해 주세요.', 'error')
        if (!collision) settings.aliases.push({ machine, alias, canonical })
        const canonicalExists = sourceProducts.some((item) => item.machine === machine && aliasFor(machine, item.sourceName) === canonical)
          || settings.customProducts.some((entry) => entry.machine === machine && entry.canonical === canonical)
        if (!canonicalExists) settings.customProducts.push({ machine, canonical })
      } else {
        const sourceExists = sourceProducts.some((item) => item.machine === machine && aliasFor(machine, item.sourceName) === canonical)
        if (!sourceExists && !settings.customProducts.some((entry) => entry.machine === machine && entry.canonical === canonical)) settings.customProducts.push({ machine, canonical })
      }

      if (saveSettings()) {
        rebuildGroups(); renderList(); resetForm()
        setStatus(editParts[0] === 'sourceCorrection' ? `원본 ‘${alias}’을(를) 분석용 ‘${canonical}’로 교정했습니다. 원본 데이터는 변경하지 않았습니다.` : alias ? `‘${alias}’을(를) ‘${canonical}’로 연결했습니다.` : `‘${canonical}’ 표준 품명을 확인했습니다.`, 'success')
      }
    })

    ui.body.addEventListener('click', (event) => {
      const editAlias = event.target.closest('[data-edit-alias]')
      const addAlias = event.target.closest('[data-add-alias]')
      const editCustom = event.target.closest('[data-edit-custom]')
      const deleteAlias = event.target.closest('[data-delete-alias]')
      const deleteCustom = event.target.closest('[data-delete-custom]')
      if (editAlias) {
        const [machine, alias] = decodeKey(editAlias.dataset.editAlias)
        const entry = settings.aliases.find((item) => item.machine === machine && item.alias === alias)
        if (entry) beginEdit(machine, entry.canonical, entry.alias)
      } else if (addAlias) {
        const [machine, canonical] = decodeKey(addAlias.dataset.addAlias)
        beginEdit(machine, canonical, '')
        ui.editKey.value = ''
      } else if (editCustom) {
        const [machine, canonical] = decodeKey(editCustom.dataset.editCustom)
        beginEdit(machine, canonical)
      } else if (event.target.closest('[data-correct-source]')) {
        const [machine, rawSourceName, sourceName, canonical] = decodeKey(event.target.closest('[data-correct-source]').dataset.correctSource)
        beginSourceCorrection(machine, rawSourceName, sourceName, canonical)
      } else if (deleteAlias) {
        const [machine, alias] = decodeKey(deleteAlias.dataset.deleteAlias)
        removeAlias(machine, alias)
      } else if (deleteCustom) {
        const [machine, canonical] = decodeKey(deleteCustom.dataset.deleteCustom)
        removeCustom(machine, canonical)
      }
    })
    ui.cancel.addEventListener('click', () => { resetForm(); setStatus('편집을 취소했습니다.') })
    ui.search.addEventListener('input', renderList)
  }

  async function start() {
    try {
      const dataset = await window.qInsightLoadInspectionDataset()
      const map = new Map()
      dataset.rows.forEach((row) => {
        if (row.auxiliaryOnly) return
        const machine = row.values[1]
        const rawSourceName = row.values[10]
        if (!machine || !rawSourceName) return
        const sourceName = displayedSourceName(machine, rawSourceName)
        const key = JSON.stringify([machine, rawSourceName])
        map.set(key, { machine, sourceName, rawSourceName, count: (map.get(key)?.count || 0) + 1 })
      })
      sourceProducts = [...map.values()]
      const seededAliases = [...DEFAULT_ALIASES.filter((entry) => !settings.disabledDefaults.includes(defaultAliasKey(entry.machine, entry.alias))), ...settings.aliases]
      settings.aliases = seededAliases.filter((entry, index, all) => all.findIndex((other) => other.machine === entry.machine && other.alias === entry.alias) === index)
      rebuildGroups()
      renderList()
      bindEvents()
      setStatus(`${sourceProducts.length.toLocaleString('ko-KR')}개 호기·원본 품명 조합을 확인했습니다. 새 품명은 이 화면에서 추가할 수 있습니다.`, 'success')
    } catch (error) {
      ui.body.innerHTML = '<tr><td colspan="4" class="inspection-empty-row">초지345 데이터를 읽지 못했습니다.</td></tr>'
      setStatus(error instanceof Error ? error.message : '품명 정보를 읽지 못했습니다.', 'error')
    }
  }

  start()
})()
