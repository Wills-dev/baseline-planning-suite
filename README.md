# Baseline Planning Suite

Baseline Planning Suite is a delivery-planning application for managing people, project allocations, capacity, and delivery costs.

The application is being developed as three independently built frontend applications: **Shell**, **People**, and **Delivery**.

This repository currently contains the workspace/tooling foundation and framework-independent domain types. Business functionality and micro-frontend integration will be introduced incrementally.

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

It will own application-level concerns such as navigation, the active user, and display currency. It will later host the People and Delivery applications at runtime.

#### People

Owns the people domain.

It will manage the employee register, employee details, weekly working hours, roles, and effective-dated cost-rate history.

#### Delivery

Owns the delivery-planning domain.

It will manage projects, work breakdown structures, staffing allocations, capacity, and delivery cost views.

### Shared Packages

#### `packages/domain`

Contains framework-independent domain types with an intentional public entry point at `src/index.ts`.

Business calculations such as working-day arithmetic, allocation conversions, effective-dated pricing, capacity calculations, roll-ups, and rounding will live here as pure TypeScript logic where appropriate.

The domain package does not depend on React.

#### `packages/contracts`

Reserved for intentionally shared public contracts between independently owned applications.

This package will contain only contracts that need to cross application boundaries. It will not contain application internals or shared global state.

## Domain Model

The model lives in `packages/domain` as plain TypeScript, without React or browser dependencies:

- `Employee`: ID, name, weekly hours (`20 | 32 | 40`), and role.
- `RateRecord`: ID, employee ID, inclusive `validFrom`, and hourly cost in EUR. A rate remains effective until the next record; there is no `validTo` field.
- `Project`: ID, name, and status (`Planned | InProgress | Closed`).
- `BreakdownItem`: ID, project ID, optional parent ID, type (`Deliverable | WorkPackage | Activity`), and name.
- `Allocation`: ID, project ID, breakdown item ID, employee ID, month, value, and unit (`PM | Hours | Percent | Cost`).

IDs and roles are strings. Dates use `YYYY-MM-DD` and months use `YYYY-MM` by convention; these formats are not validated by the types. The allocation model preserves the supplied vocabulary. Its canonical representation and boundary conversions remain undecided and unimplemented. No domain calculations or runtime validation are implemented.

## Workspace Architecture

The repository uses **npm workspaces** to manage the three applications and shared packages from a single repository.

Keeping the applications in one workspace simplifies local development and shared tooling while preserving explicit application boundaries.

The applications do not import each other's internal source code. Shared functionality must cross a deliberate package or public contract boundary.

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

The three development servers run concurrently on fixed ports.

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

Step 2 adds the domain model to the existing project foundation.

Implemented:

- npm workspace configuration
- Three independent React + TypeScript + Vite applications
- Strict TypeScript configuration
- ESLint and Prettier
- Vitest
- Shared `domain` and `contracts` package boundaries
- Framework-independent domain entities and finite-value union types
- Root development and quality-check commands

Not yet implemented:

- Domain calculations
- Employee management
- Project and work-breakdown management
- Staffing allocation functionality and canonical allocation conversions
- Capacity and pricing calculations
- Persistence
- Cross-application communication
- Module Federation
- Runtime remote loading
- Failure isolation
- Docker/container configuration

These capabilities will be introduced incrementally while maintaining clear ownership between Shell, People, and Delivery.
