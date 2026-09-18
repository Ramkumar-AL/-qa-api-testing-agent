import { useEffect, useMemo, useRef, useState } from "react"
import { diffRuns } from "./lib/diff.js"
import { buildHtmlReport } from "./lib/htmlReport.js"

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]
const OPS = ["equals", "notEquals", "contains", "exists", "notExists", "lessThan", "greaterThan", "matches"]
const HISTORY_KEY = "qa-bench-history-v1"
const SUITES_KEY = "qa-bench-suites-v1"

function uid(prefix = "step") {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function parseHeaders(text) {
  const headers = {}
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":")
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key) headers[key] = value
  }
  return headers
}

function headersToText(headers = {}) {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
}

function safeJson(text, fallback) {
  if (!text || !text.trim()) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function coerceValue(text) {
  if (text === "") return ""
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function defaultSuite() {
  return {
    name: "Restful-Booker booking lifecycle",
    baseUrl: "https://restful-booker.herokuapp.com",
    variablesText: JSON.stringify({ username: "admin", password: "password123" }, null, 2),
    steps: [
      {
        id: uid(),
        title: "Authenticate and capture token",
        method: "POST",
        endpoint: "/auth",
        headersText: "",
        bodyText: JSON.stringify({ username: "{{username}}", password: "{{password}}" }, null, 2),
        schemaText: "",
        assertions: [
          { path: "status", op: "equals", valueText: "200" },
          { path: "$.token", op: "exists", valueText: "" }
        ],
        extract: [{ as: "authToken", path: "$.token" }]
      },
      {
        id: uid(),
        title: "Create a booking",
        method: "POST",
        endpoint: "/booking",
        headersText: "",
        bodyText: JSON.stringify(
          {
            firstname: "Ram",
            lastname: "QA",
            totalprice: 150,
            depositpaid: true,
            bookingdates: { checkin: "2026-10-01", checkout: "2026-10-05" }
          },
          null,
          2
        ),
        schemaText: "",
        assertions: [
          { path: "status", op: "equals", valueText: "200" },
          { path: "$.booking.firstname", op: "equals", valueText: '"Ram"' }
        ],
        extract: [{ as: "bookingId", path: "$.bookingid" }]
      },
      {
        id: uid(),
        title: "Read the booking back",
        method: "GET",
        endpoint: "/booking/{{bookingId}}",
        headersText: "",
        bodyText: "",
        schemaText: "",
        assertions: [
          { path: "status", op: "equals", valueText: "200" },
          { path: "$.lastname", op: "equals", valueText: '"QA"' }
        ],
        extract: []
      },
      {
        id: uid(),
        title: "Delete the booking",
        method: "DELETE",
        endpoint: "/booking/{{bookingId}}",
        headersText: "Cookie: token={{authToken}}",
        bodyText: "",
        schemaText: "",
        assertions: [{ path: "status", op: "equals", valueText: "201" }],
        extract: []
      }
    ]
  }
}

function blankSuite() {
  return {
    name: "Untitled suite",
    baseUrl: "",
    variablesText: "",
    steps: [
      {
        id: uid(),
        title: "New step",
        method: "GET",
        endpoint: "/",
        headersText: "",
        bodyText: "",
        schemaText: "",
        assertions: [{ path: "status", op: "lessThan", valueText: "300" }],
        extract: []
      }
    ]
  }
}

function listSavedSuites() {
  try {
    return JSON.parse(localStorage.getItem(SUITES_KEY) ?? "{}")
  } catch {
    return {}
  }
}

function stepToPayload(step) {
  return {
    id: step.id,
    title: step.title,
    method: step.method,
    endpoint: step.endpoint,
    headers: parseHeaders(step.headersText),
    body: safeJson(step.bodyText, undefined),
    schema: safeJson(step.schemaText, undefined),
    assertions: step.assertions
      .filter(a => a.path)
      .map(a => ({ path: a.path, op: a.op, value: coerceValue(a.valueText) })),
    extract: step.extract.filter(e => e.as && e.path)
  }
}

export default function App() {
  const [suite, setSuite] = useState(defaultSuite)
  const [selectedStepId, setSelectedStepId] = useState(() => defaultSuite().steps[0].id)
  const [aiTriage, setAiTriage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [report, setReport] = useState(null)
  const [diff, setDiff] = useState(null)
  const [genOpen, setGenOpen] = useState(false)
  const [genForm, setGenForm] = useState({ method: "GET", endpoint: "", responseText: "" })
  const [genBusy, setGenBusy] = useState(false)
  const [savedSuites, setSavedSuites] = useState(listSavedSuites)
  const [loadSelection, setLoadSelection] = useState("")
  const [saveFlash, setSaveFlash] = useState(false)
  const resultsRef = useRef(null)

  useEffect(() => {
    if (!suite.steps.find(s => s.id === selectedStepId) && suite.steps.length) {
      setSelectedStepId(suite.steps[0].id)
    }
  }, [suite, selectedStepId])

  const selectedStep = useMemo(() => suite.steps.find(s => s.id === selectedStepId) ?? null, [suite, selectedStepId])

  function updateStep(id, patch) {
    setSuite(prev => ({ ...prev, steps: prev.steps.map(s => (s.id === id ? { ...s, ...patch } : s)) }))
  }

  function addStep() {
    const step = {
      id: uid(),
      title: "New step",
      method: "GET",
      endpoint: "/",
      headersText: "",
      bodyText: "",
      schemaText: "",
      assertions: [{ path: "status", op: "lessThan", valueText: "300" }],
      extract: []
    }
    setSuite(prev => ({ ...prev, steps: [...prev.steps, step] }))
    setSelectedStepId(step.id)
  }

  function removeStep(id) {
    setSuite(prev => ({ ...prev, steps: prev.steps.filter(s => s.id !== id) }))
  }

  function moveStep(id, direction) {
    setSuite(prev => {
      const index = prev.steps.findIndex(s => s.id === id)
      const target = index + direction
      if (target < 0 || target >= prev.steps.length) return prev
      const steps = [...prev.steps]
      ;[steps[index], steps[target]] = [steps[target], steps[index]]
      return { ...prev, steps }
    })
  }

  function saveSuite() {
    const name = suite.name.trim()
    if (!name) {
      setError("Give the suite a name before saving.")
      return
    }
    const all = listSavedSuites()
    all[name] = suite
    localStorage.setItem(SUITES_KEY, JSON.stringify(all))
    setSavedSuites(all)
    setLoadSelection(name)
    setSaveFlash(true)
    setTimeout(() => setSaveFlash(false), 1500)
  }

  function handleLoadChange(event) {
    const name = event.target.value
    setLoadSelection(name)
    if (!name) return
    const all = listSavedSuites()
    const found = all[name]
    if (!found) return
    setSuite(found)
    setReport(null)
    setDiff(null)
    setError("")
    if (found.steps[0]) setSelectedStepId(found.steps[0].id)
  }

  function deleteSelectedSuite() {
    if (!loadSelection) return
    const all = listSavedSuites()
    delete all[loadSelection]
    localStorage.setItem(SUITES_KEY, JSON.stringify(all))
    setSavedSuites(all)
    setLoadSelection("")
  }

  function startNewSuite() {
    const fresh = blankSuite()
    setSuite(fresh)
    setSelectedStepId(fresh.steps[0].id)
    setLoadSelection("")
    setReport(null)
    setDiff(null)
    setError("")
  }

  function loadHistory(name) {
    try {
      const all = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "{}")
      return all[name] ?? null
    } catch {
      return null
    }
  }

  function saveHistory(name, runReport) {
    try {
      const all = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "{}")
      all[name] = runReport
      localStorage.setItem(HISTORY_KEY, JSON.stringify(all))
    } catch {
      // localStorage unavailable - history just won't persist across sessions.
    }
  }

  async function runSuite() {
    setBusy(true)
    setError("")
    try {
      const payload = {
        suite: {
          name: suite.name,
          baseUrl: suite.baseUrl,
          variables: safeJson(suite.variablesText, {}),
          steps: suite.steps.map(stepToPayload)
        },
        aiTriage
      }
      const response = await fetch("/api/run-suite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Run failed")

      const previous = loadHistory(suite.name)
      setDiff(previous ? diffRuns(previous, data) : null)
      saveHistory(suite.name, data)
      setReport(data)
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to run suite.")
    } finally {
      setBusy(false)
    }
  }

  async function generateSuite() {
    setGenBusy(true)
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: genForm.method,
          endpoint: genForm.endpoint,
          sampleResponse: safeJson(genForm.responseText, undefined)
        })
      })
      const generated = await response.json()
      if (!response.ok) throw new Error(generated.error || "Generation failed")

      const steps = (generated.tests || []).map(test => ({
        id: uid(),
        title: test.title,
        method: test.method || genForm.method,
        endpoint: test.endpoint || genForm.endpoint,
        headersText: "",
        bodyText: test.body ? JSON.stringify(test.body, null, 2) : "",
        schemaText: "",
        assertions: (test.assertions || []).map(a => ({
          path: a.path,
          op: a.op,
          valueText: a.value === undefined ? "" : JSON.stringify(a.value)
        })),
        extract: []
      }))

      setSuite(prev => ({
        ...prev,
        name: `Generated - ${genForm.method} ${genForm.endpoint}`,
        baseUrl: prev.baseUrl,
        steps: steps.length ? steps : prev.steps
      }))
      setGenOpen(false)
      if (steps[0]) setSelectedStepId(steps[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate suite.")
    } finally {
      setGenBusy(false)
    }
  }

  function downloadReport() {
    if (!report) return
    const html = buildHtmlReport(report, diff)
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${report.suiteName.replace(/[^a-z0-9]+/gi, "_")}-report.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark">
          <span className="wordmark-mark">◈</span> BENCH
          <span className="wordmark-sub">AI API test runner</span>
        </div>

        <div className="topbar-fields">
          <label className="field-inline">
            <span>Suite</span>
            <input value={suite.name} onChange={e => setSuite(prev => ({ ...prev, name: e.target.value }))} />
          </label>
          <label className="field-inline">
            <span>Base URL</span>
            <input
              value={suite.baseUrl}
              onChange={e => setSuite(prev => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://api.example.com"
            />
          </label>
        </div>

        <div className="topbar-actions">
          <label className="toggle">
            <input type="checkbox" checked={aiTriage} onChange={e => setAiTriage(e.target.checked)} />
            <span>AI triage on failure</span>
          </label>
          <button className="btn ghost" onClick={() => setGenOpen(true)}>
            Generate from sample
          </button>
          <button className="btn primary" onClick={runSuite} disabled={busy || suite.steps.length === 0}>
            {busy ? "Running…" : "Run suite"}
          </button>
        </div>
      </header>

      <div className="suite-bar">
        <span className="suite-bar-label">My suites</span>
        <button className="btn tiny" onClick={startNewSuite}>
          + New
        </button>
        <button className="btn tiny" onClick={saveSuite}>
          Save
        </button>
        <select className="suite-select" value={loadSelection} onChange={handleLoadChange}>
          <option value="">Load saved…</option>
          {Object.keys(savedSuites).map(name => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button className="btn tiny danger" onClick={deleteSelectedSuite} disabled={!loadSelection}>
          Delete
        </button>
        {saveFlash && <span className="save-flash">Saved</span>}
      </div>

      {error && <div className="banner error">{error}</div>}

      <div className="workspace">
        <aside className="rail">
          <div className="rail-head">
            <span>Channels</span>
            <button className="btn tiny" onClick={addStep}>
              + Step
            </button>
          </div>
          <ol className="channel-list">
            {suite.steps.map((step, index) => {
              const result = report?.results.find(r => r.step.id === step.id)
              return (
                <li key={step.id} className={step.id === selectedStepId ? "selected" : ""}>
                  <button className="channel" onClick={() => setSelectedStepId(step.id)}>
                    <span className="channel-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="channel-body">
                      <span className="channel-title">{step.title || "Untitled step"}</span>
                      <span className="channel-meta">
                        {step.method} {step.endpoint}
                      </span>
                    </span>
                    {result && <span className={`dot ${result.ok ? "pass" : "fail"}`} />}
                  </button>
                  <div className="channel-tools">
                    <button title="Move up" onClick={() => moveStep(step.id, -1)}>
                      ↑
                    </button>
                    <button title="Move down" onClick={() => moveStep(step.id, 1)}>
                      ↓
                    </button>
                    <button title="Remove" onClick={() => removeStep(step.id)}>
                      ×
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>

          <details className="variables">
            <summary>Seed variables</summary>
            <textarea
              value={suite.variablesText}
              onChange={e => setSuite(prev => ({ ...prev, variablesText: e.target.value }))}
              spellCheck={false}
              rows={6}
            />
          </details>
        </aside>

        <main className="editor">
          {selectedStep ? (
            <StepEditor key={selectedStep.id} step={selectedStep} onChange={patch => updateStep(selectedStep.id, patch)} />
          ) : (
            <div className="empty">Add a step to get started.</div>
          )}
        </main>

        <section className="readout" ref={resultsRef}>
          {!report && (
            <div className="readout-empty">
              <p className="readout-empty-title">No run yet</p>
              <p>Run the suite to see pass/fail, timings, and assertion detail here.</p>
            </div>
          )}

          {report && (
            <>
              <div className="stat-grid">
                <Stat label="Total" value={report.totalSteps} />
                <Stat label="Passed" value={report.passedSteps} tone="pass" />
                <Stat label="Failed" value={report.failedSteps} tone="fail" />
                <Stat label="Avg" value={`${report.averageDuration}ms`} />
              </div>

              {diff?.changes?.length > 0 && (
                <div className="diff-banner">
                  <strong>{diff.changes.length} change(s) vs. previous run</strong>
                  <ul>
                    {diff.changes.map(change => (
                      <li key={change.stepId}>
                        {change.title}
                        {change.statusChanged && ` · status ${change.statusChanged.from}→${change.statusChanged.to}`}
                        {change.durationDelta !== undefined && ` · ${change.durationDelta > 0 ? "+" : ""}${change.durationDelta}ms`}
                        {change.newlyFailing && <span className="fail-text"> · newly failing</span>}
                        {change.newlyPassing && <span className="pass-text"> · newly passing</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="result-list">
                {report.results.map(result => (
                  <ResultCard key={result.step.id} result={result} />
                ))}
              </div>

              <button className="btn ghost full" onClick={downloadReport}>
                Download HTML report
              </button>
            </>
          )}
        </section>
      </div>

      {genOpen && (
        <div className="modal-backdrop" onClick={() => setGenOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Generate a suite from a sample</h2>
            <p className="muted">
              Give it a method, endpoint, and (optionally) a sample response body. Without an AI key configured on the
              server, this falls back to a rule-based suite derived from the response's actual fields.
            </p>
            <label className="field-block">
              <span>Method</span>
              <select value={genForm.method} onChange={e => setGenForm(prev => ({ ...prev, method: e.target.value }))}>
                {METHODS.map(m => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-block">
              <span>Endpoint</span>
              <input
                value={genForm.endpoint}
                onChange={e => setGenForm(prev => ({ ...prev, endpoint: e.target.value }))}
                placeholder="/booking or https://api.example.com/booking"
              />
            </label>
            <label className="field-block">
              <span>Sample response body (optional)</span>
              <textarea
                rows={6}
                value={genForm.responseText}
                onChange={e => setGenForm(prev => ({ ...prev, responseText: e.target.value }))}
                placeholder='{"bookingid": 1, "booking": {...}}'
                spellCheck={false}
              />
            </label>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setGenOpen(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={generateSuite} disabled={genBusy || !genForm.endpoint}>
                {genBusy ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone ?? ""}`}>{value}</span>
    </div>
  )
}

function ResultCard({ result }) {
  const [open, setOpen] = useState(!result.ok)
  return (
    <div className={`result-card ${result.ok ? "pass" : "fail"}`}>
      <button className="result-head" onClick={() => setOpen(o => !o)}>
        <span className={`dot ${result.ok ? "pass" : "fail"}`} />
        <span className="result-title">{result.step.title}</span>
        <span className="result-meta">
          {result.step.method} · {result.status || "—"} · {result.duration}ms
        </span>
        <span className="chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="result-body">
          {result.assertionResults?.length > 0 && (
            <ul className="assertion-list">
              {result.assertionResults.map((a, i) => (
                <li key={i} className={a.pass ? "pass-text" : "fail-text"}>
                  {a.message}
                </li>
              ))}
            </ul>
          )}
          {result.schemaErrors?.length > 0 && (
            <ul className="assertion-list">
              {result.schemaErrors.map((e, i) => (
                <li key={i} className="fail-text">
                  Schema: {e}
                </li>
              ))}
            </ul>
          )}
          {result.error && <p className="fail-text">{result.error}</p>}
          {result.aiTriage && (
            <div className="triage">
              <p>
                <strong>Summary</strong> {result.aiTriage.summary}
              </p>
              <p>
                <strong>Likely cause</strong> {result.aiTriage.likelyCause}
              </p>
              <p>
                <strong>Suggestion</strong> {result.aiTriage.suggestion}
              </p>
            </div>
          )}
          <details className="raw">
            <summary>Raw response</summary>
            <pre>{JSON.stringify(result.responseBody, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  )
}

function StepEditor({ step, onChange }) {
  function updateAssertion(index, patch) {
    const assertions = step.assertions.map((a, i) => (i === index ? { ...a, ...patch } : a))
    onChange({ assertions })
  }
  function addAssertion() {
    onChange({ assertions: [...step.assertions, { path: "", op: "equals", valueText: "" }] })
  }
  function removeAssertion(index) {
    onChange({ assertions: step.assertions.filter((_, i) => i !== index) })
  }

  function updateExtract(index, patch) {
    const extract = step.extract.map((e, i) => (i === index ? { ...e, ...patch } : e))
    onChange({ extract })
  }
  function addExtract() {
    onChange({ extract: [...step.extract, { as: "", path: "" }] })
  }
  function removeExtract(index) {
    onChange({ extract: step.extract.filter((_, i) => i !== index) })
  }

  return (
    <div className="step-editor">
      <label className="field-block">
        <span>Title</span>
        <input value={step.title} onChange={e => onChange({ title: e.target.value })} />
      </label>

      <div className="row">
        <label className="field-block narrow">
          <span>Method</span>
          <select value={step.method} onChange={e => onChange({ method: e.target.value })}>
            {METHODS.map(m => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="field-block grow">
          <span>Endpoint</span>
          <input
            value={step.endpoint}
            onChange={e => onChange({ endpoint: e.target.value })}
            placeholder="/booking/{{bookingId}}"
          />
        </label>
      </div>

      <label className="field-block">
        <span>Headers (one per line, Key: Value — use {"{{variable}}"} to reference captured values)</span>
        <textarea rows={3} value={step.headersText} onChange={e => onChange({ headersText: e.target.value })} spellCheck={false} />
      </label>

      <label className="field-block">
        <span>Body (JSON)</span>
        <textarea rows={6} value={step.bodyText} onChange={e => onChange({ bodyText: e.target.value })} spellCheck={false} />
      </label>

      <div className="subsection">
        <div className="subsection-head">
          <span>Assertions</span>
          <button className="btn tiny" onClick={addAssertion}>
            + Assertion
          </button>
        </div>
        {step.assertions.map((a, i) => (
          <div className="assertion-row" key={i}>
            <input
              placeholder="status | duration | $.field.path"
              value={a.path}
              onChange={e => updateAssertion(i, { path: e.target.value })}
            />
            <select value={a.op} onChange={e => updateAssertion(i, { op: e.target.value })}>
              {OPS.map(op => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            {!["exists", "notExists"].includes(a.op) && (
              <input placeholder="value" value={a.valueText} onChange={e => updateAssertion(i, { valueText: e.target.value })} />
            )}
            <button className="btn tiny danger" onClick={() => removeAssertion(i)}>
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="subsection">
        <div className="subsection-head">
          <span>Extract into variables</span>
          <button className="btn tiny" onClick={addExtract}>
            + Extract
          </button>
        </div>
        {step.extract.map((ex, i) => (
          <div className="extract-row" key={i}>
            <input placeholder="variable name" value={ex.as} onChange={e => updateExtract(i, { as: e.target.value })} />
            <span className="arrow">←</span>
            <input placeholder="$.json.path" value={ex.path} onChange={e => updateExtract(i, { path: e.target.value })} />
            <button className="btn tiny danger" onClick={() => removeExtract(i)}>
              ×
            </button>
          </div>
        ))}
      </div>

      <details className="schema-block">
        <summary>Response schema (optional JSON Schema)</summary>
        <textarea rows={6} value={step.schemaText} onChange={e => onChange({ schemaText: e.target.value })} spellCheck={false} />
      </details>
    </div>
  )
}
