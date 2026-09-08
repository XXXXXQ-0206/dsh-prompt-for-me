'use strict'

const { Buffer } = require('node:buffer')

const REDACTED = '[REDACTED_SECRET]'
const TRUNCATED = '\n...[truncated]...\n'
const OUTCOME_ACTIONS = new Set(['submitted', 'cycled'])
const OUTCOME_ORIGINS = new Set(['manual', 'suggestion-exact', 'suggestion-edited'])

const DEFAULT_CONFIG = Object.freeze({
  maxCandidateBytes: 4096,
  maxDraftBytes: 32768,
  maxCurrentCycleSkipped: 10,
  maxCurrentCycleSkippedBytes: 16384,
  maxCurrentTurns: 3,
  maxCurrentContextBytes: 16384,
  maxCurrentFeedbackBytes: 4096,
  maxPreferenceMemoryBytes: 8192,
  maxHistorySessions: 20,
  maxManualPrompts: 8,
  maxEditedSuggestions: 6,
  maxAcceptedExact: 6,
  maxRejectedSuggestions: 4,
  maxLocalOutcomes: 50,
  maxLocalOutcomesBytes: 131072,
  maxProjectContextBytes: 16384,
  maxProjectTreeFiles: 100,
  projectContextEnabled: true,
  projectContextDepth: 3,
  maxOutputTokens: 2048,
  timeoutMs: 30000,
  shortcut: 'Mod+Shift+Space',
  automatic: true,
})

const DEFAULT_USER_SETTINGS = Object.freeze({
  automatic: true,
  shortcut: 'Mod+Shift+Space',
  route: null,
  projectContextEnabled: true,
  projectContextDepth: 3,
  maxProjectTreeFiles: 100,
  maxProjectContextBytes: 16384,
  maxOutputTokens: 2048,
  timeoutMs: 30000,
})

function integer(name, value, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`prompt-for-me: ${name} must be a safe integer >= ${minimum}`)
  }
  return value
}

function resolveConfig(input) {
  const source = input && typeof input === 'object' ? input : {}
  const config = {
    ...DEFAULT_CONFIG,
    ...source,
  }
  integer('maxCandidateBytes', config.maxCandidateBytes, 1)
  integer('maxDraftBytes', config.maxDraftBytes, 1)
  integer('maxCurrentCycleSkipped', config.maxCurrentCycleSkipped, 1)
  integer('maxCurrentCycleSkippedBytes', config.maxCurrentCycleSkippedBytes, 256)
  integer('maxCurrentTurns', config.maxCurrentTurns, 1)
  integer('maxCurrentContextBytes', config.maxCurrentContextBytes, 256)
  integer('maxCurrentFeedbackBytes', config.maxCurrentFeedbackBytes, 256)
  integer('maxPreferenceMemoryBytes', config.maxPreferenceMemoryBytes, 256)
  integer('maxHistorySessions', config.maxHistorySessions, 0)
  integer('maxManualPrompts', config.maxManualPrompts, 0)
  integer('maxEditedSuggestions', config.maxEditedSuggestions, 0)
  integer('maxAcceptedExact', config.maxAcceptedExact, 0)
  integer('maxRejectedSuggestions', config.maxRejectedSuggestions, 0)
  integer('maxLocalOutcomes', config.maxLocalOutcomes, 0)
  integer('maxLocalOutcomesBytes', config.maxLocalOutcomesBytes, 256)
  integer('maxProjectContextBytes', config.maxProjectContextBytes, 256)
  integer('maxProjectTreeFiles', config.maxProjectTreeFiles, 1)
  integer('projectContextDepth', config.projectContextDepth, 0)
  integer('maxOutputTokens', config.maxOutputTokens, 1)
  integer('timeoutMs', config.timeoutMs, 1)
  if (config.projectContextDepth > 5) {
    throw new TypeError('prompt-for-me: projectContextDepth must be <= 5')
  }
  if (config.maxProjectTreeFiles > 500) {
    throw new TypeError('prompt-for-me: maxProjectTreeFiles must be <= 500')
  }
  if (config.maxProjectContextBytes > 131072) {
    throw new TypeError('prompt-for-me: maxProjectContextBytes must be <= 131072')
  }
  if (config.maxOutputTokens > 16384) {
    throw new TypeError('prompt-for-me: maxOutputTokens must be <= 16384')
  }
  if (config.timeoutMs > 300000) {
    throw new TypeError('prompt-for-me: timeoutMs must be <= 300000')
  }
  if (typeof config.shortcut !== 'string' || config.shortcut.trim() === '') {
    throw new TypeError('prompt-for-me: shortcut must be a non-empty string or "disabled"')
  }
  if (typeof config.automatic !== 'boolean') {
    throw new TypeError('prompt-for-me: automatic must be a boolean')
  }
  if (typeof config.projectContextEnabled !== 'boolean') {
    throw new TypeError('prompt-for-me: projectContextEnabled must be a boolean')
  }
  if ((config.provider === undefined) !== (config.model === undefined)) {
    throw new TypeError('prompt-for-me: provider and model must be configured together')
  }
  if (config.provider !== undefined
    && (typeof config.provider !== 'string' || config.provider === ''
      || typeof config.model !== 'string' || config.model === '')) {
    throw new TypeError('prompt-for-me: provider and model must be non-empty strings')
  }
  return Object.freeze(config)
}

