/**
 * Transparent, no-AI-key fallback so the tool is still useful without
 * secrets configured. Derives assertions from the actual sample response
 * when one is given, instead of returning purely descriptive text.
 */
export function heuristicSuite({ method, endpoint, sampleResponse }) {
  const risk = method === "DELETE" ? 78 : method === "POST" || method === "PUT" ? 68 : 46
  const topLevelFields = sampleResponse && typeof sampleResponse === "object" ? Object.keys(sampleResponse) : []

  const tests = [
    {
      id: "TC-001",
      title: `Happy path - ${method} ${endpoint}`,
      category: "Functional",
      priority: "P1",
      method,
      endpoint,
      assertions: [
        { path: "status", op: "lessThan", value: 300 },
        ...(topLevelFields[0] ? [{ path: `$.${topLevelFields[0]}`, op: "exists" }] : [])
      ],
      rationale: "Baseline check that the documented success path still returns 2xx and its primary field."
    },
    {
      id: "TC-002",
      title: "Invalid or missing required data",
      category: "Negative",
      priority: "P1",
      method,
      endpoint,
      body: {},
      assertions: [{ path: "status", op: "greaterThan", value: 399 }],
      rationale: "An empty payload on a write endpoint should be rejected with a 4xx, not silently accepted."
    },
    {
      id: "TC-003",
      title: "Unauthorised request",
      category: "Security",
      priority: "P1",
      method,
      endpoint,
      assertions: [{ path: "status", op: "equals", value: 401 }],
      rationale: "Protected resources should reject requests with no/invalid credentials rather than 200."
    },
    {
      id: "TC-004",
      title: "Response time within budget",
      category: "Performance",
      priority: "P2",
      method,
      endpoint,
      assertions: [{ path: "duration", op: "lessThan", value: 1000 }],
      rationale: "Flags latency regressions even when the functional result is correct."
    }
  ]

  return {
    source: "heuristic",
    riskScore: risk,
    riskLevel: risk >= 75 ? "HIGH" : risk >= 55 ? "MEDIUM" : "LOW",
    summary: `No AI key configured - generated ${tests.length} rule-based tests for ${method} ${endpoint}. Set OPENAI_API_KEY for deeper, response-aware suggestions.`,
    gaps: ["Schema/contract validation", "Chained-flow coverage", "Rate limiting / abuse cases"],
    tests
  }
}

export function heuristicTriage({ status, failureMessages }) {
  if (status === 0) {
    return {
      summary: "The request never reached the server.",
      likelyCause: "Network error, wrong base URL, or the service is down.",
      suggestion: "Confirm the endpoint and environment/variable values, then retry with verbose logging."
    }
  }

  if (status >= 500) {
    return {
      summary: `The server returned a ${status} error.`,
      likelyCause: "An unhandled exception or dependency failure on the server side.",
      suggestion: "Check server logs for this request's timestamp and correlate with recent deploys."
    }
  }

  if (status >= 400) {
    return {
      summary: `The server rejected the request with a ${status}.`,
      likelyCause: "Request shape, auth, or validation rules don't match what this step sent.",
      suggestion: "Compare the request body/headers against a known-good call for this endpoint."
    }
  }

  return {
    summary: "The request succeeded but one or more assertions did not match.",
    likelyCause: failureMessages[0] ?? "A field value or response shape differs from what was expected.",
    suggestion: "Inspect the actual response body captured in this report against the failed assertion's path."
  }
}
