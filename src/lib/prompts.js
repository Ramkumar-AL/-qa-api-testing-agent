export const GENERATE_SYSTEM_PROMPT =
  "You are a senior QA automation engineer. You output only valid JSON, matched exactly to the requested shape. You never invent field names that were not given to you."

export function buildGeneratePrompt({ method, endpoint, sampleBody, sampleResponse }) {
  return `Analyse this API and propose a test suite.

Method: ${method}
Endpoint: ${endpoint}
Sample request body: ${sampleBody ? JSON.stringify(sampleBody) : "none"}
Sample response body: ${sampleResponse ? JSON.stringify(sampleResponse) : "not supplied"}

Return ONLY valid JSON of this shape:
{
  "riskScore": number (0-100),
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "summary": string,
  "gaps": string[],
  "tests": [
    {
      "id": string,
      "title": string,
      "category": "Functional|Negative|Boundary|Security|Performance",
      "priority": "P0|P1|P2|P3",
      "method": "GET|POST|PUT|PATCH|DELETE|HEAD",
      "endpoint": string,
      "body": object | null,
      "assertions": [ { "path": string, "op": "equals|notEquals|contains|exists|notExists|lessThan|greaterThan|matches", "value": any } ],
      "rationale": string
    }
  ]
}

Base every assertion's "path" ONLY on fields present in the sample response body, or on "status" / "duration". Produce 6-10 tests covering functional, negative, boundary and security cases. Do not claim any test has been executed - you are proposing tests, not reporting results.`
}

export const TRIAGE_SYSTEM_PROMPT =
  "You are a senior QA engineer explaining a failed API test to a teammate. Be concise, concrete, and only reason from the data given - never invent details the response didn't contain."

export function buildTriagePrompt({
  method,
  endpoint,
  requestBody,
  expectedAssertions,
  status,
  duration,
  responseBody,
  failureMessages
}) {
  return `A test step failed. Explain why and what to check next.

Request: ${method} ${endpoint}
Request body: ${requestBody ? JSON.stringify(requestBody) : "none"}
Expected: ${expectedAssertions.join("; ") || "2xx response"}
Actual status: ${status}
Actual duration: ${duration}ms
Actual response body: ${JSON.stringify(responseBody).slice(0, 2000)}
Failed checks: ${failureMessages.join("; ")}

Return ONLY valid JSON of this shape:
{
  "summary": string (one sentence, what happened),
  "likelyCause": string (one sentence, most probable root cause),
  "suggestion": string (one concrete next step for the QA engineer)
}`
}
