function safe(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function pretty(value) {
  if (value === undefined || value === null || value === "") return "—"
  return typeof value === "string" ? safe(value) : safe(JSON.stringify(value, null, 2))
}

export function buildHtmlReport(report, diff) {
  const passRate = report.totalSteps ? Math.round((report.passedSteps / report.totalSteps) * 100) : 0

  const diffSection = diff?.changes?.length
    ? `<section class="panel">
        <h2>Changes vs. previous run (${safe(new Date(diff.previousRunAt).toLocaleString())})</h2>
        <ul class="diff-list">
          ${diff.changes
            .map(
              change => `<li>
                <strong>${safe(change.title)}</strong>
                ${change.statusChanged ? `· status ${safe(change.statusChanged.from)} → ${safe(change.statusChanged.to)}` : ""}
                ${change.durationDelta !== undefined ? `· ${change.durationDelta > 0 ? "+" : ""}${safe(change.durationDelta)}ms` : ""}
                ${change.newlyFailing ? `<span class="fail"> · newly failing</span>` : ""}
                ${change.newlyPassing ? `<span class="pass"> · newly passing</span>` : ""}
              </li>`
            )
            .join("")}
        </ul>
      </section>`
    : ""

  const rows = report.results
    .map(
      result => `<tr>
        <td>${safe(result.step.id)}</td>
        <td><strong>${safe(result.step.method)}</strong></td>
        <td class="endpoint">${safe(result.requestEndpoint)}</td>
        <td>${safe(result.status)}</td>
        <td>${safe(result.duration)} ms</td>
        <td><span class="${result.ok ? "pass" : "fail"}">${result.ok ? "PASS" : "FAIL"}</span></td>
      </tr>`
    )
    .join("")

  const details = report.results
    .map(
      result => `<section class="case">
        <h3>${safe(result.step.id)} · ${safe(result.step.title)}</h3>
        <div class="grid">
          <div><strong>Endpoint</strong><p>${safe(result.step.method)} ${safe(result.requestEndpoint)}</p></div>
          <div><strong>Status</strong><p>${safe(result.status)}</p></div>
          <div><strong>Duration</strong><p>${safe(result.duration)} ms</p></div>
          <div><strong>Result</strong><p class="${result.ok ? "pass" : "fail"}">${result.ok ? "PASS" : "FAIL"}</p></div>
        </div>

        ${
          result.assertionResults?.length
            ? `<div class="assertions"><strong>Assertions</strong><ul>${result.assertionResults
                .map(a => `<li class="${a.pass ? "pass" : "fail"}">${safe(a.message)}</li>`)
                .join("")}</ul></div>`
            : ""
        }

        ${
          result.schemaErrors?.length
            ? `<div class="assertions"><strong>Schema errors</strong><ul>${result.schemaErrors
                .map(e => `<li class="fail">${safe(e)}</li>`)
                .join("")}</ul></div>`
            : ""
        }

        <div class="two">
          <div><strong>Request body</strong><pre>${pretty(result.requestBody)}</pre></div>
          <div><strong>Response body</strong><pre>${pretty(result.responseBody)}</pre></div>
        </div>

        ${result.error ? `<div class="error"><strong>Execution error</strong><br>${safe(result.error)}</div>` : ""}

        ${
          result.aiTriage
            ? `<div class="ai">
                <strong>AI triage</strong><br>
                <strong>Summary:</strong> ${safe(result.aiTriage.summary)}<br>
                <strong>Likely cause:</strong> ${safe(result.aiTriage.likelyCause)}<br>
                <strong>Suggestion:</strong> ${safe(result.aiTriage.suggestion)}
              </div>`
            : ""
        }
      </section>`
    )
    .join("")

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safe(report.suiteName)} · API Test Report</title>
<style>
:root{font-family:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;color:#e7eaee;background:#101317}
*{box-sizing:border-box}
body{margin:0;background:#101317;line-height:1.55}
main{max-width:1280px;margin:0 auto;padding:40px 24px}
.header{border-bottom:1px solid #262b33;padding-bottom:20px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px}
h1{font-size:22px;margin:0}
h2{font-size:16px;margin:0 0 14px}
h3{font-size:14px;margin:0 0 14px;font-family:"IBM Plex Mono",monospace}
.muted{color:#8b93a1;font-size:13px}
.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:22px 0}
.card,.panel{background:#181c22;border:1px solid #262b33;border-radius:6px;padding:16px}
.value{font-size:26px;font-weight:650;margin-top:4px;font-family:"IBM Plex Mono",monospace}
.pass{color:#4ade80}
.fail{color:#fb7185}
.panel{margin-top:16px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
table{width:100%;border-collapse:collapse}
th,td{padding:10px;border-bottom:1px solid #262b33;text-align:left;font-size:13px}
th{color:#8b93a1;text-transform:uppercase;font-size:10px;letter-spacing:.06em}
.endpoint{max-width:420px;word-break:break-all;font-family:"IBM Plex Mono",monospace}
.case{border-top:1px solid #262b33;padding-top:20px;margin-top:20px}
.assertions ul{margin:6px 0 0;padding-left:18px}
pre{background:#0c0f13;border:1px solid #21262e;border-radius:6px;padding:12px;overflow:auto;max-height:260px;white-space:pre-wrap;word-break:break-word;color:#c7ccd4;font-size:12px;font-family:"IBM Plex Mono",monospace}
.error{margin-top:10px;background:rgba(127,29,29,.2);border:1px solid rgba(251,113,133,.25);padding:12px;border-radius:6px;color:#fecdd3}
.ai{margin-top:10px;background:rgba(255,180,84,.1);border:1px solid rgba(255,180,84,.28);padding:12px;border-radius:6px;color:#ffdca8}
.diff-list{padding-left:18px}
@media(max-width:900px){.cards{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<main>
  <header class="header">
    <div><h1>${safe(report.suiteName)}</h1><p class="muted">API test execution report</p></div>
    <div class="muted">Run ${safe(new Date(report.startedAt).toLocaleString())}</div>
  </header>

  <section class="cards">
    <div class="card"><div class="muted">Total steps</div><div class="value">${report.totalSteps}</div></div>
    <div class="card"><div class="muted">Passed</div><div class="value pass">${report.passedSteps}</div></div>
    <div class="card"><div class="muted">Failed</div><div class="value fail">${report.failedSteps}</div></div>
    <div class="card"><div class="muted">Pass rate</div><div class="value">${passRate}%</div></div>
    <div class="card"><div class="muted">Avg duration</div><div class="value">${report.averageDuration} ms</div></div>
  </section>

  ${diffSection}

  <section class="panel">
    <h2>Step summary</h2>
    <div style="overflow:auto"><table>
      <thead><tr><th>ID</th><th>Method</th><th>Endpoint</th><th>Status</th><th>Time</th><th>Result</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>

  <section class="panel"><h2>Step detail</h2>${details}</section>
</main>
</body>
</html>`
}
