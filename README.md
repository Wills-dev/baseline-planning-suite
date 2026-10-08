# Baseline Planning Suite

Baseline Planning Suite is a delivery-planning application for managing people, project allocations, capacity, and delivery costs.

The application is being developed as three independently built frontend applications: **Shell**, **People**, and **Delivery**.

This repository currently contains the workspace/tooling foundation, framework-independent domain types, the core allocation calculation engine, a public rate-change contract, and minimal Module Federation composition. Business functionality and micro-frontend integration will be introduced incrementally.

## Repository Structure

```text
baseline-planning-suite/
├── apps/
│   ├── shell/
│   ├── people/
│   └── delivery/
│
├── packages/
│   ├── domain/
│   └── contracts/
│
├── package.json
├── tsconfig.base.json
└── README.md
```

### Applications

#### Shell

The application shell.

Hosts the People and Delivery pages at runtime and provides simple navigation between them. Active user and display currency remain future application-level concerns.

#### People

Owns the people domain.

It will manage the employee register, employee details, weekly working hours, roles, and effective-dated cost-rate history.

#### Delivery

Owns the delivery-planning domain.

It will manage projects, work breakdown structures, staffing allocations, capacity, and delivery cost views.

### Shared Packages

#### `packages/domain`

Contains framework-independent domain types and allocation calculations with an intentional public entry point at `src/index.ts`.

Working-day arithmetic, monthly capacity, PM/Percent conversions, and effective-dated allocation pricing are implemented as pure TypeScript. Roll-ups and reconciliation are not implemented.

The domain package does not depend on React.

#### `packages/contracts`

Defines intentionally shared public cross-application contracts, exported through `@baseline/contracts`. It contains no application internals, duplicated domain model, or shared global state.

## Domain Model

The model lives in `packages/domain` as plain TypeScript, without React or browser dependencies:

- `Employee`: ID, name, weekly hours (`20 | 32 | 40`), and role.
- `RateRecord`: ID, employee ID, inclusive `validFrom`, and hourly cost in EUR. A rate remains effective until the next record; there is no `validTo` field.
- `Project`: ID, name, and status (`Planned | InProgress | Closed`).
- `BreakdownItem`: ID, project ID, optional parent ID, type (`Deliverable | WorkPackage | Activity`), and name.
- `Allocation`: ID, project ID, breakdown item ID, employee ID, month, and canonical `hours`. `AllocationUnit` retains the input/display vocabulary (`PM | Hours | Percent | Cost`).

IDs and roles are strings. `DateOnly` and `YearMonth` describe date/month strings; calculation entry points validate calendar formats (`YYYY-MM-DD` and `YYYY-MM`).

## Allocation Calculations

Hours are the canonical stored allocation quantity. Explicit PM and Percent conversions operate at the domain boundary using monthly capacity (`weeklyHours × workingDays / 5`); Percent uses the 0–100 scale. Calculations retain floating-point precision without display rounding.

Working days are Monday–Friday, with no holiday calendar, calculated using UTC date-only operations. Pricing spreads monthly hours evenly across working days and respects inclusive `validFrom` dates, including mid-month rate changes. Unordered rate history is supported without input mutation; rates are scoped to the allocation's employee. Duplicate effective dates for the same employee are rejected as ambiguous.

Pricing returns `totalCostEUR`, `hoursPerWorkingDay`, `missingRateDays`, and `dailyPrices`. Unpriced days contribute €0 and carry a `null` hourly rate, distinct from a real €0/hour rate. Zero-hour blended rates return 0. Zero capacity converts to zero hours; converting positive hours to PM/Percent against zero capacity throws.

Reference: **0.50 PM in March 2026 for A. Okafor (40h/week)** gives 22 working days, **176 monthly hours**, **88 allocation hours**, and **50% capacity**. With €80/hour from 2025-01-01 and €95/hour from 2026-03-12, 8 days at the old rate and 14 at the new rate yield **€7,880**, with a blended rate displayed as **€89.5455/hour**. The underlying blended value remains unrounded.

Core calculations have unit tests that run in Node without React or a browser. Cost → Hours editing, capacity conflict detection, WBS roll-ups, and largest-remainder reconciliation are not implemented.

## Workspace Architecture

The repository uses **npm workspaces** to manage the three applications and shared packages from a single repository.

Keeping the applications in one workspace simplifies local development and shared tooling while preserving explicit application boundaries.

The applications do not import each other's internal source code. Shared functionality must cross a deliberate package or public contract boundary.

## Shared Communication Contracts

People owns employee information, weekly hours, roles, and authoritative rate history. Delivery owns planning, allocations, capacity, and pricing views; Shell owns navigation, the active user, and display currency. Applications must not import one another's internal source code.

`packages/contracts` exports the framework-independent `PeopleRateChangedEvent` type:

```ts
import type { PeopleRateChangedEvent } from '@baseline/contracts';

const event: PeopleRateChangedEvent = {
  type: 'people.rateChanged',
  payload: { employeeId: 'employee-id' },
};
```

