# Kyron Course Draft Launcher

Internal Next.js application for the Stevens CPE team to prepare and launch
editable Kyron course drafts.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Replace the placeholder Kyron API key.
3. Install dependencies with `npm install`.
4. Start the application with `npm run dev`.

The initial project shell is a static page. Kyron API behavior will be added in
later implementation milestones.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```
