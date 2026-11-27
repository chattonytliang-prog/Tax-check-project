import { useState } from 'react'
import { novemberWarningCatalog, trialWarningIndicator, warningTrials } from '../lib/novemberWarningCatalog'
import './WarningIndicatorCatalog.css'

export function WarningIndicatorCatalog() {
  const [active, setActive] = useState(novemberWarningCatalog[0])
  const [inputs, setInputs] = useState<string[]>([])
  const [result, setResult] = useState('')
  const trial = warningTrials[active.row]

  return <details className="panel warning-catalog">
    <summary><strong>11 月 27 日预警指标</strong><span>{novemberWarningCatalog.length} 条 · 不计入报告评分</span></summary>
    <label className="warning-catalog-picker">
      <span>选择指标</span>
      <select value={active.code} onChange={(event) => {
        const next = novemberWarningCatalog.find((item) => item.code === event.target.value)
        if (!next) return
        setActive(next)
        setInputs(warningTrials[next.row]?.labels.map(() => '') || [])
        setResult('')
      }}>
        {novemberWarningCatalog.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
      </select>
    </label>
    <dl className="warning-catalog-detail">
      <div><dt>归类和状态</dt><dd>{active.category} · {active.disposition}</dd></div>
      <div><dt>触发条件</dt><dd>{active.condition}</dd></div>
      <div><dt>原始依据</dt><dd>{active.evidence}</dd></div>
      <div><dt>复核边界</dt><dd>{active.note}</dd></div>
      {active.related && <div><dt>现有相关规则</dt><dd>{active.related}</dd></div>}
      <div><dt>来源</dt><dd>2026-11-27 指标表 · Sheet1 第 {active.row} 行</dd></div>
    </dl>
    {trial && <form className="warning-catalog-trial" onSubmit={(event) => {
      event.preventDefault()
      setResult(trialWarningIndicator(active.row, inputs))
    }}>
      <p>手工试算：只使用本次输入，不保存到档案，也不影响报告。</p>
      <div className="warning-catalog-inputs">
        {trial.labels.map((label, index) => <label key={label}>
          <span>{label}</span>
          <input type="number" step="any" value={inputs[index] || ''} onChange={(event) => {
            const value = event.target.value
            setInputs((old) => old.map((input, inputIndex) => inputIndex === index ? value : input))
            setResult('')
          }} />
        </label>)}
        <button type="submit" className="secondary-button">试算</button>
      </div>
      {result && <p role="status" className="warning-catalog-result">{result}</p>}
    </form>}
  </details>
}
