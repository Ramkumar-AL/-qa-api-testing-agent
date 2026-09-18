/**
 * Holds seed + extracted variables for a suite run and resolves {{name}}
 * placeholders inside strings, headers, and JSON bodies. Shared as-is
 * between the browser bundle and the serverless function - it has no
 * Node- or DOM-specific APIs.
 */
export class VariableStore {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed))
  }

  set(name, value) {
    this.values.set(name, value)
  }

  get(name) {
    return this.values.get(name)
  }

  snapshot() {
    return Object.fromEntries(this.values.entries())
  }

  resolveString(input) {
    if (typeof input !== "string") return input
    return input.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, name) => {
      if (!this.values.has(name)) return match
      const value = this.values.get(name)
      return typeof value === "string" ? value : JSON.stringify(value)
    })
  }

  resolveDeep(input) {
    if (typeof input === "string") return this.resolveString(input)
    if (Array.isArray(input)) return input.map(item => this.resolveDeep(item))
    if (input && typeof input === "object") {
      const out = {}
      for (const [key, value] of Object.entries(input)) out[key] = this.resolveDeep(value)
      return out
    }
    return input
  }
}
