'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const host = require('../src/index.cjs')
const { resolveConfig } = require('../src/core.cjs')

function userEvent(text, source = { kind: 'user' }) {
  return { type: 'user/message', data: { content: [{ type: 'text', text }], source } }
}

function assistantEvent(text) {
  return {
    type: 'assistant/message',
    data: {
      turn: 1,
      step: 1,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text }],
        source: { kind: 'model', provider: 'test', model: 'test' },
      },
    },
  }
}

function candidateLines(...candidates) {
  return candidates.map(candidate => JSON.stringify({ candidate })).join('\n')
}

function contextWith(streamFactory) {
  const requests = []
  const session = {
    events: [
      userEvent('Fix the concurrency bug and report focused tests.'),
      userEvent('Workspace instructions '.repeat(1000), { kind: 'agent-instructions' }),
      userEvent('Skill catalog '.repeat(1000), { kind: 'skill-catalog' }),
      assistantEvent('I found the race and identified the focused tests.'),
    ],
    requestHeader: () => ({ config: { provider: 'session-provider', model: 'session-model' } }),
  }
  const services = {
    sessions: { get: (id) => id === 'session-1' ? session : undefined },
    llm: {
      stream(options) {
        requests.push(options)
        return streamFactory(options)
      },
    },
    sessionQuery: {
      listSessions: async () => [
        { header: { id: 'session-1' } },
        { header: { id: 'history-1' } },
      ],
      readSession: async () => ({ events: [userEvent('Keep changes small and run focused tests.')] }),
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'live-provider', model: 'live-model' }) },
  }
  return { ctx: { get: (name) => services[name] }, requests, session }
}

test('generate reuses the session route and sends bounded contextual JSON without tools', async () => {
  const { ctx, requests } = contextWith(async function * () {
    yield { type: 'text-delta', text: `${candidateLines('A')}\n` }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })
  const generate = host._testing.createGenerateHandler(ctx, resolveConfig({}))
  const result = await generate({
    sessionId: 'session-1',
    draft: 'Please inspect this.',
    trigger: { kind: 'manual' },
    currentCycleSkipped: ['Already shown'],
    localOutcomes: [{
      sessionId: 'history-1',
      action: 'cycled',
      origin: 'suggestion-exact',
      originalText: 'Old suggestion',
    }],
  })

  assert.equal(result.ok, true)
  assert.equal(result.candidate, 'A')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].provider, 'live-provider')
  assert.equal(requests[0].model, 'live-model')
  assert.equal(requests[0].reasoningEffort, 'off')
  assert.equal(requests[0].tools, undefined)
  const framed = JSON.parse(requests[0].messages[0].content[0].text)
  assert.equal(framed.current.draft, 'Please inspect this.')
  assert.equal(framed.current.recentTurns.length, 1)
  assert.deepEqual(framed.current.recentTurns[0], {
    user: { text: 'Fix the concurrency bug and report focused tests.', origin: 'manual' },
    assistant: { text: 'I found the race and identified the focused tests.' },
  })
  assert.deepEqual(framed.userPreferenceMemory.manualPrompts, [
    { text: 'Keep changes small and run focused tests.' },
  ])
  assert.deepEqual(framed.userPreferenceMemory.rejectedSuggestions, [
    { text: 'Old suggestion' },
  ])
  assert.deepEqual(framed.currentCycleSkipped, ['Already shown'])
})

test('generate reads events from the dsh Session snapshotEvents face', async () => {
  const { ctx, requests } = contextWith(async function * () {
    yield { type: 'text-delta', text: candidateLines('A') }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })
  const session = ctx.get('sessions').get('session-1')
  const stored = [...session.events]
  delete session.events
  session.snapshotEvents = () => stored
  const result = await host._testing.createGenerateHandler(ctx, resolveConfig({}))({
    sessionId: 'session-1', draft: '', trigger: { kind: 'manual' }, currentCycleSkipped: [], localOutcomes: [],
  })
  assert.equal(result.ok, true)
  const framed = JSON.parse(requests[0].messages[0].content[0].text)
  assert.equal(framed.current.recentTurns.length, 1)
})

