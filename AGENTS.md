# Project Instructions

## Project

Build an internal Kyron Course Draft Launcher for the Stevens CPE team.

## Technology

- Next.js App Router
- TypeScript
- Vercel
- Next.js Route Handlers
- No database for the initial MVP
- Use browser polling for asynchronous Kyron generation

## Engineering rules

- Keep Kyron and AI API keys server-side.
- Never expose credentials to the browser.
- Validate all external API responses.
- Use TypeScript strict mode.
- Keep components small and reusable.
- Add clear error and loading states.
- Do not use undocumented Kyron internal APIs in the MVP.
- Do not implement publishing or deletion without explicit user confirmation.

## Required reading

Before planning or implementing, read:

- `docs/MVP_SPEC.md`
- `docs/KYRON_API_NOTES.md`
- `docs/reference/openapi.yaml`

## Verification

Before completing a task, run:

- `npm run lint`
- `npm run typecheck`
