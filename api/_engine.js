import { JSONPath } from "jsonpath-plus"
import { VariableStore } from "../src/lib/variables.js"
import { runAssertions } from "../src/lib/assertions.js"
import { validateAgainstSchema } from "../src/lib/schema.js"
import { heuristicTriage } from "../src/lib/heuristics.js"
import { buildTriagePrompt, TRIAGE_SYSTEM_PROMPT } from "../src/lib/prompts.js"

async function sendRequest(method, url, { headers, body }) {
  const started = Date.now()
  try {
    const hasBody = !["GET", "HEAD"].includes(method) && body !== undefined && body !== ""
    const response = await fetch(url, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...headers },
      body: hasBody ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
    })
    const duration = Date.now() - started
    const text = await response.text()
    let parsedBody = text
    try {
      parsedBody = text ? JSON.parse(text) : null
    } catch {
      // Non-JSON response - keep as plain text.
    }
    return {
      ok: response.ok,
      status: response.status,
      duration,
      headers: Object.fromEntries(response.headers.entries()),
      body: parsedBody
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      duration: Date.now() - started,
      headers: {},
      body: null,
      error: error instanceof Error ? error.message : "Request failed"
    }
  }
}

async function triageFailure(input) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return heuristicTriage(input)

  try {
    const response = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: TRIAGE_SYSTEM_PROMPT },
          { role: "user", content: buildTriagePrompt(input) }
        ]
      })
    })
    if (!response.ok) return heuristicTriage(input)
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    return content ? JSON.parse(content) : heuristicTriage(input)
  } catch {
    return heuristicTriage(input)
  }
}

function resolveEndpoint(baseUrl, endpoint) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint
  if (!baseUrl) return endpoint
  return `${baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`
}

function extractValues(extract, body, variables) {
  if (!extract?.length) return {}
  const extracted = {}
  for (const item of extract) {
    const matches = JSONPath({ path: item.path, json: body, wrap: true })
    const value = matches.length <= 1 ? matches[0] : matches
    extracted[item.as] = value
    variables.set(item.as, value)
  }
  return extracted
}

/** Executes a suite's steps in order, resolving {{variables}} and running assertions/schema checks on each. */
export async function runSuite(suite, { aiTriage = false } = {}) {
  const startedAt = new Date().toISOString()
  const variables = new VariableStore(suite.variables)
  const results = []

  for (const step of suite.steps) {
    const resolvedEndpoint = resolveEndpoint(suite.baseUrl, variables.resolveString(step.endpoint))
    const resolvedHeaders = variables.resolveDeep(step.headers ?? {})
    const resolvedBody = variables.resolveDeep(step.body)

    const response = await sendRequest(step.method, resolvedEndpoint, { headers: resolvedHeaders, body: resolvedBody })

    const assertionResults = runAssertions(step.assertions, {
      status: response.status,
      duration: response.duration,
      body: response.body
    })

    const schemaErrors = validateAgainstSchema(step.schema, response.body)
    const extracted = extractValues(step.extract, response.body, variables)
    const ok = !response.error && response.ok && assertionResults.every(a => a.pass) && schemaErrors.length === 0

    const result = {
      step,
      ok,
      status: response.status,
      duration: response.duration,
      requestEndpoint: resolvedEndpoint,
      requestHeaders: resolvedHeaders,
      requestBody: resolvedBody,
      responseHeaders: response.headers,
      responseBody: response.body,
      assertionResults,
      schemaErrors,
      extracted,
      error: response.error
    }

    if (!ok && aiTriage && !step.skipAiTriage) {
      const failureMessages = [
        ...assertionResults.filter(a => !a.pass).map(a => a.message),
        ...schemaErrors,
        ...(response.error ? [response.error] : [])
      ]
      result.aiTriage = await triageFailure({
        method: step.method,
        endpoint: resolvedEndpoint,
        requestBody: resolvedBody,
        expectedAssertions: (step.assertions ?? []).map(a => `${a.path} ${a.op} ${String(a.value)}`),
        status: response.status,
        duration: response.duration,
        responseBody: response.body,
        failureMessages
      })
    }

    results.push(result)
  }

  const finishedAt = new Date().toISOString()
  const passedSteps = results.filter(r => r.ok).length
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

  return {
    suiteName: suite.name,
    startedAt,
    finishedAt,
    totalSteps: results.length,
    passedSteps,
    failedSteps: results.length - passedSteps,
    averageDuration: results.length ? Math.round(totalDuration / results.length) : 0,
    results
  }
}