function userSettingsBase(config) {
  return Object.freeze({
    automatic: config.automatic,
    shortcut: config.shortcut,
    route: config.provider === undefined
      ? null
      : Object.freeze({ provider: config.provider, model: config.model }),
    projectContextEnabled: config.projectContextEnabled,
    projectContextDepth: config.projectContextDepth,
    maxProjectTreeFiles: config.maxProjectTreeFiles,
    maxProjectContextBytes: config.maxProjectContextBytes,
    maxOutputTokens: config.maxOutputTokens,
    timeoutMs: config.timeoutMs,
  })
}

function resolveUserSettings(input, fallback = DEFAULT_USER_SETTINGS) {
  const source = input && typeof input === 'object' ? input : {}
  const settings = {
    automatic: source.automatic === undefined ? fallback.automatic : source.automatic,
    shortcut: source.shortcut === undefined ? fallback.shortcut : source.shortcut,
    route: source.route === undefined ? fallback.route : source.route,
    projectContextEnabled: source.projectContextEnabled === undefined
      ? fallback.projectContextEnabled
      : source.projectContextEnabled,
    projectContextDepth: source.projectContextDepth === undefined
      ? fallback.projectContextDepth
      : source.projectContextDepth,
    maxProjectTreeFiles: source.maxProjectTreeFiles === undefined
      ? fallback.maxProjectTreeFiles
      : source.maxProjectTreeFiles,
    maxProjectContextBytes: source.maxProjectContextBytes === undefined
      ? fallback.maxProjectContextBytes
      : source.maxProjectContextBytes,
    maxOutputTokens: source.maxOutputTokens === undefined
      ? fallback.maxOutputTokens
      : source.maxOutputTokens,
    timeoutMs: source.timeoutMs === undefined
      ? fallback.timeoutMs
      : source.timeoutMs,
  }
  if (typeof settings.automatic !== 'boolean') {
    throw new TypeError('prompt-for-me settings: automatic must be a boolean')
  }
  if (typeof settings.shortcut !== 'string' || settings.shortcut.trim() === '') {
    throw new TypeError('prompt-for-me settings: shortcut must be a non-empty string or "disabled"')
  }
  if (settings.route !== null
    && (!settings.route || typeof settings.route !== 'object'
      || typeof settings.route.provider !== 'string' || settings.route.provider.trim() === ''
      || typeof settings.route.model !== 'string' || settings.route.model.trim() === '')) {
    throw new TypeError('prompt-for-me settings: route must be null or a provider/model pair')
  }
  if (typeof settings.projectContextEnabled !== 'boolean') {
    throw new TypeError('prompt-for-me settings: projectContextEnabled must be a boolean')
  }
  for (const [name, value] of [
    ['projectContextDepth', settings.projectContextDepth],
    ['maxProjectTreeFiles', settings.maxProjectTreeFiles],
    ['maxProjectContextBytes', settings.maxProjectContextBytes],
    ['maxOutputTokens', settings.maxOutputTokens],
    ['timeoutMs', settings.timeoutMs],
  ]) {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`prompt-for-me settings: ${name} must be an integer`)
    }
  }
  return Object.freeze({
    automatic: settings.automatic,
    shortcut: settings.shortcut.trim(),
    route: settings.route === null
      ? null
      : Object.freeze({
          provider: settings.route.provider.trim(),
          model: settings.route.model.trim(),
        }),
    projectContextEnabled: settings.projectContextEnabled,
    projectContextDepth: settings.projectContextDepth,
    maxProjectTreeFiles: settings.maxProjectTreeFiles,
    maxProjectContextBytes: settings.maxProjectContextBytes,
    maxOutputTokens: settings.maxOutputTokens,
    timeoutMs: settings.timeoutMs,
  })
}

