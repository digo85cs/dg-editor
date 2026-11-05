// Behavioral checks for the Ollama MCP tools. All HTTP calls are mocked.
// Run with: node test/ollama-mcp.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const esbuild = require('esbuild')

const ROOT = path.resolve(__dirname, '..')
const LOCAL = 'http://127.0.0.1:11434'
const CLOUD = 'https://ollama.com'
const LOCAL_MODEL = 'qwen2.5-coder:3b'
const CLOUD_MODEL = 'gpt-oss:120b'
const CLOUD_ALIAS = 'gpt-oss:120b-cloud'
const SECRET = 'mcp-test-secret-never-print'
const tests = []
let executeOllamaTool
let fixtureRoot

function test(name, fn) {
  tests.push({ name, fn })
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function localModel(name = LOCAL_MODEL, extra = {}) {
  return { name, model: name, size: 2_000_000_000, capabilities: ['completion'], ...extra }
}

function remoteModel(name = CLOUD_ALIAS, extra = {}) {
  return localModel(name, {
    size: 0,
    remote_host: CLOUD + ':443',
    remote_model: CLOUD_MODEL,
    ...extra
  })
}

function abortError() {
  return new DOMException('The operation was aborted', 'AbortError')
}

function mockOllama({
  models = [remoteModel(), localModel()],
  cloudModels = [localModel(CLOUD_MODEL)],
  show = {},
  localChat,
  cloudChat
} = {}) {
  const calls = []
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    const signal = init.signal || (typeof input === 'object' && input.signal)
    if (signal && signal.aborted) throw signal.reason || abortError()
    const headers = new Headers(init.headers || (typeof input === 'object' && input.headers) || {})
    let rawBody = init.body
    if (rawBody == null && input instanceof Request) rawBody = await input.clone().text()
    const body = typeof rawBody === 'string' && rawBody ? JSON.parse(rawBody) : undefined
    const call = { url, headers, body, signal, method: init.method || 'GET' }
    calls.push(call)
    assert.ok([LOCAL, CLOUD].includes(url.origin), 'request must use the daemon or official Ollama Cloud')
    if (url.origin !== CLOUD) {
      assert.equal(headers.get('authorization'), null, 'cloud credentials must never be sent to the daemon')
    }
    if (url.pathname === '/api/tags') {
      return json({ models: url.origin === CLOUD ? cloudModels : models })
    }
    if (url.pathname === '/api/show') {
      const found = show[body && body.model] || models.find((m) => m.name === (body && body.model))
      return found
        ? json({ capabilities: ['completion'], ...found })
        : json({ error: 'model not found' }, 404)
    }
    if (url.pathname === '/api/chat') {
      assert.equal(body.stream, false, 'MCP result must be a complete response')
      const handler = url.origin === CLOUD ? cloudChat : localChat
      if (!handler) throw new Error('Unexpected chat request: ' + url.origin + ' / ' + body.model)
      return await handler(call)
    }
    throw new Error('Unexpected endpoint: ' + url.pathname)
  }
  return { fetchImpl, calls }
}

function runtime(mock, extra = {}) {
  return {
    fetchImpl: mock.fetchImpl,
    localUrl: LOCAL,
    apiKey: '',
    defaultModel: LOCAL_MODEL,
    fallbackModel: LOCAL_MODEL,
    ...extra
  }
}

function chats(mock, origin) {
  return mock.calls.filter((c) => c.url.pathname === '/api/chat' && (!origin || c.url.origin === origin))
}

function answer(model, content, extra = {}) {
  return json({ model, message: { role: 'assistant', content }, done: true, ...extra })
}

function assertLocalResult(result, requested, { fallback = true } = {}) {
  assert.equal(result.requested_model, requested)
  assert.equal(result.model, LOCAL_MODEL)
  assert.equal(result.provider, 'ollama-local')
  assert.equal(result.transport, 'daemon')
  assert.equal(result.fallback_used, fallback)
  assert.ok(Array.isArray(result.attempts))
  assert.ok(result.attempts.some((a) => a.model === LOCAL_MODEL && a.ok === true))
}

