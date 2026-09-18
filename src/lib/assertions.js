import { JSONPath } from "jsonpath-plus"

const NO_VALUE_OPS = new Set(["exists", "notExists"])

export function runAssertion(assertion, context) {
  const actual = resolveActual(assertion.path, context)
  const pass = evaluate(assertion.op, actual, assertion.value)
  const needsValue = !NO_VALUE_OPS.has(assertion.op)
  const label = assertion.label ?? `${assertion.path} ${assertion.op}${needsValue ? ` ${describe(assertion.value)}` : ""}`

  return {
    assertion,
    pass,
    actual,
    message: pass ? `PASS · ${label}` : `FAIL · ${label} (got ${describe(actual)})`
  }
}

export function runAssertions(assertions = [], context) {
  return assertions.map(assertion => runAssertion(assertion, context))
}

function resolveActual(path, context) {
  if (path === "status") return context.status
  if (path === "duration") return context.duration
  const matches = JSONPath({ path, json: context.body, wrap: true })
  if (matches.length === 0) return undefined
  return matches.length === 1 ? matches[0] : matches
}

function evaluate(op, actual, expected) {
  switch (op) {
    case "exists":
      return actual !== undefined && actual !== null
    case "notExists":
      return actual === undefined || actual === null
    case "equals":
      return JSON.stringify(actual) === JSON.stringify(expected)
    case "notEquals":
      return JSON.stringify(actual) !== JSON.stringify(expected)
    case "contains":
      if (typeof actual === "string") return actual.includes(String(expected))
      if (Array.isArray(actual)) return actual.some(item => JSON.stringify(item) === JSON.stringify(expected))
      return false
    case "lessThan":
      return typeof actual === "number" && actual < Number(expected)
    case "greaterThan":
      return typeof actual === "number" && actual > Number(expected)
    case "matches":
      return typeof actual === "string" && new RegExp(String(expected)).test(actual)
    default:
      return false
  }
}

function describe(value) {
  if (value === undefined) return "undefined"
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
