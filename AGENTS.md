# AGENTS.md — JLC Loan Calculator

## Project

React 19 + Vite 8 + TypeScript 6 + oxlint application implementing Jamo Lending Corp
loan calculators (amortization schedules and short-term daily loans) plus an upcoming
Supabase-backed cash-flow sidebar.

## Workspace root

The active code lives in a git worktree:

```
C:\Users\ajdpe\projectA\jlcx\.kilo\worktrees\organized-fog
```

## Directory layout

```
.kilo/worktrees/organized-fog/
├── index.html
├── package.json
├── tsconfig.json          # project references: app + node
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── .oxlintrc.json
├── README.md
├── index.css               # theme variables + base styles
├── App.css                 # application styles (panels, forms, tables, navbar)
├── print.css               # print-specific styles
├── public/                 # amortization-template.xlsx, daily-loan-template.pdf, favicon.svg
└── src/
    ├── main.tsx            # React entry — StrictMode + BrowserRouter
    ├── App.tsx             # NavBar + Routes (/ and /daily-loan)
    ├── components/         # React components
    └── lib/                # Calculation + export logic
```

## Running tasks (from the worktree root)

| Task        | Command                              |
|-------------|--------------------------------------|
| Typecheck   | `npm run typecheck`                  |
| Lint        | `npm run lint`                       |
| Build       | `npm run build`                      |
| Dev server  | `npm run dev`                        |
| Preview     | `npm run preview`                    |

Run with `workdir: C:\Users\ajdpe\projectA\jlcx\.kilo\worktrees\organized-fog`.

## Coding conventions

- TypeScript with `verbatimModuleSyntax: true` — use `import type` for type-only imports
- `noUnusedLocals` and `noUnusedParameters` are enabled
- Components are function declarations; props are interfaces
- Currency is PHP (Philippine Peso), formatted via `Intl.NumberFormat("en-PH", ...)`
- Dates use ISO 8601 (`YYYY-MM-DD`); use helpers from `src/lib/calculator.ts`
- All amounts are rounded to 2 decimal places for currency display

## Tool Usage

The `write` tool requires **both** `content` and `filePath` parameters. Always provide both.
See the `write-tool` and `file-creation` skills for details.

## Available skills

- `write-tool` — Correct `write` tool usage (required: content + filePath)
- `file-creation` — File creation workflow and write-vs-edit decision
- `react-vite` — React 19 + Vite 8 + TypeScript patterns for this project
- `loan-calculator` — Domain formulas (amortization + daily loan)
- `code-reading` — How to explore and understand this codebase
- `kilo-short-reasoning` — Trim reasoning to minimize hallucinations (global)

## Kilo commands

Available slash commands (in `.kilo/commands/`):

- `/typecheck` — Run TypeScript type checking
- `/lint` — Run Oxlint
- `/build` — Run full production build
- `/dev` — Start Vite dev server