test('default local model keeps the existing daemon path', async () => {
  const mock = mockOllama({
    models: [localModel()],
    localChat: (call) => answer(call.body.model, 'local answer')
  })
  const result = await executeOllamaTool('ollama_ask', { prompt: 'hello' }, fixtureRoot, runtime(mock))
  assert.equal(result.text, 'local answer')
  assertLocalResult(result, LOCAL_MODEL, { fallback: false })
  assert.equal(chats(mock, CLOUD).length, 0)
})

test('a local tag ending in cloudy is not mistaken for a cloud selector', async () => {
  const model = 'foo:cloudy'
  const mock = mockOllama({
    models: [localModel(model)],
    localChat: (call) => answer(call.body.model, 'ordinary local tag')
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model
  }, fixtureRoot, runtime(mock, { defaultModel: model, fallbackModel: model }))
  assert.equal(result.model, model)
  assert.equal(result.provider, 'ollama-local')
  assert.equal(result.transport, 'daemon')
  assert.equal(result.fallback_used, false)
  assert.equal(chats(mock, CLOUD).length, 0)
})

test('signed-in daemon serves a cloud suffix without an API key', async () => {
  const mock = mockOllama({
    localChat: (call) => {
      assert.equal(call.body.model, CLOUD_ALIAS)
      return answer(CLOUD_ALIAS, 'cloud through daemon', {
        remote_model: CLOUD_MODEL,
        remote_host: CLOUD + ':443'
      })
    }
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS
  }, fixtureRoot, runtime(mock))
  assert.equal(result.text, 'cloud through daemon')
  assert.equal(result.requested_model, CLOUD_ALIAS)
  assert.equal(result.provider, 'ollama-cloud')
  assert.equal(result.transport, 'daemon')
  assert.equal(result.fallback_used, false)
  assert.equal(chats(mock, CLOUD).length, 0)
})

test('remote metadata identifies an arbitrary alias as cloud', async () => {
  const alias = 'my-coding-alias:latest'
  const mock = mockOllama({
    models: [remoteModel(alias), localModel()],
    localChat: (call) => answer(call.body.model, 'remote alias answer', {
      remote_model: CLOUD_MODEL, remote_host: CLOUD
    })
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: alias
  }, fixtureRoot, runtime(mock))
  assert.equal(result.provider, 'ollama-cloud')
  assert.equal(result.transport, 'daemon')
  assert.equal(chats(mock, LOCAL)[0].body.model, alias)
})

test('/api/show detects a remote alias omitted from the tags metadata', async () => {
  const alias = 'show-only-alias:latest'
  const mock = mockOllama({
    models: [localModel(alias), localModel()],
    show: { [alias]: remoteModel(alias) },
    localChat: (call) => answer(call.body.model, 'cloud from show metadata')
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: alias
  }, fixtureRoot, runtime(mock))
  assert.equal(result.provider, 'ollama-cloud')
  assert.equal(result.transport, 'daemon')
  assert.equal(result.fallback_used, false)
})

test('direct cloud uses the official host, Bearer key and remote_model', async () => {
  const alias = 'my-coding-alias:latest'
  const mock = mockOllama({
    models: [remoteModel(alias), localModel()],
    cloudChat: (call) => {
      assert.equal(call.url.origin, CLOUD)
      assert.equal(call.headers.get('authorization'), 'Bearer ' + SECRET)
      assert.equal(call.body.model, CLOUD_MODEL)
      return answer(CLOUD_MODEL, 'official cloud answer')
    }
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: alias, backend: 'cloud'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET }))
  assert.equal(result.text, 'official cloud answer')
  assert.equal(result.requested_model, alias)
  assert.equal(result.model, CLOUD_MODEL)
  assert.equal(result.provider, 'ollama-cloud')
  assert.equal(result.transport, 'cloud')
  assert.equal(result.fallback_used, false)
})

test('direct cloud can answer while the local daemon is offline', async () => {
  const mock = mockOllama({
    cloudChat: (call) => answer(call.body.model, 'cloud without daemon')
  })
  const fetchImpl = async (input, init) => {
    if (new URL(String(input)).origin === LOCAL) throw new TypeError('daemon is offline')
    return mock.fetchImpl(input, init)
  }
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_MODEL, backend: 'cloud'
  }, fixtureRoot, { ...runtime(mock, { apiKey: SECRET }), fetchImpl })
  assert.equal(result.text, 'cloud without daemon')
  assert.equal(result.provider, 'ollama-cloud')
  assert.equal(result.transport, 'cloud')
  assert.equal(result.fallback_used, false)
})

