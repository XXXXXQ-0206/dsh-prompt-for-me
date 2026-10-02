# Changelog

Notable changes to this project are documented here. This changelog starts with the latest tagged release; earlier changes are available in the Git history.

## [1.0.0] - 2026-10-03

### Added

- Editable optimization prompt with separate prompt and few-shot sections, per-section restore-default actions, and a combined restore action.
- Custom few-shot library for prompt/optimized-prompt pairs and broad task/instruction pairs, with enable, disable, edit, and delete controls.
- English and Simplified Chinese README files with a language switch.
- Contribution, security, and conduct policies, plus CodeQL and Dependabot configuration.

### Changed

- The default optimization template identifies as a DeepSeek AI coding assistant while keeping the recovered prompt structure intact. Template attribution is documented in the README.
- Optimization sends only the composer draft and the configured local prompt to the selected DSH model.
- The package contents are limited to the installable plugin and user documentation.

### Removed

- Removed the obsolete service bridge, its transport code, configuration, and development batch command.
- Removed the manual generation shortcut and its keybinding path.
- Disabled project-context collection and empty-draft prompt design; their implementation remains archived behind feature switches.

## [0.7.0] - 2026-09-08

### Added

- Mode-aware streamed prompt generation, input locking, interruption, and undo/redo support.
- Documentation for forking the project on GitHub.