test('project context grounds prediction in a blank session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pfm-project-'))
  try {
    await writeFile(join(directory, 'package.json'), JSON.stringify({
      name: 'fixture', scripts: { build: 'tsc' },
    }), 'utf8')
    await mkdir(join(directory, 'src'), { recursive: true })
    await writeFile(join(directory, 'src', 'main.ts'), 'export const main = 1\n', 'utf8')
    const { ctx, requests } = contextWith(async function * () {
      yield { type: 'text-delta', text: '继续实现 main.ts 的构建步骤。' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })
    const session = ctx.get('sessions').get('session-1')
    session.events = []
    session.header = { cwd: directory }
    const result = await host._testing.createGenerateHandler(ctx, resolveConfig({}))({
      sessionId: 'session-1', draft: '', mode: 'predict', trigger: { kind: 'manual' },
      currentCycleSkipped: [], localOutcomes: [],
    })
    assert.equal(result.ok, true)
    const framed = JSON.parse(requests[0].messages[0].content[0].text)
    assert.equal(framed.project.cwd, directory)
    assert.ok(framed.project.tree.includes('package.json'))
    assert.ok(framed.project.tree.includes('src/main.ts'))
    assert.equal(framed.project.manifests['package.json'].includes('tsc'), true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('automatic generation is bound to the latest completed turn at both commit checks', async () => {
  const first = contextWith(async function * () {
    yield { type: 'text-delta', text: `${candidateLines('A')}\n` }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })
  first.session.events.push(
    { type: 'turn/start', seq: 4, data: { turn: 1 } },
    { type: 'turn/end', seq: 5, data: { turn: 1, reason: { kind: 'completed' } } },
  )
  const generate = host._testing.createGenerateHandler(first.ctx, resolveConfig({}))
  assert.deepEqual(await generate({
    sessionId: 'session-1',
    draft: '',
    trigger: { kind: 'automatic', turn: 1, endSeq: 6 },
    currentCycleSkipped: [],
    localOutcomes: [],
  }), {
    ok: false,
    code: 'TURN_NOT_COMPLETED',
    message: 'The completed turn changed before automatic generation started.',
  })
  assert.equal(first.requests.length, 0)
  assert.equal((await generate({
    sessionId: 'session-1',
    draft: '',
    trigger: { kind: 'automatic', turn: 1, endSeq: 5 },
    currentCycleSkipped: [],
    localOutcomes: [],
  })).ok, true)

  let racedSession
  const raced = contextWith(async function * () {
    racedSession.events.push({ type: 'turn/start', seq: 6, data: { turn: 2 } })
    yield { type: 'text-delta', text: `${candidateLines('late')}\n` }
  })
  racedSession = raced.session
  racedSession.events.push(
    { type: 'turn/start', seq: 4, data: { turn: 1 } },
    { type: 'turn/end', seq: 5, data: { turn: 1, reason: { kind: 'completed' } } },
  )
  const seen = []
  const racedResult = await host._testing.createGenerateStream(raced.ctx, resolveConfig({}))({
    sessionId: 'session-1',
    draft: '',
    trigger: { kind: 'automatic', turn: 1, endSeq: 5 },
    currentCycleSkipped: [],
    localOutcomes: [],
  }, async (candidate) => { seen.push(candidate) })
  assert.equal(racedResult.code, 'TURN_NOT_COMPLETED')
  assert.deepEqual(seen, [])
})

test('generate records token usage and privacy-safe stage metrics', async () => {
  let time = 0
  const metrics = []
  const { ctx } = contextWith(async function * () {
    yield { type: 'text-delta', text: candidateLines('A') + '\n' }
    yield {
      type: 'usage',
      usage: { inputTokens: 9000, outputTokens: 120, cacheReadTokens: 2000, reasoningTokens: 0 },
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })
  const generate = host._testing.createGenerateStream(ctx, resolveConfig({}), {
    now: () => { time += 10; return time },
    record: (metric) => metrics.push(metric),
  })
  const result = await generate({
    sessionId: 'session-1', draft: 'private draft', trigger: { kind: 'manual' }, currentCycleSkipped: [], localOutcomes: [],
  }, async () => {})

  assert.equal(result.ok, true)
  assert.equal(metrics.length, 1)
  assert.deepEqual(metrics[0].route, {
    provider: 'live-provider', model: 'live-model', reasoningEffort: 'off',
  })
  assert.deepEqual(metrics[0].usage, {
    inputTokens: 9000, totalInputTokens: 11000, outputTokens: 120,
    cacheReadTokens: 2000, reasoningTokens: 0,
  })
  assert.equal(metrics[0].context.recentTurnItems, 1)
  assert.equal(metrics[0].context.preferenceManualItems, 1)
  assert.equal(metrics[0].context.currentEditedItems, 0)
  assert.equal(metrics[0].stages.candidateMs.length, 1)
  assert.equal(metrics[0].context.currentCycleSkippedItems, 0)
  assert.equal(metrics[0].stages.modelFirstReasoningMs, null)
  assert.equal(JSON.stringify(metrics[0]).includes('private draft'), false)
  assert.equal(JSON.stringify(metrics[0]).includes('Fix the concurrency bug'), false)
})

test('historicalEvents retains session IDs for outcome correlation', async () => {
  const { ctx } = contextWith(async function * () {})
  const history = await host._testing.historicalEvents(ctx, 'session-1', resolveConfig({}))
  assert.equal(history.length, 1)
  assert.equal(history[0].sessionId, 'history-1')
  assert.equal(history[0].events[0].data.content[0].text, 'Keep changes small and run focused tests.')
})

test('generate blocks empty-draft prediction when a new session has no human message', async () => {
  const { ctx, requests, session } = contextWith(async function * () {
    yield { type: 'text-delta', text: candidateLines('A') }
  })
  session.events = [
    userEvent('Workspace instructions', { kind: 'agent-instructions' }),
    userEvent('Skill catalog', { kind: 'skill-catalog' }),
  ]
  const result = await host._testing.createGenerateHandler(ctx, resolveConfig({}))({
    sessionId: 'session-1', draft: '', trigger: { kind: 'manual' }, currentCycleSkipped: [], localOutcomes: [],
  })
  assert.deepEqual(result, {
    ok: false,
    code: 'NO_USER_CONTEXT',
    message: 'This new session has no previous human message. Add a draft first to use the optimizer.',
  })
  assert.equal(requests.length, 0)
})

test('metrics store stays bounded and returns detached snapshots', () => {
  const logs = []
  const store = host._testing.createMetricsStore({
    logger: { info: (message) => logs.push(message) },
  }, 2)
  const makeMetric = (requestId) => ({
    requestId,
    stages: { candidateMs: [] },
    context: null,
    route: null,
    usage: null,
  })
  store.record(makeMetric('one'))
  store.record(makeMetric('two'))
  store.record(makeMetric('three'))
  const snapshot = store.snapshot()
  assert.deepEqual(snapshot.map((metric) => metric.requestId), ['two', 'three'])
  snapshot[0].stages.candidateMs.push(1)
  assert.deepEqual(store.snapshot()[0].stages.candidateMs, [])
  assert.match(logs[2], /^prompt-for-me metrics /)
})

test('metrics failures never change a successful generation', async () => {
  const { ctx } = contextWith(async function * () {
    yield { type: 'text-delta', text: candidateLines('A') }
  })
  const generate = host._testing.createGenerateStream(ctx, resolveConfig({}), {
    record: () => { throw new Error('metrics unavailable') },
  })
  const result = await generate({
    sessionId: 'session-1', draft: '', trigger: { kind: 'manual' }, currentCycleSkipped: [], localOutcomes: [],
  }, async () => {})
  assert.equal(result.ok, true)
})

test('a plugin-fixed model route overrides the live Session selection', async () => {
  const { ctx, requests } = contextWith(async function * () {
    yield { type: 'text-delta', text: candidateLines('A') }
  })
  const config = resolveConfig({ provider: 'fixed', model: 'fixed-model' })
  const result = await host._testing.createGenerateHandler(ctx, config)({
    sessionId: 'session-1', draft: '', trigger: { kind: 'manual' }, currentCycleSkipped: [], localOutcomes: [],
  })
  assert.equal(result.ok, true)
  assert.equal(requests[0].provider, 'fixed')
  assert.equal(requests[0].model, 'fixed-model')
})

test('Host settings register as live and preserve hidden product-owned limits', () => {
  let registered
  let watcher
  const scope = {
    get: () => ({ automatic: false, shortcut: 'Mod+Alt+K', route: null }),
    watch(callback) { watcher = callback; return () => {} },
  }
  const settings = {
    register(namespace, schema, options) {
      registered = { namespace, schema, options }
      return scope
    },
  }
  const applied = []
  const ctx = {
    get: (name) => name === 'settings' ? settings : undefined,
    effect: (install) => install(),
  }
  const base = resolveConfig({
    provider: 'profile', model: 'profile-model', timeoutMs: 4321,
  })
  host._testing.registerSettings(ctx, base, (next) => applied.push(next))

  assert.equal(registered.namespace, 'prompt-for-me')
  assert.equal(registered.options.applies, 'live')
  assert.deepEqual(registered.options.base, {
    automatic: true,
    shortcut: 'Mod+Shift+Space',
    route: { provider: 'profile', model: 'profile-model' },
    projectContextEnabled: true,
    projectContextDepth: 3,
    maxProjectTreeFiles: 100,
    maxProjectContextBytes: 16384,
    maxOutputTokens: 2048,
    timeoutMs: 4321,
  })
  assert.equal(applied[0].provider, undefined)
  assert.equal(applied[0].timeoutMs, 4321)

  watcher({
    automatic: true,
    shortcut: 'disabled',
    route: { provider: 'fixed', model: 'fixed-model' },
  })
  assert.equal(applied[1].automatic, true)
  assert.equal(applied[1].shortcut, 'disabled')
  assert.equal(applied[1].provider, 'fixed')
  assert.equal(applied[1].model, 'fixed-model')
  assert.equal(applied[1].timeoutMs, 4321)
  assert.doesNotThrow(() => registered.options.validate({
    automatic: true, shortcut: 'Mod+Shift+Space', route: null,
  }))
})

test('the plugin RPC reads and atomically replaces its Host settings section', async () => {
  let route
  let current = {
    automatic: true, shortcut: 'Mod+Shift+Space', route: null,
    projectContextEnabled: true, projectContextDepth: 3,
    maxProjectTreeFiles: 100, maxProjectContextBytes: 16384,
    maxOutputTokens: 2048, timeoutMs: 30000,
  }
  const base = resolveConfig({ timeoutMs: 7654 })
  const binding = {
    settings: { writable: true },
    scope: {
      get: () => current,
      async replace(next) { current = next },
    },
  }
  const ctx = {
    get(name) {
      if (name === 'webServer') {
        return { register(entry) { route = entry; return () => {} } }
      }
      return undefined
    },
  }
  host._testing.registerRoute(
    ctx,
    () => require('../src/core.cjs').applyUserSettings(base, current),
    () => binding,
  )

  async function call(method, args) {
    const request = new EventEmitter()
    request.method = 'POST'
    request.headers = { host: '127.0.0.1:3080' }
    request.destroy = () => {}
    const response = new EventEmitter()
    let text = ''
    response.writeHead = () => {}
    response.end = (value = '') => { text += value }
    const pending = route.handler(request, response)
    request.emit('data', Buffer.from(JSON.stringify({ method, args })))
    request.emit('end')
    await pending
    return JSON.parse(text)
  }

  assert.deepEqual(await call('settings', {}), {
    ok: true,
    settings: current,
    writable: true,
  })
  const next = {
    automatic: false,
    shortcut: 'disabled',
    route: { provider: 'fixed', model: 'fixed-model' },
    projectContextEnabled: false,
    projectContextDepth: 2,
    maxProjectTreeFiles: 80,
    maxProjectContextBytes: 8192,
    maxOutputTokens: 1024,
    timeoutMs: 15000,
  }
  assert.deepEqual(await call('update-settings', { settings: next }), {
    ok: true,
    settings: next,
    writable: true,
  })
  assert.deepEqual(current, next)
  const configuration = await call('configuration', {})
  assert.equal(configuration.automatic, false)
  assert.equal(configuration.shortcut, 'disabled')
  assert.deepEqual(configuration.route, next.route)
})

test('generate publishes stream deltas before the model finishes', async () => {
  let releaseFinish
  const finish = new Promise((resolve) => { releaseFinish = resolve })
  const { ctx } = contextWith(async function * () {
    yield { type: 'text-delta', text: `${candidateLines('A')}\n` }
    await finish
    yield { type: 'finish', reason: { kind: 'stop' } }
  })
  const generate = host._testing.createGenerateStream(ctx, resolveConfig({}))
  const seen = []
  let signalFirst
  const first = new Promise((resolve) => { signalFirst = resolve })
  const pending = generate({
    sessionId: 'session-1', draft: '', trigger: { kind: 'manual' }, currentCycleSkipped: [], localOutcomes: [],
  }, async (candidate) => {
    seen.push(candidate)
  }, undefined, async (text) => {
    seen.push(text)
    if (seen.length === 1) signalFirst()
  })

  await first
  assert.deepEqual(seen, [`${candidateLines('A')}\n`])
  releaseFinish()
  const result = await pending
  assert.equal(result.ok, true)
  assert.equal(result.candidate, 'A')
})

test('generate rejects stale sessions and accepts raw prompt output', async () => {
  const { ctx, requests } = contextWith(async function * () {
    yield { type: 'text-delta', text: 'not-json' }
  })
  const generate = host._testing.createGenerateHandler(ctx, resolveConfig({}))
  assert.deepEqual(await generate({
    sessionId: 'gone', draft: '', trigger: { kind: 'manual' }, currentCycleSkipped: [],
  }), {
    ok: false,
    code: 'SESSION_NOT_LIVE',
    message: 'This session is no longer active.',
  })
  const second = await generate({
    sessionId: 'session-1', draft: '', trigger: { kind: 'manual' }, currentCycleSkipped: [],
  })
  assert.equal(second.ok, true)
  assert.equal(second.candidate, 'not-json')
  assert.equal(requests.length, 1)
})

test('generate reports a locally enforced model timeout', async () => {
  const { ctx } = contextWith((options) => ({
    [Symbol.asyncIterator]() { return this },
    next() {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted by timeout')
          error.name = 'AbortError'
          reject(error)
        }, { once: true })
      })
    },
    return: async () => ({ done: true }),
  }))
  const generate = host._testing.createGenerateHandler(ctx, resolveConfig({ timeoutMs: 1 }))
  assert.deepEqual(await generate({
    sessionId: 'session-1', draft: '', trigger: { kind: 'manual' }, currentCycleSkipped: [],
  }), {
    ok: false,
    code: 'TIMEOUT',
    message: 'Prompt for Me timed out.',
  })
})

