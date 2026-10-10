# Contributing to JobApply

## Branch workflow

- `main` contains the stable first version until a reviewed release is merged.
- `develop` is the integration branch for version two.
- Create short feature branches from `develop`, such as `feat/structured-cv` or
  `fix/pdf-date-alignment`, and open pull requests back into `develop`.
- Release version two with a pull request from `develop` into `main`.

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

CI runs these checks on pull requests and pushes to `main` and `develop`.
The unit tests use mocked providers and do not require real AI credentials.

Keep `.env.local`, the `private/` folder, real CVs, and generated personal documents
out of Git. Use synthetic examples in tests, screenshots and issue reports.
Update setup documentation when environment variables or database requirements change.

## Review and releases

Describe the behavior change and validation in each pull request. Keep features
small enough to review. Merge into `develop` after the checks pass; merge into
`main` only when the version is ready for release. Branch protection must be
configured separately in GitHub settings; these documents do not enforce it.
