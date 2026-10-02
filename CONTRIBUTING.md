# Contributing

Thanks for helping improve DSH Prompt for Me. Contributions should keep the plugin focused on prompt composition and optimization for DeepSeek Harness.

## Before you start

- Check existing issues and pull requests for related work.
- For a substantial behavior or interface change, open an issue first so the scope can be discussed.
- Do not include credentials, personal data, private conversation content, or machine-specific files in a contribution.

## Development setup

Use Node.js 22.19 or newer and npm. From the repository root:

```sh
npm ci
npm run check
```

`npm run check` builds the package, runs the test suite, and checks the npm package contents with a dry run.

## Pull requests

- Branch from the latest `main` and keep each pull request focused.
- Explain the user-visible behavior and why the change is needed.
- Add or update tests for behavior changes and documentation for user-facing changes.
- Run `npm run check` before opening the pull request and include the result in its description.
- Keep generated files in sync when the build process produces tracked output.
- Use a clear commit subject, such as `fix: handle empty prompt input` or `docs: clarify installation`.

Maintainers review changes for correctness, compatibility, clarity, and package contents. A pull request may receive follow-up requests before it is merged.