test('explicit cloud without an API key falls back locally without leaking a request', async () => {
  const mock = mockOllama({
    localChat: (call) => answer(call.body.model, 'local without a key')
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
  }, fixtureRoot, runtime(mock))
  assertLocalResult(result, CLOUD_ALIAS)
  assert.equal(chats(mock, CLOUD).length, 0)
})

test('legacy cloud suffix resolves through the official cloud catalog', async () => {
  const mock = mockOllama({
    models: [localModel()],
    cloudChat: (call) => {
      assert.equal(call.body.model, CLOUD_MODEL)
      return answer(CLOUD_MODEL, 'legacy cloud answer')
    }
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET }))
  assert.equal(result.provider, 'ollama-cloud')
  assert.equal(result.model, CLOUD_MODEL)
  assert.equal(result.fallback_used, false)
})

test(':cloud resolves a single matching canonical model without inventing latest', async () => {
  const mock = mockOllama({
    models: [localModel()],
    cloudModels: [localModel('gemma4:31b')],
    cloudChat: (call) => {
      assert.equal(call.body.model, 'gemma4:31b')
      return answer(call.body.model, 'resolved cloud answer')
    }
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: 'gemma4:cloud', backend: 'cloud'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET }))
  assert.equal(result.model, 'gemma4:31b')
  assert.equal(result.fallback_used, false)
})

test('ambiguous :cloud catalog falls back locally instead of guessing a tag', async () => {
  const mock = mockOllama({
    models: [localModel()],
    cloudModels: [localModel('gemma4:31b'), localModel('gemma4:27b')],
    localChat: (call) => answer(call.body.model, 'safe local answer'),
    cloudChat: () => {
      assert.fail('ambiguous cloud model must not be guessed')
    }
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: 'gemma4:cloud', backend: 'cloud'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET }))
  assertLocalResult(result, 'gemma4:cloud')
  assert.equal(chats(mock, CLOUD).length, 0)
  assert.equal(mock.calls.some((c) => c.body && c.body.model === 'gemma4:latest'), false)
})

for (const status of [401, 429, 502, 503]) {
  test('cloud HTTP ' + status + ' uses an installed local fallback', async () => {
    const mock = mockOllama({
      cloudChat: () => json({ error: 'cloud unavailable for this request' }, status),
      localChat: (call) => {
        assert.equal(call.body.model, LOCAL_MODEL)
        return answer(call.body.model, 'fallback answer')
      }
    })
    const result = await executeOllamaTool('ollama_ask', {
      prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
    }, fixtureRoot, runtime(mock, { apiKey: SECRET }))
    assert.equal(result.text, 'fallback answer')
    assertLocalResult(result, CLOUD_ALIAS)
    assert.ok(result.attempts.some((a) => a.ok === false && a.error))
  })
}

test('network failure and JSON error bodies cannot be mistaken for cloud success', async () => {
  for (const failure of [
    () => { throw new TypeError('fetch failed') },
    () => json({ error: 'upstream model failed' })
  ]) {
    const mock = mockOllama({
      cloudChat: failure,
      localChat: (call) => answer(call.body.model, 'local after error')
    })
    const result = await executeOllamaTool('ollama_ask', {
      prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
    }, fixtureRoot, runtime(mock, { apiKey: SECRET }))
    assertLocalResult(result, CLOUD_ALIAS)
  }
})

test('fallback discovery excludes remote aliases and embedding models', async () => {
  const remoteAlias = 'looks-local:latest'
  const embedding = 'nomic-embed-text:latest'
  const mock = mockOllama({
    models: [
      remoteModel(remoteAlias),
      localModel(embedding, { capabilities: ['embedding'], details: { family: 'nomic-bert' } }),
      localModel()
    ],
    cloudChat: () => json({ error: 'cloud offline' }, 503),
    localChat: (call) => {
      assert.equal(call.body.model, LOCAL_MODEL)
      return answer(call.body.model, 'real local model')
    }
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET, fallbackModel: '' }))
  assertLocalResult(result, CLOUD_ALIAS)
  assert.equal(chats(mock, LOCAL).some((c) => [remoteAlias, embedding].includes(c.body.model)), false)
})