function applyUserSettings(config, input) {
  const settings = resolveUserSettings(input, userSettingsBase(config))
  const next = {
    ...config,
    automatic: settings.automatic,
    shortcut: settings.shortcut,
    projectContextEnabled: settings.projectContextEnabled,
    projectContextDepth: settings.projectContextDepth,
    maxProjectTreeFiles: settings.maxProjectTreeFiles,
    maxProjectContextBytes: settings.maxProjectContextBytes,
    maxOutputTokens: settings.maxOutputTokens,
    timeoutMs: settings.timeoutMs,
  }
  if (settings.route === null) {
    delete next.provider
    delete next.model
  } else {
    next.provider = settings.route.provider
    next.model = settings.route.model
  }
  return resolveConfig(next)
}

function utf8Bytes(value) {
  return Buffer.byteLength(value, 'utf8')
}

function jsonBytes(value) {
  return utf8Bytes(JSON.stringify(value))
}

function takePrefixWithinBytes(text, maxBytes) {
  let result = ''
  let bytes = 0
  for (const character of text) {
    const nextBytes = utf8Bytes(character)
    if (bytes + nextBytes > maxBytes) break
    result += character
    bytes += nextBytes
  }
  return result
}

function takeSuffixWithinBytes(text, maxBytes) {
  const characters = Array.from(text)
  let result = ''
  let bytes = 0
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const nextBytes = utf8Bytes(characters[index])
    if (bytes + nextBytes > maxBytes) break
    result = characters[index] + result
    bytes += nextBytes
  }
  return result
}

function truncateUtf8(value, maxBytes) {
  const text = String(value)
  if (maxBytes <= 0) return ''
  if (utf8Bytes(text) <= maxBytes) return text
  const markerBytes = utf8Bytes(TRUNCATED)
  if (maxBytes <= markerBytes) return takePrefixWithinBytes(text, maxBytes)
  const remaining = maxBytes - markerBytes
  const headBytes = Math.floor(remaining * 0.35)
  return takePrefixWithinBytes(text, headBytes)
    + TRUNCATED
    + takeSuffixWithinBytes(text, remaining - headBytes)
}

function redactSecrets(text) {
  return String(text)
    .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{12,}\b/g, REDACTED)
    .replace(/\b((?:api[_-]?key|token|password)\s*[:=]\s*)[^\s,;]+/gi, `$1${REDACTED}`)
    .replace(/\bBearer\s+[^\s,;]{12,}/gi, `Bearer ${REDACTED}`)
}

