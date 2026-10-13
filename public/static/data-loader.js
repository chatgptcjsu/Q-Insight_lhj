(() => {
  function recordKey(values) {
    const machine = String(values[1] ?? '').trim()
    const date = String(values[2] ?? '').slice(0, 10)
    const lot = String(values[9] ?? '').trim()
    if (!['초지3', '초지4', '초지5'].includes(machine) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !lot) return null
    return JSON.stringify([machine, date, Number(values[5] ?? 0), Number(values[6] ?? 0), lot])
  }

  window.qInsightLoadInspectionDataset = window.qInsightLoadInspectionDataset || (() => {
    window.qInsightInspectionDatasetPromise = window.qInsightInspectionDatasetPromise || Promise.all([
      fetch('/static/inspection-data.json', { cache: 'no-cache' }),
      fetch('/api/inspection-records', { cache: 'no-store' }),
    ]).then(async ([baseResponse, additionResponse]) => {
      if (!baseResponse.ok) throw new Error('초지345 원본 데이터를 불러오지 못했습니다.')
      if (!additionResponse.ok) throw new Error('추가 검사 데이터를 불러오지 못했습니다.')
      const [base, additions] = await Promise.all([baseResponse.json(), additionResponse.json()])
      const records = Array.isArray(additions.records) ? additions.records : []
      const importedKeys = new Set(records.map((row) => recordKey(row.values)).filter(Boolean))
      const baseRows = base.rows.filter((row) => row.auxiliaryOnly || !importedKeys.has(recordKey(row.values)))
      const replacedBaseCount = base.rows.length - baseRows.length
      const asOf = records.reduce((latest, row) => String(row.values?.[2] || '') > latest ? String(row.values[2]) : latest, base.asOf || '')
      return {
        ...base,
        rows: [...records, ...baseRows],
        rowCount: (base.rowCount || base.rows.length) - replacedBaseCount + records.length,
        recordCount: (base.recordCount || 0) - replacedBaseCount + records.length,
        auxiliaryRowCount: base.auxiliaryRowCount || 0,
        asOf,
      }
    })
    return window.qInsightInspectionDatasetPromise
  })
})()
