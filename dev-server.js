import "dotenv/config"
import http from "node:http"
import runSuiteHandler from "./api/run-suite.js"
import generateHandler from "./api/generate.js"

const routes = {
  "/api/run-suite": runSuiteHandler,
  "/api/generate": generateHandler
}

const server = http.createServer((req, res) => {
  const handler = routes[req.url]
  if (!handler) {
    res.statusCode = 404
    return res.end("Not found")
  }

  let raw = ""
  req.on("data", chunk => (raw += chunk))
  req.on("end", async () => {
    req.body = raw ? JSON.parse(raw) : {}
    res.setHeader("Content-Type", "application/json")
    const shim = {
      status: code => {
        res.statusCode = code
        return shim
      },
      json: body => res.end(JSON.stringify(body))
    }
    try {
      await handler(req, shim)
    } catch (error) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }))
    }
  })
})

const port = process.env.DEV_API_PORT || 3000
server.listen(port, () => console.log(`API dev server on http://localhost:${port} (used by \`npm run dev\` via Vite's proxy)`))