function messageText(data) {
  if (!data || !Array.isArray(data.content)) return ''
  return data.content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

function eventMessage(event) {
  if (!event || typeof event !== 'object') return undefined
  if (event.type === 'user/message') return event.data
  if (event.type === 'assistant/message') return event.data && event.data.message
  return undefined
}

function conversationMessages(events) {
  if (!Array.isArray(events)) return []
  const messages = []
  for (const event of events) {
    if (!event || (event.type !== 'user/message' && event.type !== 'assistant/message')) continue
    if (event.type === 'user/message'
      && (!event.data || !event.data.source || event.data.source.kind !== 'user')) continue
    const text = redactSecrets(messageText(eventMessage(event))).trim()
    if (text !== '') messages.push({ role: event.type === 'user/message' ? 'user' : 'assistant', text })
  }
  return messages
}

function directUserPrompts(events) {
  if (!Array.isArray(events)) return []
  const prompts = []
  for (const event of events) {
    if (!event || event.type !== 'user/message') continue
    if (!event.data || !event.data.source || event.data.source.kind !== 'user') continue
    const text = redactSecrets(messageText(event.data)).trim()
    if (text !== '') prompts.push({ text })
  }
  return prompts
}

function takeRecentWithinBudget(items, maxItems, maxBytes) {
  const selected = []
  for (let index = items.length - 1; index >= 0 && selected.length < maxItems; index -= 1) {
    const candidate = [items[index], ...selected]
    if (jsonBytes(candidate) <= maxBytes) selected.unshift(items[index])
  }
  return selected
}

function normalizeLocalOutcomes(value, config) {
  if (!Array.isArray(value) || config.maxLocalOutcomes === 0) return []
  const outcomes = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const action = typeof raw.action === 'string' ? raw.action : ''
    const origin = typeof raw.origin === 'string' ? raw.origin : ''
    if (!OUTCOME_ACTIONS.has(action) || !OUTCOME_ORIGINS.has(origin)) continue
    if ((origin === 'manual' && action !== 'submitted')
      || (origin === 'suggestion-edited' && typeof raw.finalText !== 'string')) continue
    const originalText = typeof raw.originalText === 'string'
      ? redactSecrets(raw.originalText).trim()
      : undefined
    const finalText = typeof raw.finalText === 'string'
      ? redactSecrets(raw.finalText).trim()
      : undefined
    if (origin !== 'manual' && (originalText === undefined || originalText === '')) continue
    if (action === 'submitted' && (finalText === undefined || finalText === '')) continue
    if (originalText !== undefined && utf8Bytes(originalText) > config.maxCandidateBytes) continue
    if (finalText !== undefined && utf8Bytes(finalText) > config.maxDraftBytes) continue
    outcomes.push({
      sessionId: typeof raw.sessionId === 'string' && raw.sessionId !== ''
        ? raw.sessionId.slice(0, 256)
        : null,
      action,
      origin,
      ...(originalText === undefined || originalText === '' ? {} : { originalText }),
      ...(finalText === undefined || finalText === '' ? {} : { finalText }),
      ...(Number.isFinite(raw.at) ? { at: raw.at } : {}),
    })
  }
  return takeRecentWithinBudget(
    outcomes,
    config.maxLocalOutcomes,
    config.maxLocalOutcomesBytes,
  )
}

function outcomeKey(sessionId, text) {
  return `${sessionId}\u0000${text}`
}

function submittedOriginIndex(outcomes) {
  const index = new Map()
  for (const outcome of outcomes) {
    if (outcome.sessionId === null || outcome.action !== 'submitted' || !outcome.finalText) continue
    index.set(outcomeKey(outcome.sessionId, outcome.finalText), outcome.origin)
  }
  return index
}

function rawConversationTurns(events, outcomes, sessionId) {
  const origins = submittedOriginIndex(outcomes)
  const turns = []
  let current
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || (event.type !== 'user/message' && event.type !== 'assistant/message')) continue
    if (event.type === 'user/message'
      && (!event.data || !event.data.source || event.data.source.kind !== 'user')) continue
    const text = redactSecrets(messageText(eventMessage(event))).trim()
    if (text === '') continue
    if (event.type === 'user/message') {
      const recordedOrigin = origins.get(outcomeKey(sessionId, text))
      current = {
        user: {
          text,
          origin: recordedOrigin || 'manual',
        },
      }
      turns.push(current)
    } else if (current) {
      current.assistant = {
        text: current.assistant ? `${current.assistant.text}\n\n${text}` : text,
      }
    }
  }
  return turns
}

function allocateTurnText(turn, maxBytes) {
  const userBytes = utf8Bytes(turn.user.text)
  const assistantBytes = turn.assistant ? utf8Bytes(turn.assistant.text) : 0
  let assistantBudget = Math.min(assistantBytes, Math.floor(maxBytes * 0.65))
  let userBudget = Math.min(userBytes, maxBytes - assistantBudget)
  let remaining = maxBytes - assistantBudget - userBudget
  const assistantRemainder = Math.min(assistantBytes - assistantBudget, remaining)
  assistantBudget += assistantRemainder
  remaining -= assistantRemainder
  userBudget += Math.min(userBytes - userBudget, remaining)
  return {
    user: {
      ...turn.user,
      text: truncateUtf8(turn.user.text, userBudget),
    },
    ...(turn.assistant ? {
      assistant: { text: truncateUtf8(turn.assistant.text, assistantBudget) },
    } : {}),
  }
}

