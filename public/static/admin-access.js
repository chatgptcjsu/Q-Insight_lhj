(() => {
  const dialog = document.getElementById('admin-access-dialog')
  const form = document.getElementById('admin-access-form')
  const fields = document.getElementById('admin-dialog-fields')
  const title = document.getElementById('admin-dialog-title')
  const description = document.getElementById('admin-dialog-description')
  const status = document.getElementById('admin-dialog-status')
  const submitButton = document.getElementById('admin-dialog-submit')
  const forgotButton = dialog.querySelector('[data-admin-forgot]')
  const closeButton = dialog.querySelector('[data-admin-dialog-close]')
  const isProductPage = location.pathname === '/products'
  let mode = 'login'
  let redirectToProducts = false

  function setStatus(message, kind = '') {
    status.textContent = message
    status.className = `admin-dialog-status ${kind}`.trim()
  }

  function fieldDefinitions(items) {
    fields.replaceChildren()
    items.forEach(({ id, label, type = 'password', inputMode = 'numeric', autocomplete = 'off' }) => {
      const wrapper = document.createElement('label')
      wrapper.className = 'admin-dialog-field'
      wrapper.htmlFor = id
      const caption = document.createElement('span')
      caption.textContent = label
      const input = document.createElement('input')
      input.id = id
      input.name = id
      input.type = type
      input.inputMode = inputMode
      input.autocomplete = autocomplete
      input.required = true
      if (id !== 'recovery-code') {
        input.minLength = 4
        input.maxLength = 12
        input.pattern = '[0-9]{4,12}'
      }
      wrapper.append(caption, input)
      fields.append(wrapper)
    })
    fields.querySelector('input')?.focus()
  }

  function setMode(nextMode, message = '') {
    mode = nextMode
    setStatus(message)
    forgotButton.hidden = nextMode !== 'login'
    closeButton.hidden = false
    submitButton.hidden = false
    submitButton.disabled = false

    if (nextMode === 'login') {
      title.textContent = '관리자 확인'
      description.textContent = '관리자 PIN을 입력해 주세요.'
      submitButton.textContent = '확인'
      fieldDefinitions([{ id: 'admin-pin', label: 'PIN', autocomplete: 'current-password' }])
    } else if (nextMode === 'initial-change') {
      title.textContent = '초기 PIN 변경'
      description.textContent = '초기 PIN 확인이 완료됐습니다. 새 PIN을 설정해 주세요.'
      submitButton.textContent = 'PIN 설정'
      fieldDefinitions([
        { id: 'new-pin', label: '새 PIN (숫자 4~12자리)', autocomplete: 'new-password' },
        { id: 'confirm-pin', label: '새 PIN 확인', autocomplete: 'new-password' },
      ])
    } else if (nextMode === 'change') {
      title.textContent = '관리자 PIN 변경'
      description.textContent = '현재 PIN을 확인하고 새 PIN을 설정합니다.'
      submitButton.textContent = '변경 저장'
      fieldDefinitions([
        { id: 'current-pin', label: '현재 PIN', autocomplete: 'current-password' },
        { id: 'new-pin', label: '새 PIN (숫자 4~12자리)', autocomplete: 'new-password' },
        { id: 'confirm-pin', label: '새 PIN 확인', autocomplete: 'new-password' },
      ])
    } else if (nextMode === 'recover') {
      title.textContent = 'PIN 복구'
      description.textContent = '별도로 보관한 복구 코드와 새 PIN을 입력해 주세요.'
      submitButton.textContent = 'PIN 재설정'
      fieldDefinitions([
        { id: 'recovery-code', label: '복구 코드', type: 'text', inputMode: 'text' },
        { id: 'new-pin', label: '새 PIN (숫자 4~12자리)', autocomplete: 'new-password' },
        { id: 'confirm-pin', label: '새 PIN 확인', autocomplete: 'new-password' },
      ])
    } else if (nextMode === 'rotate-recovery') {
      title.textContent = '복구 코드 재발급'
      description.textContent = '현재 PIN을 입력하면 기존 코드를 폐기하고 새 코드를 발급합니다.'
      submitButton.textContent = '코드 재발급'
      fieldDefinitions([{ id: 'current-pin', label: '현재 PIN', autocomplete: 'current-password' }])
    }

    if (!dialog.open) dialog.showModal()
  }

  function inputValue(id) {
    return fields.querySelector(`#${id}`)?.value.trim() || ''
  }

  async function post(path, body) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || '요청을 처리하지 못했습니다.')
    return result
  }

  function showRecoveryCode(code) {
    mode = 'show-recovery'
    title.textContent = '복구 코드를 안전하게 보관하세요'
    description.textContent = 'PIN을 잊었을 때 필요한 코드입니다. 지금 한 번만 표시되니 화면 밖에 보관해 주세요.'
    fields.replaceChildren()
    const codeBox = document.createElement('code')
    codeBox.className = 'admin-recovery-code'
    codeBox.textContent = code
    fields.append(codeBox)
    setStatus('메모한 뒤 안전한 장소에 보관하세요. 이 코드를 분실하면 관리자가 다시 재설정해야 합니다.', 'warning')
    submitButton.textContent = '코드를 보관했습니다'
    submitButton.disabled = false
    closeButton.hidden = true
    forgotButton.hidden = true
    if (!dialog.open) dialog.showModal()
  }

  function finishLogin(result) {
    if (result.recoveryCode) {
      showRecoveryCode(result.recoveryCode)
      return
    }
    dialog.close()
    if (isProductPage) location.reload()
    else if (redirectToProducts) {
      redirectToProducts = false
      location.assign('/products')
    }
  }

  function validateNewPin() {
    const pin = inputValue('new-pin')
    if (!/^[0-9]{4,12}$/.test(pin)) throw new Error('새 PIN은 숫자 4~12자리로 입력해 주세요.')
    if (pin === '0000') throw new Error('초기 PIN 0000과 다른 번호를 설정해 주세요.')
    if (pin !== inputValue('confirm-pin')) throw new Error('새 PIN 확인이 일치하지 않습니다.')
    return pin
  }

  async function handleSubmit(event) {
    event.preventDefault()
    submitButton.disabled = true
    setStatus('확인 중입니다.')
    try {
      if (mode === 'show-recovery') {
        dialog.close()
        if (isProductPage) location.reload()
        else if (redirectToProducts) {
          redirectToProducts = false
          location.assign('/products')
        }
        return
      }

      if (mode === 'login') {
        const result = await post('/api/admin/login', { pin: inputValue('admin-pin') })
        if (result.mustChange) {
          redirectToProducts = !isProductPage
          setMode('initial-change')
        } else finishLogin(result)
        return
      }

      if (mode === 'initial-change') {
        const newPin = validateNewPin()
        const result = await post('/api/admin/change-pin', { currentPin: '0000', newPin })
        finishLogin(result)
        return
      }

      if (mode === 'change') {
        const newPin = validateNewPin()
        const result = await post('/api/admin/change-pin', { currentPin: inputValue('current-pin'), newPin })
        finishLogin(result)
        return
      }

      if (mode === 'recover') {
        const newPin = validateNewPin()
        const recoveryCode = inputValue('recovery-code').replace(/[\s-]/g, '').toUpperCase()
        const result = await post('/api/admin/recover', { recoveryCode, newPin })
        finishLogin(result)
        return
      }

      if (mode === 'rotate-recovery') {
        const result = await post('/api/admin/rotate-recovery', { currentPin: inputValue('current-pin') })
        showRecoveryCode(result.recoveryCode)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.', 'error')
      submitButton.disabled = false
      fields.querySelector('input')?.focus()
    }
  }

  document.addEventListener('click', async (event) => {
    if (event.target.closest('[data-admin-entry]')) {
      event.preventDefault()
      redirectToProducts = !isProductPage
      try {
        const response = await fetch('/api/admin/status', { credentials: 'same-origin' })
        const current = await response.json()
        if (current.authenticated && !current.mustChange) location.assign('/products')
        else setMode('login')
      } catch {
        setMode('login', '관리자 인증 서버에 연결하지 못했습니다.')
      }
    } else if (event.target.closest('[data-admin-change-pin]')) {
      setMode('change')
    } else if (event.target.closest('[data-admin-rotate-recovery]')) {
      setMode('rotate-recovery')
    } else if (event.target.closest('[data-admin-logout]')) {
      await post('/api/admin/logout', {}).catch(() => {})
      location.assign('/')
    } else if (event.target.closest('[data-admin-forgot]')) {
      setMode('recover')
    } else if (event.target.closest('[data-admin-dialog-close]')) {
      if (dialog.open) dialog.close()
      if (isProductPage) location.assign('/')
      redirectToProducts = false
    }
  })

  form.addEventListener('submit', handleSubmit)
  closeButton.addEventListener('click', () => {
    if (dialog.open) dialog.close()
    if (isProductPage) location.assign('/')
    redirectToProducts = false
  })
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && mode !== 'show-recovery') {
      dialog.close()
      if (isProductPage) location.assign('/')
      redirectToProducts = false
    }
  })
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    if (mode === 'show-recovery') return
    dialog.close()
    if (isProductPage) location.assign('/')
    redirectToProducts = false
  })

  if (isProductPage) {
    const protectedPage = document.querySelector('[data-admin-protected]')
    if (protectedPage) protectedPage.classList.add('admin-authorized')
  } else if (new URLSearchParams(location.search).has('admin')) {
    redirectToProducts = true
    setMode('login')
  }
})()
