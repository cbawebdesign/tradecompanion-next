#!/usr/bin/env node
// TC AHK Companion Server
// Runs on Justin's Windows machine alongside the web version of Trade Companion.
// Listens for HTTP requests from the browser and launches AHK scripts.
//
// Usage:
//   node ahk-server.js
//   node ahk-server.js --port 9876 --script "C:\path\to\script.ahk" --args "--extra-args"
//
// The web app calls: GET http://localhost:9876/run?symbol=AAPL
// This server launches: ahk-script.ahk --extra-args AAPL

const http = require('http')
const { exec } = require('child_process')
const path = require('path')

// Parse CLI args
const args = process.argv.slice(2)
let port = 9876
let scriptPath = ''
let scriptArgs = ''

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = parseInt(args[i + 1])
  if (args[i] === '--script' && args[i + 1]) scriptPath = args[i + 1]
  if (args[i] === '--args' && args[i + 1]) scriptArgs = args[i + 1]
}

// Config file fallback
const fs = require('fs')
const configPath = path.join(__dirname, 'ahk-config.json')
if (!scriptPath && fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    scriptPath = config.scriptPath || ''
    scriptArgs = config.scriptArgs || ''
    port = config.port || port
  } catch (e) {
    console.error('Error reading config:', e.message)
  }
}

const server = http.createServer((req, res) => {
  // CORS headers for browser requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  // Private Network Access opt-in — without this, Chrome silently blocks
  // fetches from HTTPS origins (like vercel.app) to http://localhost.
  res.setHeader('Access-Control-Allow-Private-Network', 'true')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:${port}`)

  if (url.pathname === '/run') {
    const symbol = url.searchParams.get('symbol')
    if (!symbol) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing symbol parameter' }))
      return
    }

    if (!scriptPath) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'No script configured. Set --script or edit ahk-config.json' }))
      return
    }

    const fullCommand = `"${scriptPath}" ${scriptArgs} ${symbol}`
    console.log(`[${new Date().toLocaleTimeString()}] Running: ${fullCommand}`)

    exec(fullCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`  Error: ${error.message}`)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message }))
        return
      }
      console.log(`  Done: ${symbol}`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, symbol }))
    })
  } else if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', script: scriptPath || '(not configured)', port }))
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found. Use /run?symbol=AAPL or /health' }))
  }
})

server.listen(port, () => {
  console.log(`TC AHK Companion Server running on http://localhost:${port}`)
  console.log(`Script: ${scriptPath || '(not configured — use --script or ahk-config.json)'}`)
  console.log(`Args: ${scriptArgs || '(none)'}`)
  console.log('')
  console.log('Endpoints:')
  console.log(`  GET http://localhost:${port}/run?symbol=AAPL`)
  console.log(`  GET http://localhost:${port}/health`)
})
