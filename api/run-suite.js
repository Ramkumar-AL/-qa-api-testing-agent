import { runSuite } from "./_engine.js"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" })
  }

  const { suite, aiTriage } = req.body || {}

  if (!suite || !Array.isArray(suite.steps) || suite.steps.length === 0) {
    return res.status(400).json({ error: "A suite with at least one step is required." })
  }

  try {
    const report = await runSuite(suite, { aiTriage: Boolean(aiTriage) })
    return res.status(200).json(report)
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to run suite." })
  }
}
