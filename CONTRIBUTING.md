# Contributing to JobApply

## Branch workflow

The repository maintains two branches:

- `main` contains the latest website features.
- `feature/windows-quick-capture` contains the separate desktop companion.

Keep website changes focused and run the checks below before merging to `main`.
Remove website feature branches after their work has been merged. Keep the desktop
companion branch separate from `main`.

Use focused commits with clear messages, such as `feat: add structured CV entries`,
`fix: wrap long experience titles`, or `docs: clarify local setup`.

## Local checks

Use Node.js 24 and install the locked dependencies with `npm ci`.
Follow README.md for the Supabase schema and local environment configuration.
Before submitting a change, run:

```sh
npm run build
npm run typecheck
npm test
```

CI runs these checks on pull requests and pushes to `main`.
The unit tests use mocked providers and do not require real AI credentials.

Keep `.env.local`, the `private/` folder, real CVs, and generated personal documents
out of Git. Use synthetic examples in tests, screenshots and issue reports.
Update setup documentation when environment variables or database requirements change.

## Review and releases

Describe behavior changes and validation in commit messages or pull requests.
Keep changes small enough to review and publish to `main` after checks pass.
Branch protection must be configured separately in GitHub settings; these
documents do not enforce it.
