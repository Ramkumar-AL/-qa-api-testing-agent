import Ajv from "ajv"
import addFormats from "ajv-formats"

/**
 * Validates a response body against an inline JSON Schema object (pasted or
 * generated in the UI - there's no filesystem in the browser or in a
 * serverless function invocation, so unlike the CLI version this never
 * reads a schema file). A fresh Ajv instance is used per call so repeated
 * validations (or schemas without unique $id) never collide.
 */
export function validateAgainstSchema(schema, body) {
  if (!schema) return []
  try {
    const ajv = new Ajv({ allErrors: true, strict: false })
    addFormats(ajv)
    const validate = ajv.compile(schema)
    const valid = validate(body)
    if (valid) return []
    return (validate.errors ?? []).map(error => `${error.instancePath || "(root)"} ${error.message ?? "failed validation"}`)
  } catch (error) {
    return [`Invalid schema: ${error instanceof Error ? error.message : "could not compile"}`]
  }
}
