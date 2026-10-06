# Baseline Planning Suite

A delivery-planning product composed of separate Shell, People, and Delivery applications. This branch establishes the repository foundation only: each app currently renders its name.

## Current architecture

```text
apps/
  shell/       # Product shell; future owner of navigation, currency, active user
  people/      # Future owner of employee information and rate history
  delivery/    # Future owner of projects, breakdown items, allocations, staffing
packages/
  domain/      # Empty TypeScript package for future pure business calculations
  contracts/   # Empty TypeScript package for intentionally published public APIs
```

npm workspaces keep one product in one repository while preserving explicit application boundaries. Each app has its own React entry point, Vite configuration, and independent build. Apps do not import one another. ESLint restricts cross-app imports and React/application imports in the shared packages. The domain package has no React dependency; contracts is intended for public types, events, and transport contracts, never shared application state. Neither shared package currently exports an API or is consumed by the apps.

## Development

Use Node.js 22.12+ and npm 10+.

```sh
npm install
npm run dev
npm run build
npm run test
npm run lint
npm run typecheck
npm run format
npm run format:check
```

`dev` runs all three apps concurrently: Shell at <http://localhost:5173>, People at <http://localhost:5174>, and Delivery at <http://localhost:5175>. Ports are fixed; a busy port causes startup to fail. Stop all servers with Ctrl+C.

`build` builds every workspace, including JavaScript and declarations for the two packages. `test` runs three minimal application-render smoke tests with Vitest in Node. `lint` checks the repository with ESLint; `typecheck` checks all workspaces and TypeScript tooling configurations using a shared strict base configuration. `format` writes Prettier formatting; `format:check` checks it without changes.

Apps can also run or build independently from the root:

```sh
npm run dev --workspace @baseline/shell
npm run build --workspace @baseline/shell
npm run build --workspace @baseline/people
npm run build --workspace @baseline/delivery
```

The root dependency override selects a patched `shell-quote` release for the development launcher.

Build output is written to each workspace's `dist/` directory and is ignored by Git. Commit the root `package-lock.json` to keep dependency resolution reproducible.

## Implementation status

This is Step 1 only. Domain entities, business calculations, Module Federation, runtime remote loading, persistence, People functionality, Delivery functionality, and Docker/container setup are intentionally not implemented. There is no global shared application store or cross-app communication.
