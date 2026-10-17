# Contributing to JobApply

## Branch workflow

`main` is the single maintained branch and contains the latest app version.
Keep changes focused and run the checks below before pushing to `main`.

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
