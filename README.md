# dsh-prompt-for-me

<p align="center">
  <a href="README.md"><kbd>English</kbd></a>
  &nbsp;|&nbsp;
  <a href="README.zh-CN.md"><kbd>中文</kbd></a>
</p>

A prompt optimizer for the DeepSeek Harness (DSH) composer. It turns a non-empty draft into a clearer, more actionable instruction and places the result back in the composer for you to review.

## Project overview

Prompt for Me runs inside a DSH Web session. It combines a locally bundled optimization prompt with the draft you enter, then calls the model route selected in DSH. The generated text streams into the composer; you decide whether to edit or send it.

The built-in prompt is a local template that identifies the assistant as a DeepSeek AI coding assistant. Prompt generation uses the model configured in DSH; the plugin does not call a separate prompt-optimization service.

## Features

- **Optimize the current draft.** Preserve the task in your own words while making it clearer and easier for a coding agent to act on.
- **Use your DSH model route.** By default, follow the provider and model selected for the current session. Settings can pin a provider/model available in DSH.
- **Edit the optimization prompt.** Customize the prompt rules and few-shot section independently. Each section has a restore-default action, with an option to restore both.
- **Add custom few-shot examples.** Configure either an original-prompt / optimized-prompt pair or a broad task hint / optimized task-instruction pair.
- **Keep control of the composer.** Generated text is written to the draft for review; the plugin does not submit it automatically.

## Current scope

Prompt optimization is the active generation feature. It requires text in the composer. Empty-draft prompt design and project-context collection are retained in the codebase but currently disabled. Optimization sends the draft and the configured local prompt to the selected DSH model; it does not collect project files or session history.

The request goes to the provider/model selected in DSH (or the optional custom route in Prompt Assistant settings). The provider's own data-handling terms apply to that request.

## Usage

1. Open a project session in DeepSeek Harness Web.
2. Enter the task you want to improve in the composer.
3. Click the Prompt Assistant button beside the composer actions.
4. Review and edit the generated draft, then send it when ready.

| Action | Result |
| --- | --- |
| Click Prompt Assistant with a non-empty draft | Streams an optimized instruction into the composer. |
| Click again while generation is running | Cancels the current request. |
| Press `Ctrl+Z` / `Ctrl+Y` in the composer | Moves backward or forward through generated draft history. |
| Use Enter after reviewing | Sends the visible composer draft through DSH. |

An empty draft does not start prompt generation while prompt design is disabled.

## Installation

Version 1.0.0 targets DeepSeek Harness `0.2.x` (`0.2.0-rc.1` or newer).

Install a versioned package archive from this repository's GitHub Releases page:

```sh
dsh plugin --profile web add https://github.com/XXXXXQ-0206/dsh-prompt-for-me/releases/download/v1.0.0/dsh-prompt-for-me-1.0.0.tgz
dsh web
```

For a fork or a later release, replace the owner, tag, and version with the matching values. A pinned Git source can also be installed with:

```sh
dsh plugin --profile web add github:XXXXXQ-0206/dsh-prompt-for-me#v1.0.0
```

Restart `dsh web` after installation or update.

```sh
dsh plugin --profile web update dsh-prompt-for-me
dsh plugin --profile web remove dsh-prompt-for-me
```

## Settings

Open **Settings → Prompt Assistant**.

- **Model route:** follow the current session by default, or choose a provider/model from the DSH catalog and pin it for the plugin.
- **Generation mode:** defaults to **Fastest (no reasoning)**; choose a deeper effort only when the rewrite benefits from more analysis.
- **Optimization prompt:** edit the default instruction and few-shot example separately. Restore either section individually or restore both defaults.
- **Custom few-shot examples:** add, edit, enable, disable, or remove examples. Each example can be an original prompt paired with an optimized prompt, or a broad task hint paired with an optimized task instruction. Up to 16 examples can be saved.
- **Advanced generation limits:** set the maximum output-token count and request timeout.

Project-context controls are hidden while project-context collection is disabled.

## Build instructions

Requirements: Node.js 22.19 or newer.

```sh
npm ci
npm run build
npm test
```

Run the complete local check before proposing a change:

```sh
npm run check
```

`npm run check` rebuilds the generated files, runs the test suite, and checks the package contents with `npm pack --dry-run`.

## Project structure

```text
src/index.cjs              DSH host integration, model routing, and RPC
src/core.cjs               Prompt assembly, settings, and bounded request data
src/optimizer-template.cjs Local default optimization prompt and few-shot section
src/client-factory.cjs     Composer button and settings interface
src/features.cjs           Feature switches for archived capabilities
cordis.patch.yml           DSH Web profile bundle configuration
scripts/build.mjs          Build host and client artifacts
lib/                       Generated package artifacts
```

## Contributing

Bug reports and focused pull requests are welcome. Before opening a pull request:

1. Describe the user-visible problem and the expected behavior.
2. Keep changes focused and include or update relevant tests.
3. Run `npm run check` and include the result in the pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md) for project policies.

## FAQ

**Why does an empty composer draft do nothing?**

Empty-draft prompt design is currently disabled. Enter a draft before using Prompt for Me.

**Does this plugin send project files to the model?**

The active optimization path sends the composer draft and the configured prompt. Project-context collection is currently disabled.

**Which model generates the result?**

The current DSH session's selected model by default. You can pin a DSH provider/model in Prompt for Me settings.

**Can I change the default prompt?**

Yes. The prompt rules, template few-shot section, and custom few-shot examples can be edited in settings. Restore-default controls are available for the two template sections.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

## Copyright and template attribution

The default prompt template is derived from Trae and adapted for this plugin. Its assistant identity and integration have been modified for this project. This attribution does not imply endorsement or affiliation.

## Disclaimer

This software is provided **“AS IS”**, without warranties or guarantees of any kind. To the fullest extent permitted by applicable law, the authors and contributors are not liable for any direct, indirect, incidental, special, exemplary, or consequential damages arising from the use of this software. You use it at your own risk and are responsible for complying with applicable laws and provider terms. Do not use this software for unlawful purposes.