This invalidation contract identifies the employee whose authoritative rate history changed. Consumers should obtain the latest authoritative rate information before recalculating affected views. It carries no state snapshot or Delivery-specific instructions. The contract defines only what crosses the boundary; transport, authoritative data retrieval, event publication/subscription, and live Delivery recalculation are not implemented.

The contracts package has no React or application dependencies. The domain package remains independent of contracts and application integration concerns.

## Module Federation

Shell is the host; People and Delivery are independently built remotes using `@module-federation/vite`. People exposes `./PeoplePage` as `people/PeoplePage`; Delivery exposes `./DeliveryPage` as `delivery/DeliveryPage`. Each is a default-exported React component, reused by the remote's standalone `App` and federated exposure. Shell consumes only those public modules, never remote application source.

All three federation configurations share `react` and `react-dom` as singletons using the existing React version. The plugin also handles discovered React subpaths. Shell uses typed `loadRemote` calls returning a default `ComponentType`, with `React.lazy` and a minimal Suspense loading message. Automatic federated declaration generation is disabled; the two explicit module shapes are maintained locally without weakening strict TypeScript.

### Runtime remote locations

Shell fetches `remote-config.json` relative to its Vite base URL before the first remote load, then calls the federation runtime's `registerRemotes` with ESM (`module`) entries. The shipped local defaults are:

```json
{
  "people": "http://localhost:5174/remoteEntry.js",
  "delivery": "http://localhost:5175/remoteEntry.js"
}
```

For development, edit `apps/shell/public/remote-config.json`. At deployment, provide or replace `apps/shell/dist/remote-config.json` with the deployed remote entry URLs; Shell's JavaScript needs no rebuild. The server may serve this file from runtime/container configuration, but no container setup exists yet. URLs are registered once per page session; reload Shell after changing them. Remote hosting must serve the entry and its assets with appropriate cross-origin access. Vite dev and preview servers enable CORS for local composition.

The pages currently display only their application names. Event transport, rate-change synchronization, persistence, and dedicated remote failure isolation remain unimplemented.

## Getting Started

### Prerequisites

- Node.js
- npm

Install dependencies from the repository root:

```bash
npm install
```

### Development

Start all three applications:

```bash
npm run dev
```

The applications are available at:

| Application | URL                     |
| ----------- | ----------------------- |
| Shell       | `http://localhost:5173` |
| People      | `http://localhost:5174` |
| Delivery    | `http://localhost:5175` |

The three development servers run concurrently on fixed ports. Stop them with Ctrl+C; occupied ports cause startup to fail.

Verify composition after `npm run dev`:

1. Open <http://localhost:5174> to see People standalone.
2. Open <http://localhost:5175> to see Delivery standalone.
3. Open <http://localhost:5173> and click **People** to load PeoplePage inside Shell.
4. Click **Delivery** to load DeliveryPage inside Shell.

Each app can build independently:

```bash
npm run build --workspace @baseline/shell
npm run build --workspace @baseline/people
npm run build --workspace @baseline/delivery
```

After `npm run build`, serve the production outputs in three separate terminals to check the same URLs:

```bash
npm run preview --workspace @baseline/shell
npm run preview --workspace @baseline/people
npm run preview --workspace @baseline/delivery
```

Preview uses the same fixed ports as development, so stop dev servers first. Each application produces its own `dist/` output; remotes include `remoteEntry.js`.

## Quality Checks

Run the test suite:

```bash
npm run test
```

Run TypeScript validation:

```bash
npm run typecheck
```

Run linting:

```bash
npm run lint
```

Check formatting:

```bash
npm run format:check
```

Create production builds:

```bash
npm run build
```

## Current Status

Step 5 adds minimal Module Federation host/remote composition to the existing foundation, domain engine, and shared contracts.

Implemented:

- npm workspace configuration
- Three independent React + TypeScript + Vite applications
- Strict TypeScript configuration
- ESLint and Prettier
- Vitest
- Shared `domain` and `contracts` package boundaries
- Framework-independent domain entities and finite-value union types
- UTC working days, monthly capacity, and PM/Percent ↔ Hours conversions
- Effective-dated pricing, missing-rate reporting, and blended hourly rates
- Domain calculation unit tests
- Public `people.rateChanged` invalidation contract
- Shell federation host and independently built People/Delivery remotes
- Standalone and hosted public pages, shared React singletons, and runtime remote configuration
- Root development and quality-check commands

Not yet implemented:

- Employee management
- Project and work-breakdown management
- Staffing allocation UI and Cost → Hours editing
- Capacity conflict detection, WBS roll-ups, and largest-remainder reconciliation
- Persistence
- Cross-application event transport, authoritative data retrieval, and live recalculation
- Failure isolation
- Docker/container configuration

These capabilities will be introduced incrementally while maintaining clear ownership between Shell, People, and Delivery.