function allocateRecentTurns(turns, textBudget) {
  const weights = turns.length === 1 ? [1] : turns.length === 2 ? [0.3, 0.7] : [0.15, 0.25, 0.6]
  const fullBytes = turns.map((turn) => (
    utf8Bytes(turn.user.text) + (turn.assistant ? utf8Bytes(turn.assistant.text) : 0)
  ))
  const budgets = weights.map((weight, index) => Math.min(fullBytes[index], Math.floor(textBudget * weight)))
  let remaining = textBudget - budgets.reduce((total, value) => total + value, 0)
  for (let index = turns.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const extra = Math.min(fullBytes[index] - budgets[index], remaining)
    budgets[index] += extra
    remaining -= extra
  }
  return turns.map((turn, index) => allocateTurnText(turn, budgets[index]))
}

function recentConversationTurns(events, outcomes, sessionId, config) {
  let turns = rawConversationTurns(events, outcomes, sessionId).slice(-config.maxCurrentTurns)
  while (turns.length > 0) {
    if (jsonBytes(turns) <= config.maxCurrentContextBytes) return turns
    const empty = turns.map((turn) => ({
      user: { ...turn.user, text: '' },
      ...(turn.assistant ? { assistant: { text: '' } } : {}),
    }))
    if (jsonBytes(empty) > config.maxCurrentContextBytes) {
      turns = turns.slice(1)
      continue
    }
    let low = 0
    let high = config.maxCurrentContextBytes
    let best = empty
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const candidate = allocateRecentTurns(turns, middle)
      if (jsonBytes(candidate) <= config.maxCurrentContextBytes) {
        best = candidate
        low = middle + 1
      } else {
        high = middle - 1
      }
    }
    return best
  }
  return []
}

function packSections(definitions, maxBytes) {
  const packed = Object.fromEntries(definitions.map(({ name }) => [name, []]))
  for (const { name, items, maxItems } of definitions) {
    const selected = []
    for (let index = items.length - 1; index >= 0 && selected.length < maxItems; index -= 1) {
      const candidate = [items[index], ...selected]
      if (jsonBytes({ ...packed, [name]: candidate }) <= maxBytes) selected.unshift(items[index])
    }
    packed[name] = selected
  }
  return packed
}

function normalizeCandidateIdentity(value) {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en-US')
}

function feedbackFor(outcomes, predicate, config, maxBytes, excludedRejections = new Set()) {
  const perTextBytes = Math.min(config.maxCandidateBytes, Math.max(128, Math.floor(maxBytes / 4)))
  const editedSuggestions = []
  const acceptedExact = []
  const rejectedSuggestions = []
  for (const outcome of outcomes) {
    if (!predicate(outcome)) continue
    if (outcome.origin === 'suggestion-edited' && outcome.action === 'submitted'
      && outcome.originalText && outcome.finalText) {
      editedSuggestions.push({
        original: truncateUtf8(outcome.originalText, perTextBytes),
        final: truncateUtf8(outcome.finalText, perTextBytes),
        action: outcome.action,
      })
    }
    if (outcome.origin === 'suggestion-exact' && outcome.action === 'submitted') {
      acceptedExact.push({ text: truncateUtf8(outcome.finalText || outcome.originalText, perTextBytes) })
    }
    if (outcome.action === 'cycled' && outcome.originalText
      && !excludedRejections.has(normalizeCandidateIdentity(outcome.originalText))) {
      rejectedSuggestions.push({ text: truncateUtf8(outcome.originalText, perTextBytes) })
    }
  }
  return packSections([
    { name: 'editedSuggestions', items: editedSuggestions, maxItems: config.maxEditedSuggestions },
    { name: 'acceptedExact', items: acceptedExact, maxItems: config.maxAcceptedExact },
    { name: 'rejectedSuggestions', items: rejectedSuggestions, maxItems: config.maxRejectedSuggestions },
  ], maxBytes)
}

function historicalSession(record) {
  if (!record || typeof record !== 'object' || typeof record.sessionId !== 'string'
    || !Array.isArray(record.events)) return undefined
  return record
}