test('collectCandidate rejects tool calls and non-stop finishes', async () => {
  const controller = new AbortController()
  const config = resolveConfig({})
  await assert.rejects(() => host._testing.collectCandidate((async function * () {
    yield { type: 'tool-call' }
  })(), controller, config, [], async () => {}), /tool-call/)
  await assert.rejects(() => host._testing.collectCandidate((async function * () {
    yield { type: 'finish', reason: { kind: 'max-tokens' } }
  })(), controller, config, [], async () => {}), /max-tokens/)
})

test('collectCandidate blocks visually identical skipped suggestions', async () => {
  const controller = new AbortController()
  const config = resolveConfig({})
  await assert.rejects(() => host._testing.collectCandidate((async function * () {
    yield { type: 'text-delta', text: '{"candidate":"Ａ\u200b"}\n' }
  })(), controller, config, [' a '], async () => {}), /missing-candidate/)
})

test('sameOrigin accepts same-host and non-browser requests and rejects cross-site origins', () => {
  assert.equal(host._testing.sameOrigin({ headers: { host: '127.0.0.1:3080' } }), true)
  assert.equal(host._testing.sameOrigin({ headers: {
    host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080',
  } }), true)
  assert.equal(host._testing.sameOrigin({ headers: {
    host: '127.0.0.1:3080', origin: 'https://evil.example',
  } }), false)
})

test('readJson rejects malformed and oversized bodies', async () => {
  const malformed = new EventEmitter()
  malformed.headers = {}
  const malformedResult = host._testing.readJson(malformed)
  malformed.emit('data', Buffer.from('{'))
  malformed.emit('end')
  await assert.rejects(malformedResult, /invalid-json/)

  const oversized = new EventEmitter()
  oversized.headers = {}
  oversized.destroy = () => {}
  const oversizedResult = host._testing.readJson(oversized)
  oversized.emit('data', Buffer.alloc(256 * 1024 + 1))
  await assert.rejects(oversizedResult, /request-too-large/)
})
