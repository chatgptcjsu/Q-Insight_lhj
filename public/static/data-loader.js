(() => {
  window.qInsightLoadInspectionDataset = window.qInsightLoadInspectionDataset || (() => {
    window.qInsightInspectionDatasetPromise = window.qInsightInspectionDatasetPromise || Promise.all([
      fetch('/static/inspection-data.json', { cache: 'no-cache' }),
      fetch('/api/inspection-records', { cache: 'no-store' }),
    ]).then(async ([baseResponse, additionResponse]) => {
      if (!baseResponse.ok) throw new Error('초지345 원본 데이터를 불러오지 못했습니다.')
      if (!additionResponse.ok) throw new Error('추가 검사 데이터를 불러오지 못했습니다.')
      const [base, additions] = await Promise.all([baseResponse.json(), additionResponse.json()])
      const records = Array.isArray(additions.records) ? additions.records : []
      const asOf = records.reduce((latest, row) => String(row.values?.[2] || '') > latest ? String(row.values[2]) : latest, base.asOf || '')
      return {
        ...base,
        rows: [...records, ...base.rows],
        rowCount: (base.rowCount || base.rows.length) + records.length,
        recordCount: (base.recordCount || 0) + records.length,
        auxiliaryRowCount: base.auxiliaryRowCount || 0,
        asOf,
      }
    })
    return window.qInsightInspectionDatasetPromise
  })
})()