test('fallback discovery checks show capabilities before using an embedding alias', async () => {
  const alias = 'vector-alias:latest'
  const mock = mockOllama({
    models: [localModel(alias, { size: 1 }), localModel()],
    show: { [alias]: { capabilities: ['embedding'] } },
    cloudChat: () => json({ error: 'cloud offline' }, 502),
    localChat: (call) => {
      assert.equal(call.body.model, LOCAL_MODEL)
      return answer(call.body.model, 'completion fallback')
    }
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET, fallbackModel: '' }))
  assertLocalResult(result, CLOUD_ALIAS)
  assert.equal(chats(mock, LOCAL).some((c) => c.body.model === alias), false)
})

test('an explicit fallback cannot secretly be a cloud alias', async () => {
  const alias = 'hidden-remote:latest'
  const mock = mockOllama({
    models: [remoteModel(alias), localModel()],
    localChat: () => assert.fail('invalid fallback must be rejected before inference'),
    cloudChat: () => assert.fail('invalid fallback must be rejected before inference')
  })
  await assert.rejects(executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud', fallback_model: alias
  }, fixtureRoot, runtime(mock, { apiKey: SECRET })))
  assert.equal(chats(mock).length, 0)
})

test('the daemon cloud failure also falls back without requiring a cloud API key', async () => {
  const mock = mockOllama({
    localChat: (call) => call.body.model === CLOUD_ALIAS
      ? json({ error: 'unauthorized; sign in to Ollama' }, 401)
      : answer(call.body.model, 'offline-capable local answer')
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS
  }, fixtureRoot, runtime(mock))
  assertLocalResult(result, CLOUD_ALIAS)
  assert.equal(chats(mock, CLOUD).length, 0)
})

test('both cloud and local failing return an explicit failure', async () => {
  const mock = mockOllama({
    cloudChat: () => json({ error: 'cloud unavailable' }, 503),
    localChat: () => json({ error: 'local model unavailable' }, 500)
  })
  await assert.rejects(
    executeOllamaTool('ollama_ask', {
      prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
    }, fixtureRoot, runtime(mock, { apiKey: SECRET })),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /cloud|ollama|model|tentativ|fallback|local/i)
      assert.ok(chats(mock, CLOUD).length > 0)
      assert.ok(chats(mock, LOCAL).length > 0)
      return true
    }
  )
})

test('a malformed cloud request is surfaced instead of silently changing models', async () => {
  const mock = mockOllama({
    cloudChat: () => json({ error: 'invalid parameter temperature' }, 400),
    localChat: () => assert.fail('invalid payload must not be hidden by fallback')
  })
  await assert.rejects(executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET })), /400|invalid/i)
  assert.equal(chats(mock, LOCAL).length, 0)
})

test('HTTP 200 with an invalid messages error does not trigger fallback', async () => {
  const mock = mockOllama({
    cloudChat: () => json({ error: 'invalid messages payload' }),
    localChat: () => assert.fail('invalid messages must not be hidden by fallback')
  })
  await assert.rejects(executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET })), /invalid|messages/i)
  assert.equal(chats(mock, LOCAL).length, 0)
})

test('HTTP 400 with a non-JSON invalid response does not trigger fallback', async () => {
  const mock = mockOllama({
    cloudChat: () => new Response('Bad Request: invalid messages payload', { status: 400 }),
    localChat: () => assert.fail('HTTP 400 payload errors must not be hidden by fallback')
  })
  await assert.rejects(executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET })), /400|invalid|JSON/i)
  assert.equal(chats(mock, LOCAL).length, 0)
})

test('an internal cloud timeout falls back while keeping user cancellation distinct', async () => {
  const mock = mockOllama({
    cloudChat: (call) => new Promise((_resolve, reject) => {
      assert.ok(call.signal)
      if (call.signal.aborted) reject(call.signal.reason || abortError())
      else call.signal.addEventListener('abort', () => reject(call.signal.reason || abortError()), { once: true })
    }),
    localChat: (call) => answer(call.body.model, 'local after timeout')
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud', timeout_ms: 100
  }, fixtureRoot, runtime(mock, { apiKey: SECRET }))
  assertLocalResult(result, CLOUD_ALIAS)
  assert.match(result.attempts.find((a) => !a.ok).error, /timeout|100/i)
})