function preferenceMemory(historicalRecords, outcomes, config) {
  const records = (Array.isArray(historicalRecords) ? historicalRecords : [])
    .map(historicalSession)
    .filter(Boolean)
  const sessionIds = new Set(records.map((record) => record.sessionId))
  const inScope = outcomes.filter((outcome) => (
    outcome.sessionId === null || sessionIds.has(outcome.sessionId)
  ))
  const origins = submittedOriginIndex(inScope)
  const perTextBytes = Math.min(
    config.maxCandidateBytes,
    Math.max(128, Math.floor(config.maxPreferenceMemoryBytes / 4)),
  )
  const manualPrompts = []
  for (const record of [...records].reverse()) {
    for (const prompt of directUserPrompts(record.events)) {
      const origin = origins.get(outcomeKey(record.sessionId, prompt.text))
      if (origin === undefined || origin === 'manual') {
        manualPrompts.push({ text: truncateUtf8(prompt.text, perTextBytes) })
      }
    }
  }
  for (const outcome of inScope) {
    if (outcome.sessionId === null && outcome.origin === 'manual'
      && outcome.action === 'submitted' && outcome.finalText) {
      manualPrompts.push({ text: truncateUtf8(outcome.finalText, perTextBytes) })
    }
  }
  const suggestionFeedback = feedbackFor(
    inScope,
    (outcome) => outcome.origin !== 'manual',
    config,
    config.maxPreferenceMemoryBytes,
  )
  const editedSubmitted = suggestionFeedback.editedSuggestions
    .map(({ original, final }) => ({ original, final }))
  return packSections([
    { name: 'manualPrompts', items: manualPrompts, maxItems: config.maxManualPrompts },
    { name: 'editedSuggestions', items: editedSubmitted, maxItems: config.maxEditedSuggestions },
    { name: 'acceptedExact', items: suggestionFeedback.acceptedExact, maxItems: config.maxAcceptedExact },
    {
      name: 'rejectedSuggestions',
      items: suggestionFeedback.rejectedSuggestions,
      maxItems: config.maxRejectedSuggestions,
    },
  ], config.maxPreferenceMemoryBytes)
}

function buildSuggestionInput(args, currentEvents, historicalRecords, config) {
  const draft = typeof args.draft === 'string' ? args.draft : ''
  const mode = args.mode === 'optimize' ? 'optimize' : 'predict'
  const project = args.project && typeof args.project === 'object'
    ? {
        cwd: typeof args.project.cwd === 'string' ? truncateUtf8(args.project.cwd, 1024) : '',
        tree: Array.isArray(args.project.tree)
          ? args.project.tree.slice(0, 120).map((value) => truncateUtf8(String(value), 256))
          : [],
        manifests: args.project.manifests && typeof args.project.manifests === 'object'
          ? Object.fromEntries(Object.entries(args.project.manifests)
              .slice(0, 12)
              .map(([name, value]) => [String(name).slice(0, 80), truncateUtf8(String(value), 4096)]))
          : {},
        git: args.project.git && typeof args.project.git === 'object'
          ? {
              status: truncateUtf8(String(args.project.git.status || ''), 2048),
              recent: truncateUtf8(String(args.project.git.recent || ''), 256),
              diff: truncateUtf8(String(args.project.git.diff || ''), 2048),
            }
          : {},
      }
    : null
  if (utf8Bytes(draft) > config.maxDraftBytes) throw new Error('draft-too-large')
  const currentCycleSkipped = Array.isArray(args.currentCycleSkipped)
    ? args.currentCycleSkipped.filter((value) => typeof value === 'string').map(redactSecrets)
    : []
  if (currentCycleSkipped.some((value) => utf8Bytes(value) > config.maxCandidateBytes)) {
    throw new Error('skipped-candidate-too-large')
  }
  const outcomes = normalizeLocalOutcomes(args.localOutcomes, config)
  const sessionId = typeof args.sessionId === 'string' ? args.sessionId : ''
  const packedCurrentCycleSkipped = takeRecentWithinBudget(
    currentCycleSkipped,
    config.maxCurrentCycleSkipped,
    config.maxCurrentCycleSkippedBytes,
  )
  const currentCycleSkippedIdentities = new Set(
    packedCurrentCycleSkipped.map(normalizeCandidateIdentity),
  )

  return Object.freeze({
    mode,
    originalPrompt: redactSecrets(draft),
    project,
    current: {
      draft: redactSecrets(draft),
      recentTurns: recentConversationTurns(currentEvents, outcomes, sessionId, config),
    },
    currentSessionFeedback: feedbackFor(
      outcomes,
      (outcome) => outcome.sessionId === sessionId,
      config,
      config.maxCurrentFeedbackBytes,
      currentCycleSkippedIdentities,
    ),
    userPreferenceMemory: preferenceMemory(historicalRecords, outcomes, config),
    currentCycleSkipped: packedCurrentCycleSkipped,
  })
}

