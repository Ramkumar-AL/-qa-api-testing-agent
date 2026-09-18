import { heuristicSuite } from "../src/lib/heuristics.js"
import { buildGeneratePrompt, GENERATE_SYSTEM_PROMPT } from "../src/lib/prompts.js"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" })
  }

  const input = req.body || {}
  const method = String(input.method || "GET").toUpperCase()
  const endpoint = input.endpoint || "/"
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return res.status(200).json(heuristicSuite({ method, endpoint, sampleResponse: input.sampleResponse }))
  }

  try {
    const response = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: GENERATE_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildGeneratePrompt({
              method,
              endpoint,
              sampleBody: input.sampleBody,
              sampleResponse: input.sampleResponse
            })
          }
        ]
      })
    })

    if (!response.ok) {
      return res.status(200).json(heuristicSuite({ method, endpoint, sampleResponse: input.sampleResponse }))
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return res.status(200).json(heuristicSuite({ method, endpoint, sampleResponse: input.sampleResponse }))

    const parsed = JSON.parse(content)
    return res.status(200).json({ source: "ai", ...parsed })
  } catch {
    return res.status(200).json(heuristicSuite({ method, endpoint, sampleResponse: input.sampleResponse }))
  }
}