test('cloud fallback preserves prompt, context, system and generation options', async () => {
  const mock = mockOllama({
    cloudChat: () => json({ error: 'try local' }, 502),
    localChat: (call) => answer(call.body.model, 'preserved request')
  })
  await executeOllamaTool('ollama_ask', {
    prompt: 'unique-user-prompt',
    model: CLOUD_ALIAS,
    backend: 'cloud',
    context: 'unique-context',
    system: 'unique-system',
    temperature: 0.25,
    num_predict: 123
  }, fixtureRoot, runtime(mock, { apiKey: SECRET }))
  for (const call of chats(mock)) {
    const serialized = JSON.stringify(call.body)
    assert.ok(serialized.includes('unique-user-prompt'))
    assert.ok(serialized.includes('unique-context'))
    assert.ok(serialized.includes('unique-system'))
    assert.equal(call.body.options.temperature, 0.25)
    assert.equal(call.body.options.num_predict, 123)
  }
})

test('an arbitrary upstream host never receives requests or the cloud key', async () => {
  const alias = 'custom-remote:latest'
  const mock = mockOllama({
    models: [remoteModel(alias, { remote_host: 'https://untrusted.invalid', remote_model: 'private-model' }), localModel()],
    localChat: (call) => {
      assert.equal(call.body.model, LOCAL_MODEL, 'untrusted remote alias must not be invoked through the daemon either')
      return answer(call.body.model, 'trusted local fallback')
    },
    cloudChat: () => json({ error: 'unknown alias' }, 404)
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: alias
  }, fixtureRoot, runtime(mock, { apiKey: SECRET }))
  assertLocalResult(result, alias)
  assert.equal(mock.calls.some((c) => c.url.hostname === 'untrusted.invalid'), false)
  assert.equal(chats(mock, LOCAL).some((c) => c.body.model === alias), false)
  for (const call of mock.calls) {
    if (call.headers.has('authorization')) assert.equal(call.url.origin, CLOUD)
  }
})

test('cloud errors are redacted in successful fallback diagnostics', async () => {
  const mock = mockOllama({
    cloudChat: () => json({ error: 'Authorization: Bearer ' + SECRET + ' rejected' }, 401),
    localChat: (call) => answer(call.body.model, 'redacted fallback')
  })
  const result = await executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET }))
  assertLocalResult(result, CLOUD_ALIAS)
  assert.equal(JSON.stringify(result).includes(SECRET), false)
})

test('the final failure does not expose credentials from upstream errors', async () => {
  const mock = mockOllama({
    cloudChat: () => { throw new Error('Bearer ' + SECRET + ' failed') },
    localChat: () => json({ error: 'upstream key=' + SECRET }, 500)
  })
  await assert.rejects(
    executeOllamaTool('ollama_ask', {
      prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
    }, fixtureRoot, runtime(mock, { apiKey: SECRET })),
    (error) => {
      assert.equal(String(error && error.message || error).includes(SECRET), false)
      return true
    }
  )
})

test('a pre-cancelled request does not start inference or fallback', async () => {
  const controller = new AbortController()
  controller.abort(abortError())
  const mock = mockOllama({
    cloudChat: () => assert.fail('cancelled cloud inference must not run'),
    localChat: () => assert.fail('cancelled fallback must not run')
  })
  await assert.rejects(executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET, signal: controller.signal })))
  assert.equal(chats(mock).length, 0)
})

test('backend local rejects a cloud selector before inference', async () => {
  const mock = mockOllama({
    localChat: () => assert.fail('local-only mode must not offload to cloud'),
    cloudChat: () => assert.fail('local-only mode must not call the cloud API')
  })
  await assert.rejects(executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS, backend: 'local'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET })))
  assert.equal(chats(mock).length, 0)
})

test('backend local refuses an unknown alias when show cannot prove it is local', async () => {
  const mock = mockOllama({
    models: [localModel()],
    localChat: () => assert.fail('unknown alias must not be sent to generation in local-only mode'),
    cloudChat: () => assert.fail('local-only mode must not send cloud inference')
  })
  await assert.rejects(executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: 'unknown-alias:latest', backend: 'local'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET })))
  assert.equal(chats(mock).length, 0)
})