function systemPrompt(mode = 'predict') {
  const shared = [
    'You are a prompt design partner for a senior software engineer who works with a coding agent.',
    'You do not write the implementation, answer the question, or narrate the repository. You design one prompt that an agent should execute.',
    'Context is background. Use it to understand the situation, not to echo it, imitate the user, or produce a casual prediction of their next message.',
    'The final output must be a self-contained, actionable prompt in the user\'s language. No JSON wrapper, Markdown fence, label, preface, or commentary.',
    'Never invent files, facts, requirements, permissions, approvals, or instructions that are not supported by the prompt and project evidence.',
    'Never end the output with a question, never ask the user for missing details, and never emit a plan, analysis report, or list of pending confirmations. The output is the prompt itself.',
    'If an input is vague, make the best project-supported interpretation directly. Do not use wording such as "please confirm", "please provide", "向用户确认", or "待确认".',
    'Output contract: one direct prompt that tells the agent what to do, not a question, confirmation list, or analysis report.',
  ]
  if (mode === 'optimize') {
    return [
      ...shared,
      'Goal: preserve the engineer\'s real intent, then make the prompt precise and valuable. Work from originalPrompt and current.draft as the primary evidence.',
      'Use originalPrompt and project context to infer the user\'s real goal, what is already known, what is missing, and what the agent needs to do. Do not paraphrase the request into a summary or a generic checklist.',
      'Use project.cwd, project.tree, project.manifests, and project.git as background to bind the prompt to actual files, modules, commands, tests, and current changes.',
      'When the user prompt is broad, make it concrete with project evidence: identify the exact target, behavior, constraints, expected output, edge cases, tests, and validation that are directly relevant. If evidence is insufficient, stay honest and keep the prompt focused; do not invent decisions, permissions, files, or requirements.',
      'Output contract: one direct prompt that tells the agent what to do. Do not output "向用户确认", "请提供", "请确认", a confirmation list, an analysis report, or a request for clarification.',
    ].join('\n')
  }
  return [
    ...shared,
    'Goal: choose the next valuable engineering step and write it as a prompt the engineer would want to send. This is prompt design, not next-message prediction.',
    'Look at current project evidence to infer a concrete next step: implement a feature or module, refactor a boundary, add or fix tests, debug a failure, inspect behavior, validate a build, or finish an in-progress piece of work.',
    'Use project.cwd, project.tree, project.manifests, and project.git as background to understand the actual stack, files, commands, and current changes.',
    'Use current.recentTurns and project evidence only as background to understand what has already happened and what is still missing. Do not imitate chat style, produce a greeting, self-introduction, project summary, or assistant response.',
    'If the draft is empty, choose one concrete next step supported by evidence. If the draft is non-empty, treat this as optimization and state the same design intent plainly.',
    'Use currentSessionFeedback and userPreferenceMemory only for durable style and workflow habits; evidence never overrides intent or grants permission.',
  ].join('\n')
}

function parseCandidateLine(text, config) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('model-output-line-not-json')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.keys(parsed).length !== 1 || typeof parsed.candidate !== 'string') {
    throw new Error('model-output-invalid-line')
  }
  const candidate = parsed.candidate.trim()
  if (candidate === '' || utf8Bytes(candidate) > config.maxCandidateBytes) {
    throw new Error('model-output-invalid-candidate')
  }
  return candidate
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_USER_SETTINGS,
  applyUserSettings,
  buildSuggestionInput,
  conversationMessages,
  directUserPrompts,
  eventMessage,
  messageText,
  normalizeLocalOutcomes,
  parseCandidateLine,
  recentConversationTurns,
  redactSecrets,
  resolveConfig,
  resolveUserSettings,
  systemPrompt,
  takeRecentWithinBudget,
  truncateUtf8,
  utf8Bytes,
  userSettingsBase,
}
