# Tracewell

Tracewell is an interactive tool that shows what happens inside a backend server when it handles one HTTP request. You pick a scenario, send a request, and step through or play back what the server does with it: body parsing, routing, auth, validation, the database queries with their plans and costs, and the response. Many scenarios contain a real backend bug that you can fix with a toggle and compare before and after. Everything runs in the browser: the Express-style server and the PostgreSQL database are simulated, and all timings are modelled, not measured.

## Run it locally

You need Node 20.18.1 (see `.nvmrc`) and pnpm.

```
pnpm install
pnpm dev
```

Then open the URL that is printed.

## Checks

```
pnpm test        # unit tests (Vitest)
pnpm test:e2e    # builds, then runs browser tests (Playwright)
pnpm lint
pnpm typecheck
pnpm build
```

The browser tests need Chromium once: `pnpm exec playwright install chromium`.

## More

- [docs/V1.md](docs/V1.md): what the product does and how it is built.
- [docs/PROGRESS.md](docs/PROGRESS.md): what each phase and step added, and why.
- [PLAN.md](PLAN.md): the build plan.