test('cancelling cloud inference never starts a local fallback', async () => {
  const controller = new AbortController()
  let notifyStarted
  const started = new Promise((resolve) => { notifyStarted = resolve })
  const mock = mockOllama({
    cloudChat: (call) => new Promise((_resolve, reject) => {
      assert.ok(call.signal, 'inference must receive a cancellation signal')
      notifyStarted()
      if (call.signal.aborted) reject(call.signal.reason || abortError())
      else call.signal.addEventListener('abort', () => reject(call.signal.reason || abortError()), { once: true })
    }),
    localChat: () => assert.fail('user cancellation must not launch another model')
  })
  const pending = executeOllamaTool('ollama_ask', {
    prompt: 'hello', model: CLOUD_ALIAS, backend: 'cloud'
  }, fixtureRoot, runtime(mock, { apiKey: SECRET, signal: controller.signal }))
  const rejected = assert.rejects(pending)
  await started
  controller.abort(abortError())
  await rejected
  assert.equal(chats(mock, LOCAL).length, 0)
})

test('ollama_script generates the chosen language and never executes the result', async () => {
  const marker = path.join(fixtureRoot, 'script-was-executed.txt')
  const script = 'from pathlib import Path\nPath(' + JSON.stringify(marker) + ').write_text("executed")\n'
  const mock = mockOllama({
    models: [localModel()],
    localChat: (call) => {
      assert.match(JSON.stringify(call.body), /python/i)
      assert.ok(JSON.stringify(call.body).includes('write a marker file'))
      return answer(call.body.model, script)
    }
  })
  const result = await executeOllamaTool('ollama_script', {
    prompt: 'write a marker file', language: 'python'
  }, fixtureRoot, runtime(mock))
  assert.equal(result.text, script)
  assert.equal(result.language, 'python')
  assert.equal(fs.existsSync(marker), false, 'generated scripts must not execute')
})

test('invalid input is rejected before network calls', async () => {
  const invalidArgs = [
    null,
    [],
    {},
    { prompt: '' },
    { prompt: '   ' },
    { prompt: 17 },
    { prompt: 'ok', model: 17 },
    { prompt: 'ok', fallback_model: {} },
    { prompt: 'ok', backend: 'untrusted' },
    { prompt: 'ok', temperature: 'warm' },
    { prompt: 'ok', num_predict: -1 },
    { prompt: 'ok', timeout_ms: -1 },
    { prompt: 'ok', language: 17 }
  ]
  for (const args of invalidArgs) {
    let calls = 0
    const fetchImpl = async () => { calls++; throw new Error('invalid input reached network') }
    await assert.rejects(executeOllamaTool('ollama_script', args, fixtureRoot, {
      fetchImpl, localUrl: LOCAL, apiKey: '', defaultModel: LOCAL_MODEL, fallbackModel: LOCAL_MODEL
    }), 'input should be invalid: ' + JSON.stringify(args))
    assert.equal(calls, 0)
  }
})

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-ollama-mcp-test-'))
  fixtureRoot = path.join(temp, 'project')
  fs.mkdirSync(fixtureRoot)
  try {
    const entry = path.join(ROOT, 'src', 'main', 'mcp', 'ollama-tools.ts')
    assert.ok(fs.existsSync(entry), 'src/main/mcp/ollama-tools.ts must exist before running these tests')
    const outfile = path.join(temp, 'ollama-tools.cjs')
    esbuild.buildSync({
      absWorkingDir: ROOT,
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      outfile,
      external: ['electron', 'node-pty'],
      logLevel: 'silent'
    })
    ;({ executeOllamaTool } = require(outfile))
    assert.equal(typeof executeOllamaTool, 'function')
    let failed = 0
    for (const { name, fn } of tests) {
      let timer
      try {
        await Promise.race([
          fn(),
          new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('test exceeded 5 seconds')), 5000)
          })
        ])
        console.log('PASS ' + name)
      } catch (error) {
        failed++
        console.error('FAIL ' + name + '\n' + String(error && error.stack || error))
      } finally {
        clearTimeout(timer)
      }
    }
    console.log('Ollama MCP: ' + (tests.length - failed) + '/' + tests.length + ' passed')
    if (failed) process.exitCode = 1
  } finally {
    const safeParent = path.resolve(os.tmpdir())
    if (path.dirname(temp) === safeParent && path.basename(temp).startsWith('dg-ollama-mcp-test-')) {
      fs.rmSync(temp, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error(String(error && error.stack || error))
  process.exitCode = 1
})
