# dsh-prompt-for-me

**A prompt design companion for DeepSeek Harness.**

`dsh-prompt-for-me` sits beside the Harness composer and helps you turn a rough idea into a prompt that a coding agent can execute. It observes the current project as background, understands the intent behind your draft, and either optimizes that draft or designs the next worthwhile development step. The result is streamed directly into the composer, so you can review, undo, redo, and send it.

This is not an automatic ghost-text plugin. It never sends a message by itself.

## Why

Writing a good agent prompt is a design task, not a chat activity. The useful prompt usually needs to know:

- what problem you are solving;
- what the project already contains;
- which file, command, or module is the right next target;
- what behavior, output, edge cases, tests, or acceptance criteria are relevant;
- which constraints must stay untouched.

`dsh-prompt-for-me` gathers that background and performs the design work in the current composer, without turning the project into a summary or an assistant reply.

## Highlights

- **Two modes in one button**  
  A non-empty draft becomes **优化提示词**. An empty draft becomes **设计提示词** when a project is open.

- **Project-aware background**  
  Uses the session `cwd`, a bounded file tree, key manifests, and recent git status/diff as context. The background is for understanding, never the final output.

- **Prompt design, not prediction**  
  When the draft is empty, it designs the next profitable engineering step. It does not imitate the user or produce casual conversational text.

- **Honest optimization**  
  It preserves the original prompt instead of expanding it into unrelated work. It never asks the user for missing details inside the optimized result.

- **Uses your selected model**  
  It calls the same provider/model selected in the composer, including fallbacks to the session request header and fixed composition configuration.

- **Streamed, controlled editing**  
  Output streams into the draft, input is locked during request, a second click cancels and restores the original draft, and `Ctrl+Z` / `Ctrl+Y` walk through the generated history.

- **Privacy by default**  
  Only bounded text is sent. Project paths, manifests, session history, and interaction memory are capped; credentials are redacted before the model call.

## Usage

1. Open a DeepSeek Harness web session in your project workspace.
2. Click the icon between the context meter and the send button.
3. If the composer has text, the button optimizes it. If it is empty, the button designs the next prompt.
4. Review the streamed result, adjust it if needed, and send it like any other draft.

| Action | Result |
| --- | --- |
| Type a task, click **优化提示词** | The current prompt is optimized with project context. |
| Open a project, leave the draft empty, click **设计提示词** | The next high-value development prompt is designed. |
| Click again during generation | The request is aborted; the original draft is restored. |
| `Ctrl+Z` / `Ctrl+Y` | Step backward/forward through the generated prompt history. |
| Press Enter | Only the final visible draft is sent. |

## Install

Release tarballs contain the prebuilt host and client artifacts:

```sh
dsh plugin --profile web add https://github.com/XXXXXQ-0206/dsh-prompt-for-me/releases/download/v0.6.7/dsh-prompt-for-me-0.6.7.tgz
```

You can also install a pinned Git tag:

```sh
dsh plugin --profile web add github:XXXXXQ-0206/dsh-prompt-for-me#v0.6.7
```

Restart `dsh web` after installation. For Git installations, pnpm may ask you to allow the package `prepare` script; it only copies the host files and wraps the client factory.

Update or remove:

```sh
dsh plugin --profile web update dsh-prompt-for-me
dsh plugin --profile web remove dsh-prompt-for-me
```

## Settings

Open **Settings → Plugins → Configurable → Prompt for Me**.

- **Manual generation shortcut** defaults to `Mod+Shift+Space`.
- **Advanced settings → Suggestion model** follows the current session by default, or can pin one provider/model from the current Harness model directory.

The product owns context budgets, memory, model output limits, and timeouts; users are not asked to tune these internals.

## Architecture

The package is one dsh bundle with a host half and a browser half:

```text
src/index.cjs              Host entry: session events, project context, model routing, NDJSON RPC
src/core.cjs               Bounded prompt input, redaction, memory, and mode-aware system instructions
src/client-factory.cjs     Browser half: composer button, stream handling, lock/interrupt/undo
cordis.patch.yml           Bundle patch for the Web profile
lib/                       Generated host/client artifacts
```

The browser calls `/dsh-prompt-for-me/rpc` over NDJSON. The host collects project evidence, keeps every text field bounded, calls the currently selected `ctx.llm` route, and streams deltas plus a final candidate back to the composer.

## Development

Requires Node.js 22.19 or newer.

```sh
npm run check
```

This rebuilds static artifacts, runs the test suite, and verifies the package contents.

## License

MIT
