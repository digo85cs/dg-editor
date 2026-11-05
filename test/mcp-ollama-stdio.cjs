const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { mkdtempSync, existsSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')

async function main() {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
  const root = mkdtempSync(path.join(tmpdir(), 'dg-ollama-stdio-'))
  const calls = []
  const remote = { name: 'my-cloud-alias', remote_host: 'https://ollama.com:443', remote_model: 'cloud-model:large', size: 300 }
  const local = { name: 'local-model:latest', size: 1000 }
  const upstream = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = raw ? JSON.parse(raw) : {}
    calls.push({ url: req.url, body, authorization: req.headers.authorization })
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [remote, local] }))
    if (req.url === '/api/show') return res.end(JSON.stringify({ ...(body.model === remote.name ? remote : local), capabilities: ['completion'] }))
    if (req.url === '/api/chat') {
      const prompt = body.messages.at(-1).content
      if (body.model === remote.name && !prompt.includes('cloud-ok') || prompt.includes('all-fail')) {
        res.statusCode = 503
        return res.end(JSON.stringify({ error: 'cloud unavailable' }))
      }
      const script = body.messages[0].content.includes('Gere somente o código')
      const content = script ? "require('node:fs').writeFileSync('must-not-exist', 'not executed')" : 'Resposta de ' + body.model
      return res.end(JSON.stringify({ model: body.model, message: { content }, done: true, ...(body.model === remote.name ? remote : {}) }))
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'not found' }))
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const env = Object.fromEntries(Object.entries({
    ...process.env,
    DG_ROOT: root,
    OLLAMA_URL: 'http://127.0.0.1:' + upstream.address().port,
    OLLAMA_API_KEY: '',
    OLLAMA_MODEL: remote.name,
    OLLAMA_FALLBACK_MODEL: local.name
  }).filter(([, value]) => typeof value === 'string'))
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('.dg-editor/bin/main/mcp/server.js')],
    cwd: root,
    env,
    stderr: 'pipe'
  })
  const client = new Client({ name: 'dg-ollama-protocol-test', version: '1.0.0' })
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args })
    return { ...result, data: result.isError ? undefined : JSON.parse(result.content.find((c) => c.type === 'text').text) }
  }
  try {
    await client.connect(transport)
    const tools = (await client.listTools()).tools
    assert(tools.some((tool) => tool.name === 'ollama_ask'))
    assert(tools.some((tool) => tool.name === 'ollama_script' && tool.inputSchema.properties.language))
    const cloud = await call('ollama_ask', { prompt: 'cloud-ok', model: remote.name })
    assert.equal(cloud.isError, undefined)
    assert.equal(cloud.data.provider, 'ollama-cloud')
    assert.equal(cloud.data.fallback_used, false)
    const fallback = await call('ollama_ask', { prompt: 'cloud-fail', model: remote.name })
    assert.equal(fallback.data.provider, 'ollama-local')
    assert.equal(fallback.data.model, local.name)
    assert.equal(fallback.data.fallback_used, true)
    const script = await call('ollama_script', { prompt: 'gere um script', model: remote.name, language: 'javascript' })
    assert.equal(script.data.language, 'javascript')
    assert.match(script.data.text, /writeFileSync/)
    assert.equal(script.data.fallback_used, true)
    assert.equal(existsSync(path.join(root, 'must-not-exist')), false)
    const failed = await call('ollama_ask', { prompt: 'all-fail', model: remote.name })
    assert.equal(failed.isError, true)
    const invalid = await call('ollama_ask', { prompt: '' })
    assert.equal(invalid.isError, true)
    const rejected = await call('ollama_ask', { prompt: 'cloud-ok', model: remote.name, backend: 'local' })
    assert.equal(rejected.isError, true)
    assert(calls.every((call) => call.authorization === undefined))
    assert(calls.filter((call) => call.url === '/api/chat').every((call) => call.body.stream === false))
    console.log('PASS MCP stdio: listTools, cloud, fallback local, script inerte, falha total e validação')
  } finally {
    await client.close().catch(() => {})
    await transport.close().catch(() => {})
    await new Promise((resolve) => upstream.close(resolve))
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
