# Project Instructions

## Project

Build an internal Kyron Course Draft Launcher for the Stevens CPE team.

## Technology

- Next.js App Router
- TypeScript
- Vercel
- Next.js Route Handlers
- Neon PostgreSQL for launcher-created draft history and synchronization metadata
- Use browser polling for asynchronous Kyron generation

## Engineering rules

- Keep Kyron and AI API keys server-side.
- Never expose credentials to the browser.
- Validate all external API responses.
- Use TypeScript strict mode.
- Keep components small and reusable.
- Optimize for readability and reviewability: keep the main public workflow near the top of each file, place supporting helpers below it, and prefer small, clearly named functions or components over deep nesting or unnecessary abstractions.
- Add clear error and loading states.
- Do not use undocumented Kyron internal APIs in the MVP.
- Do not implement publishing or deletion without explicit user confirmation.

### Type placement

- Define a type in the file that uses it when it is not shared elsewhere.
- Put types shared by a server module's repository and service in that module's
  `types.ts` file.
- Put request and response types shared across the browser/server boundary in
  `types/api.ts`.
- Put UI-only view and interaction types in the relevant `features/...`
  module.

## Required reading

Before planning or implementing, read:

- `docs/MVP_SPEC.md`
- `docs/KYRON_API_NOTES.md`
- `docs/reference/openapi.yaml`

## Verification

Before completing a task, run:

- `npm run lint`
- `npm run typecheck`
