# Baseline Planning Suite

Baseline Planning Suite is a delivery-planning application for managing people, project allocations, capacity, and delivery costs.

The application consists of three independently built frontend applications: **Shell**, **People**, and **Delivery**.

People manages employees and effective-dated rates. Delivery provides project/WBS staffing, Cost planning, cross-project capacity warnings, and display reconciliation using canonical hours. Shell composes the remotes through runtime Module Federation configuration with independent failure isolation.

## Running the application

With Docker and Docker Compose installed and Docker running, execute from the repository root:

```bash
docker compose up
```

Open **http://localhost:8080**. Docker installs dependencies from the lockfile, builds all three microfrontends, and serves their production artifacts. **No host Node.js, npm, or Vite is required.** The first run needs network access to download the base images and npm packages.

| Application         | URL                             |
| ------------------- | ------------------------------- |
| Shell host          | http://localhost:8080/          |
| People standalone   | http://localhost:8080/people/   |
| Delivery standalone | http://localhost:8080/delivery/ |

After source changes, rebuild with `docker compose up --build`. Stop/remove containers with `docker compose down`. For a fresh build, run `docker compose build --no-cache` followed by `docker compose up`. Only port 8080 is exposed.

The single `web` service uses a multi-stage Dockerfile: Node 24 runs `npm ci` and independently builds Shell, People, and Delivery; the final Nginx image contains static artifacts and serving configuration, without the Node build environment. `.dockerignore` excludes host `node_modules`, `dist`, Git data, caches, and other local artifacts. People and Delivery use production public bases `/people/` and `/delivery/`; their same artifacts work standalone and hosted. Normal development builds keep `/` as their base.

Runtime files are bind-mounted read-only from **`deployment/runtime/`**, independently of the Shell bundle. `shell.json` serves at `/remote-config.json`:

```json
{
  "people": "/people/remoteEntry.js",
  "delivery": "/delivery/remoteEntry.js"
}
```

`delivery.json`, served at `/delivery/remote-config.json`, contains `{ "people": "/people/remoteEntry.js" }`, so standalone Delivery also consumes the authoritative People capability. `people.json`, served at `/people/remote-config.json`, contains `{ "delivery": "/delivery/remoteEntry.js" }` for standalone People capacity status. These are browser-visible same-origin paths, not Docker service names. Editing the files does not require rebuilding or restarting the container.

To demonstrate failure isolation, change only `people` in `deployment/runtime/shell.json` to `/people/missing-entry.js`, reload Shell, and visit People and Delivery. People shows its isolated fallback; Delivery keeps Hours/PM/Percent usable with Cost unavailable. Restore `/people/remoteEntry.js`, then use **Retry People** and Delivery's **Retry People data**. To test Delivery failure, set only `delivery` to `/delivery/missing-entry.js`; People remains usable. Restore `/delivery/remoteEntry.js` and use **Retry Delivery**. Existing healthy pages retain their mounted state; changing a URL does not unload an already loaded page, so begin each failure demonstration with a Shell reload.

Runtime JSON uses `Cache-Control: no-store`; entries and HTML revalidate, and hashed assets are cached immutably. Missing entries/chunks/CSS/JSON return actual 404 responses, while client-side page paths fall back to the appropriate app index. After a deployment that changes asset paths or leaves a failed transitive ESM import cached, a full browser reload may still be necessary.

Application data lives in **browser IndexedDB**, not Docker volumes. `docker compose down` or a container restart does not reset it. The shared origin allows hosted and standalone pages to see the same owner databases, `baseline-planning-people` and `baseline-planning-delivery`; URL paths do not partition IndexedDB. `localhost:8080` is a different origin from development ports, so existing development-port data is not automatically carried over. Rate invalidation remains document-scoped; separate tabs do not exchange `people.rateChanged` events.

**Verification:**

- **Automated checks:** The repository test suite, typecheck, lint, production build, formatting check, and `git diff --check` passed separately from deployment verification. Reproduce these using the commands under Quality Checks.
- **Docker/HTTP checks:** A fresh clone of commit `bf43bcf` built successfully without Docker build cache, host Node.js, or existing `node_modules`. Nginx returned HTTP 200 for Shell, standalone People/Delivery, runtime configuration files, and both `/people/remoteEntry.js` and `/delivery/remoteEntry.js` with JavaScript content types. A deliberately missing People entry returned a real 404 rather than Shell SPA HTML. This HTTP-only verification temporarily used port **18080** to avoid another local container; the normal production URL remains **http://localhost:8080**. The temporary container, image, and clone were removed afterward. No browser interaction was included in this clean-clone check.
- **Browser checks:** Separate verification on the normal Docker deployment at **http://localhost:8080** confirmed Shell, hosted and standalone People/Delivery, PlanningRates and Capacity capabilities, Shell active-user/display-currency propagation, and remote failure isolation/retry.

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
│   ├── contracts/
│   └── persistence/
│
├── package.json
├── tsconfig.base.json
└── README.md
```

### Applications

#### Shell

The application shell.

Owns navigation, runtime composition, active user, display currency, and independent remote loading/error/retry areas. It passes a typed runtime context to both public pages; current monetary amounts remain EUR.

#### People

Owns the people domain.

Provides the searchable employee register, employee details, weekly hours/roles, and effective-dated rate-history add/edit/delete. Changes persist through the People repository.

#### Delivery

Owns the delivery-planning domain.

Provides project selection, three-level WBS editing, leaf staffing allocations, and derived parent totals. Cross-project capacity warnings and effective-dated Cost views use canonical hours and the public People planning capability.

### Shared Packages

#### `packages/domain`

Contains framework-independent domain types and allocation calculations with an intentional public entry point at `src/index.ts`.

Working-day arithmetic, monthly capacity, PM/Percent conversions, effective-dated pricing and its Cost inverse, cross-project capacity aggregation, and largest-remainder display utilities are pure TypeScript. Delivery’s application layer derives WBS roll-ups and applies reconciliation through the hierarchy.

The domain package does not depend on React.

#### `packages/contracts`

Defines intentionally shared public cross-application contracts, exported through `@baseline/contracts`. It contains no application internals, duplicated domain model, or shared global state.

#### `packages/persistence`

Small native IndexedDB infrastructure shared by the owner repositories. It contains only typed store operations, transaction completion, schema upgrades, and seed initialization mechanics. Business store schemas, fixtures, and repository operations remain inside their owning apps; domain and contracts have no persistence dependency.

## Domain Model

The model lives in `packages/domain` as plain TypeScript, without React or browser dependencies:

- `Employee`: ID, name, weekly hours (`20 | 32 | 40`), and role.
- `RateRecord`: ID, employee ID, inclusive `validFrom`, and hourly cost in EUR. A rate remains effective until the next record; there is no `validTo` field.
- `Project`: ID, name, optional start/end dates, and optional status (`Planned | InProgress | Closed`). The official seed supplies dates but no status; the mapper does not invent one.
- `BreakdownItem`: ID, project ID, optional parent ID, type (`Deliverable | WorkPackage | Activity`), and name.
- `Allocation`: ID, project ID, breakdown item ID, employee ID, month, and canonical `hours`. `AllocationUnit` retains the input/display vocabulary (`PM | Hours | Percent | Cost`).

IDs and roles are strings. `DateOnly` and `YearMonth` describe date/month strings; calculation entry points validate calendar formats (`YYYY-MM-DD` and `YYYY-MM`).

## Allocation Calculations

Hours are the canonical stored allocation quantity. Explicit PM and Percent conversions operate at the domain boundary using monthly capacity (`weeklyHours × workingDays / 5`); Percent uses the 0–100 scale. Calculations retain floating-point precision without display rounding.

Working days are Monday–Friday, with no holiday calendar, calculated using UTC date-only operations. Pricing spreads monthly hours evenly across working days and respects inclusive `validFrom` dates, including mid-month rate changes. Unordered rate history is supported without input mutation; rates are scoped to the allocation's employee. Duplicate effective dates for the same employee are rejected as ambiguous.

Pricing returns `totalCostEUR`, `hoursPerWorkingDay`, `missingRateDays`, and `dailyPrices`. Unpriced days contribute €0 and carry a `null` hourly rate, distinct from a real €0/hour rate. Zero-hour blended rates return 0. Zero capacity converts to zero hours; converting positive hours to PM/Percent against zero capacity throws.

Reference: **0.50 PM in March 2026 for Adaeze Okafor (40h/week)** gives 22 working days, **176 monthly hours**, **88 allocation hours**, and **50% capacity**. With €80/hour from 2025-01-01 and €95/hour from 2026-03-12, 8 days at the old rate and 14 at the new rate yield **€7,880**, with a production-calculated blended rate of **€89.5455/hour** to four decimal places, verified by automated tests. This is a reference result, not an application UI field; the underlying value remains unrounded.

Core calculations have unit tests that run in Node without React or a browser. Delivery now derives WBS parent totals in its pure application layer. Cost → Hours editing and cross-project capacity detection are implemented. Display-only largest-remainder reconciliation preserves WBS totals at the required unit precision.

## Workspace Architecture

The repository uses **npm workspaces** to manage the three applications and shared packages from a single repository.

Keeping the applications in one workspace simplifies local development and shared tooling while preserving explicit application boundaries.

The applications do not import each other's internal source code. Shared functionality must cross a deliberate package or public contract boundary.

## Shared Communication Contracts

People owns employee information, weekly hours, roles, and authoritative rate history. Delivery owns planning, allocations, capacity, and pricing views; Shell owns runtime composition, navigation, active user, and display currency. Applications must not import one another's internal source code.

`packages/contracts` exports the framework-independent `PeopleRateChangedEvent` type:

```ts
import type { PeopleRateChangedEvent } from '@baseline/contracts';

const event: PeopleRateChangedEvent = {
  type: 'people.rateChanged',
  payload: { employeeId: 'employee-id' },
};
```

This invalidation contract carries only the employee ID, never a rate snapshot or Delivery-specific instructions. DOM-safe document event helpers publish and subscribe to `people.rateChanged`. People publishes after successful persistence; Delivery refetches the affected employee through `./PlanningRates` and recalculates derived Cost without changing canonical hours.

The contracts package has no React or application dependencies. The domain package remains independent of contracts and application integration concerns.

## Shell runtime context

Shell owns `ShellRuntimeContext` in React state: `displayCurrency` (`EUR | USD | GBP`) and a deterministic `activeUser` (`id`, `name`; Alex Morgan). The required `runtimeContext` prop is published through `@baseline/contracts` and passed to People and Delivery through their federated page APIs. Changing Shell’s currency selector updates mounted remotes without reload or lost selections; remotes consume props without copying Shell state. No authentication is implemented.

People and Delivery display the active user and selected currency preference. Rates and allocation costs remain EUR: no FX data or conversion rule is supplied, so selecting USD/GBP shows an explicit no-conversion notice rather than relabelling EUR amounts or changing canonical hours. Standalone `App` composition roots supply EUR and clearly named local users; the public page components require context and never invent hosted defaults. PlanningRates and rate-change events remain independent of this presentation context.

## Module Federation

Shell is the host; People and Delivery are independently built remotes using `@module-federation/vite`. People exposes `./PeoplePage` and the read-only `./PlanningRates` capability; Delivery exposes `./DeliveryPage` and the read-only `./Capacity` capability. The page exposures are default-exported React components reused by standalone and hosted applications. Shell resolves public modules at runtime and injects the People capability loader into Delivery; it never imports remote implementation source.

All three federation configurations share `react` and `react-dom` as singletons using the existing React version. The plugin also handles discovered React subpaths. Shell uses typed `loadRemote` calls returning a default `ComponentType`, with `React.lazy` and a minimal Suspense loading message. Automatic federated declaration generation is disabled; page module shapes are typed locally and the planning capability is defined in shared contracts without weakening strict TypeScript.

### Runtime remote locations

Shell fetches `remote-config.json` relative to its Vite base URL before the first remote load, then calls the federation runtime's `registerRemotes` with ESM (`module`) entries. The shipped local defaults are:

```json
{
  "people": "http://localhost:5174/remoteEntry.js",
  "delivery": "http://localhost:5175/remoteEntry.js"
}
```

For development, edit `apps/shell/public/remote-config.json`. In Compose production, Nginx serves the separately mounted `deployment/runtime/shell.json` at `/remote-config.json`; Shell’s JavaScript needs no rebuild. Each loader registers its requested remote, and retries refetch configuration and refresh that remote’s registration. Reload Shell to test changed URLs for already loaded healthy pages. Production uses same-origin paths; separate-origin hosting must allow access to entries and assets. Vite dev and preview servers enable CORS for local composition.

People displays the employee register and rate-history editor; Delivery displays project, WBS, and staffing planning. Document event transport and targeted rate-change synchronization are implemented; Shell remote areas now have independent loading, failure fallbacks, and retry.

## Persistence and Seed Data

IndexedDB is the current browser persistence mechanism. Domain-oriented repository interfaces hide IndexedDB details so later UI/orchestration can depend on repository operations, and a future server implementation can replace browser storage without changing domain calculations.

| Owner    | Database (schema version 1)  | Object stores and indexes                                                          |
| -------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| People   | `baseline-planning-people`   | `employees`; `rateRecords` indexed by `employeeId`; `_metadata`                    |
| Delivery | `baseline-planning-delivery` | `projects`; `breakdownItems` and `allocations` indexed by `projectId`; `_metadata` |

All stores use `id` as their key. Separate databases keep ownership and schema upgrades independent. People owns employee lookup and rate-history CRUD; Delivery owns project lookup, WBS-record upsert/delete, and canonical-hour allocation upsert/delete. Components do not manipulate IndexedDB. Repositories live under each app's `src/persistence`; none are exposed through federation. Record deletion is not an implicit cascading WBS operation.

People and Delivery initialize through page loading hooks. The supplied [`fixtures/baseline-seed.json`](fixtures/baseline-seed.json) is the authoritative bootstrap source. `fixtures/official-seed.ts` types and maps the external schema into domain values; React components and repositories never parse raw JSON. Owner fixture modules invoke separate pure mappers: People maps employees/rates; Delivery maps projects/WBS/allocations and reads only employee IDs/weekly schedules for bootstrap PM-to-hours conversion. Delivery persistence bootstrap does not map rate histories; the explicitly selected standalone People provider uses the People mapper. Seed-version access maps no collections, and horizon extraction reads only metadata. Each owner mapping returns fresh records.

The supplied dataset contains **60 employees, 150 rates, four projects, 90 WBS items, and 720 allocations**. All supplied IDs, names, roles, schedules, dates, relationships, and numeric quantities are preserved. Allocation amounts and hourly costs must be finite and non-negative at the external mapping boundary. `hourlyCost` maps to `hourlyCostEUR`. WBS types derive from parent depth (Deliverable → WorkPackage → Activity); null roots map to omitted internal parent IDs. Allocation `amount` is interpreted as PM and converted into full-precision canonical hours using the supplied employee schedule and allocation month. Project IDs derive from each allocation's WBS reference.

The grid horizon comes from JSON metadata: **Apr 2026–Mar 2027**, expanded once into twelve `YearMonth` values. Delivery exposes this through application bootstrap configuration and its initialization result; the hook passes the horizon to components without importing persistence fixtures. The supplied March 2026 allocation `alloc-001` for Adaeze Okafor (`emp-001`) is retained even though it lies outside that grid. It maps from 0.5 PM to 88 hours. Her supplied `rate-001` and `rate-002` are €80 from 2025-01-01 and €95 from 2026-03-12.

People owns mutable employee/rate state; Delivery owns mutable projects/WBS/allocations. Sharing bootstrap input does not share runtime ownership or persistence. Delivery consumes read-only People planning snapshots through a provider. Hosted snapshots come from the public People capability; explicit standalone bootstrap mode uses the official seed. Delivery never reads People storage or persists rate snapshots.

**Fixture migration:** schema version stays 1 because no stores/indexes change. The `_metadata` record `fixtures-initialized` now carries `version: official-1.0.0`. An existing marker without a version identifies the old generated bootstrap and triggers a **one-time replacement of all records in that owner database**, including development edits, with official fixtures. Clearing, inserting, and updating the marker commit atomically in one transaction; concurrent tabs serialize initialization. This deliberate development reset avoids retaining orphaned edits referencing obsolete IDs. It is not a production user-data migration.

After this migration, reloads preserve additions, edits, and deletions, including empty stores. A fresh empty database seeds once. Unmarked nonempty data is preserved and marked without backfilling. An unrecognized version is rejected and requires an explicit future migration; changing JSON metadata never silently resets a versioned database. No manual DevTools deletion is needed for the known legacy fixture marker.

Browser storage is origin-scoped: standalone apps on separate ports have separate storage from hosted apps executing at the Shell origin. Hosted authoritative snapshots and document-scoped `people.rateChanged` invalidation update derived Delivery costs. Standalone origins retain separate owner databases; events do not cross tabs or origins.

## People Register and Rate Editing

People works standalone and through Shell using the same `PeoplePage`. It lists employee name, role, and weekly hours. Case-insensitive name/role search filters the loaded register locally; selecting an employee shows their details and chronological rate history, with clear loading, error, and empty states.

The application service/hook owns repository calls and local React state; register, details, history, and editor components do not access IndexedDB. Users can add or edit an inclusive effective-from date and non-negative finite hourly EUR rate. Dates are validated as calendar dates without local-time conversion. An employee may have only one rate beginning on a given date; add/edit reject duplicates against freshly loaded history. Editing retains the record's employee ownership. New records use `crypto.randomUUID()` IDs, and deletion requires a native confirmation.

Successful mutations refresh the selected history. Persisted edits and deletions survive browser reload without reseeding. Hourly rates display as EUR with two decimals; stored values retain entered precision. There is no end-date field or currency conversion. Duplicate-date validation is application-level, not a cross-tab transactional uniqueness constraint; simultaneous independent tabs are not coordinated.

`people.rateChanged` is published after successful rate add/edit/delete persistence. Delivery subscribes once per mounted page and unsubscribes on teardown. Storage remains origin-scoped, so standalone People and People hosted at a different Shell origin have separate databases.

## Delivery Project Planning

Delivery works standalone and through Shell using the same `DeliveryPage`. Project selection loads that project's WBS and reads all allocations for global capacity, while presenting only the selected project's allocations. It resets the editing context; a request guard discards stale project responses, including delayed reads that complete after a newer selection. Components use a local hook/service/repository flow and never access IndexedDB.

The three-level WBS is **Deliverable → WorkPackage → Activity**. Items can be created, renamed, moved to valid parents of the same project, and deleted after confirmation. Type changes and invalid nesting are rejected. Adding or moving a child beneath an allocated item is refused; deleting an item with children or allocations is refused. Nothing is silently cascaded, moved, or orphaned.

Select a work item to see a horizontally scrolling **60-person × 12-month (Apr 2026–Mar 2027)** grid. The selected path is explicit. Actual leaves, including empty Deliverables/WorkPackages, permit allocation editing; parent selections show read-only descendant totals. Tree totals show derived hours across the horizon, while the parent grid derives per-person/month values. Parent totals are never persisted.

PM, Hours, and % capacity derive from canonical `Allocation.hours` using the domain working-day, capacity, and conversion functions. The supplied March reference remains **0.50 PM = 88 hours = 50%**, outside the visible horizon. Unit changes do not write data. Cells save on Enter or blur; Escape restores the latest authoritative value. Each input holds a local draft only while dirty; clean and successfully saved inputs display current application values without remounting. Cell identity uses work item, employee, and month, independent of units or allocation amounts. Values must be finite and non-negative; converted hours retain full precision. **Zero deletes the logical allocation record.**

New allocation IDs encode `(projectId, breakdownItemId, employeeId, month)` deterministically; existing seeded IDs are retained. Repeated edits update the same record. Duplicate existing logical records are rejected rather than silently merged. The current page serializes mutations and disables project, WBS, and unit selection while saving. A separate cell guard prevents Enter/blur from submitting twice, and changing the selected work item resets cell drafts and WBS editor state. The request guard also cancels responses after unmount; cross-tab conflict coordination is not implemented.

The `PlanningPeopleProvider` boundary supplies employee ID, name, weekly hours, and read-only effective-dated rate snapshots. Its integration adapter resolves the public People capability through Module Federation, without People source imports or storage access. Cost is derived and editable when rates cover the whole month; no rate or cost fields are added to Delivery persistence.

## Local Development

### Prerequisites

- Node.js >=22.12.0
- npm >=10

These prerequisites apply to local development; Docker startup requires neither on the host.

Install dependencies from the repository root:

```bash
npm ci
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

Root `dev`, `test`, and `typecheck` commands first compile the local domain, contracts, and persistence packages. If building an app directly on a fresh checkout, prepare those packages first:

```bash
npm run build:packages
```

Each app can then build independently:

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

Steps 8–13 are implemented using the supplied official bootstrap. Delivery supports project/WBS planning, all four allocation units, global capacity warnings, authoritative People rate consumption, and live hosted rate invalidation.

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
- Native IndexedDB infrastructure, owner repositories, and atomic one-time fixture seeding
- Official mapped People/Delivery fixtures with focused invariant tests
- People name/role search, employee details, chronological rate history, and validated persisted rate CRUD
- Focused People search, validation, and repository-orchestration tests
- Delivery project selection, safe WBS editing, Apr 2026–Mar 2027 leaf staffing grid, and canonical-hour unit conversions
- Derived parent totals and focused WBS/allocation application tests
- Public People planning capability, injectable providers, derived Cost display/editing, and targeted rate invalidation
- Root development and quality-check commands

- Display-only largest-remainder reconciliation through WBS roots and intermediate parents
- Independent remote loading/error boundaries and retry
- Docker/Compose production configuration with same-origin Nginx routing

## Authoritative planning rates and Cost (Step 10)

**Architecture decision:** Allocation ownership and cost presentation belong to Delivery, so Delivery computes cost locally with pure, independently testable domain pricing functions. People remains authoritative for schedules and effective-dated rates, supplied through the published federated PlanningRates capability. Shared typed contracts avoid source-level coupling: Delivery never reads People IndexedDB or repositories. Document-scoped rate-change invalidation refreshes open Delivery snapshots. Keeping retrieval errors separate from pricing results distinguishes unavailable authority from R1's legitimate marked historical zero.

People owns employees, weekly schedules, and rate histories. Delivery owns projects, WBS, and canonical-hour allocations. People now exposes the non-React `./PlanningRates` module alongside `./PeoplePage`: `listPlanningPeople()` and `getPlanningPerson(employeeId)` return narrow read-only snapshots. The shared contracts describe this public API, so consumers never share or import owner repositories, IndexedDB primitives, or hooks.

Shell uses its existing `remote-config.json` and runtime remote registration to load `people/PlanningRates`. It passes a capability loader to Delivery's provider adapter through the public Delivery page. Remote URLs remain runtime configuration; the same remote builds run standalone or hosted with React/react-dom singletons. Shell keeps visited pages mounted but hidden while switching tabs, preserving Delivery project/WBS/unit selection and its invalidation subscription without global application state.

Standalone Delivery reads `remote-config.json` relative to its application base. The development file `apps/delivery/public/remote-config.json` uses `{ "people": null }` to select labelled official-bootstrap names, schedules, and rates; Compose production uses `deployment/runtime/delivery.json` to resolve `/people/remoteEntry.js`. Configure `{ "people": "<People remoteEntry URL>" }` to use the public authoritative capability instead. A configured capability failure never falls back to bootstrap rates. The owner module executes at the consuming document's origin: configured standalone Delivery reads People-owned storage at the Delivery origin, not the separate standalone People origin. Hosted People and Delivery share the Shell document's origin and owner databases.

The contracts package provides framework-independent document `CustomEvent` publication/subscription for the existing `people.rateChanged` name. The payload is only `{ employeeId }`, an invalidation signal, never copied rate history. People publishes immediately after successful rate add/edit/delete persistence; validation or persistence failures do not publish. Delivery subscribes at its hook boundary with teardown cleanup, refetches only the affected employee through the provider, and replaces that read-only snapshot. Older targeted responses cannot overwrite newer ones. No browser reload or remote reload occurs. Allocation hours and global capacity utilization stay unchanged; derived costs and subsequent Cost input conversions use refreshed rates. Cost saves also fetch the affected employee afresh before conversion.

Monthly pricing reuses `priceAllocation`: spread hours evenly over Mon–Fri dates (no holidays), choose the latest rate with inclusive `validFrom` for each date, and sum unrounded daily costs. The next rate implicitly ends the previous one; any number of rate changes works. `costToHours` prices one hour with the same engine and divides entered EUR cost by that monthly blended rate, retaining full precision. Cost is never persisted. Parent cells remain read-only and sum individually priced descendant leaf allocations without double counting or parent records. EUR display uses two decimals and the presentation-only reconciliation described below.

A month earlier than the employee's first rate is a marked **€0.00**, contributing zero to parent totals. Cost editing is disabled because this zero has no unique inverse; use Hours/PM/Percent. Other months require complete rate coverage to display or edit Cost. Missing coverage (including only partly covered months) shows **Cost unavailable: no applicable rate.**, with no invented €0. Invalid or failed rate data also disables Cost and displays an explicit error; Hours/PM/% remain usable where an authoritative identity/schedule snapshot was previously loaded. When authority fails, previously loaded names/schedules are retained; initial configured-authority failure provides no fixture identities, schedules, or rates: People-derived staffing state is unavailable, while canonical WBS Hours remain visible. Later failures retain only last authoritative identities/schedules with a stale-data warning, clear rates, and make Cost unavailable. Hosted Retry People data can recover the capability. Standalone Delivery retains a successfully parsed configuration for the page session; after correcting a configured remote URL, reload the page. A real zero-rate month displays €0 but disables Cost editing because the inverse has no unique answer; use the other units. Event transport is document-scoped, not cross-tab/cross-origin synchronization. Shell page failures are isolated separately from this capability failure behavior.

The supplied Adaeze March reference is verified using the actual seed despite remaining outside the visible Apr 2026–Mar 2027 horizon: 40h/week, 22 weekdays, 176h capacity, 0.50 PM = 88h = 50%; 4h/day at €80 for eight weekdays and €95 from March 12 for fourteen weekdays gives **€7,880**, with blended rate **€89.5454545/h**. No fixture or horizon change is needed. The four-decimal reference rate is **€89.5455/hour**, asserted alongside the exact calculation.

Run the focused reference checks from the repository root:

```bash
npm test -- packages/domain/src/pricing.test.ts apps/people/src/persistence/fixtures.test.ts
```

## Global capacity (Step 9 behavior)

Capacity is `weeklyHours × Mon–Fri working days / 5`. Delivery reads all persisted allocations and groups canonical hours by employee/month across every project, providing a lookup independent of selected work-item totals. Utilization is `global hours / capacity × 100`, tested at full precision: exactly 100% is valid, 100.0001% warns. Valid edits save even above capacity; reductions and deletion clear resolved warnings. Rates never enter this calculation.

Visible editable and read-only parent cells show utilization warnings stating that all projects are included, with accessible descriptions and text rather than color alone. Warning status remains derived; optional persisted edit order identifies the latest contributing assignment across projects and reloads. People consumes Delivery's published capacity status to mark oversubscribed employees. Historical seed data has no reliable edit ordering, so it gets global warnings without invented latest-edit metadata. Milan Brandt's June `alloc-050` and `alloc-073` each contribute 0.59 PM, totalling 207.68 / 176 = **118%** across two projects.

## Display precision and reconciliation (Step 11)

Allocations persist full-precision canonical hours. Display precision is Hours **2 dp**, PM **2 dp**, Percent **1 dp**, and Cost **2 dp** (EUR). Clean numeric inputs use ungrouped fixed decimals; read-only totals and currency labels use English locale formatting. Dirty inputs retain exactly what the user enters. Merely focusing or submitting an unchanged cell never saves its rounded display.

Independently rounded siblings can disagree with the rounded parent. The pure `reconcileRoundedUnits` / `reconcileRoundedValues` utilities allocate lower integer display units, round the exact total, and distribute remaining units by largest fractional remainder, with original sibling order breaking ties (within floating-point tolerance). Each WBS root is rounded once. Its assigned units flow downward: intermediate parents distribute their inherited total among their children, so every displayed sibling group reconciles, even when an intermediate total differs from independent rounding. WBS sidebar Hours totals use the same hierarchy rule over the visible horizon. Grid reconciliation is per employee, displayed horizon, and unit across the whole project tree, conserving both month columns and row totals independently of which item is selected (see R3 below).

Cost leaves are individually priced using authoritative effective-dated histories before aggregation and reconciliation. Missing/failed Cost stays unavailable and propagates to ancestors; genuine zero rates remain zero with ambiguous Cost editing disabled. This is presentation only: reconciled values never enter persistence, conversions, pricing, allocation identity, or capacity. Capacity warnings still use exact utilization >100%, even when the displayed percentage rounds to 100.0%.

Reconciliation conserves **integer display units**; ordinary JavaScript decimal sums can still have binary floating-point residue. Precision is limited to 0–6 decimal places and safely representable integer display totals. Sibling order follows the existing WBS order; no random ordering or synthetic parent allocations are introduced.

## Shell remote failure isolation and recovery (Step 12)

Shell navigation remains outside each remote's `RemoteErrorBoundary`. Each visited page has its own boundary and Suspense loading state. People or Delivery loading/rendering failures show an accessible, named fallback without stack traces; the other page remains usable. Both may fail without replacing the Shell. Visited healthy pages remain mounted while hidden, preserving selections and drafts during navigation.

Runtime configuration is requested with `cache: no-store`. Each loader validates and registers only its own HTTP(S) URL; a missing/invalid sibling URL cannot block it. Network/status/JSON/shape failures reject into the page boundary and are not permanently cached. Entry and exposure failures likewise propagate; no hard-coded URL or fixture page substitutes for a broken configured application.

**Retry People / Retry Delivery** creates a fresh lazy component and boundary, fetches configuration again, and re-registers only that remote with Federation's `force` option when already registered. A `baseline-retry` query parameter on the entry URL avoids reuse of a browser-cached rejected entry import. Healthy sibling pages are not remounted. Hosted Delivery's **Retry People data** also makes a fresh authority load after capability failure. Standalone configuration recovery has the reload limitation described above. People page and `PlanningRates` exposures remain separate: failure of the capability leaves canonical WBS Hours visible and Cost unavailable; staffing rows require previously loaded authoritative People identities/schedules; it does not create a Shell Delivery fallback.

Boundaries cover React rendering and rejected lazy loads, not arbitrary event-handler or asynchronous application errors; those retain their existing application handling. Retry requires a compatible reachable service and an entry endpoint that accepts query parameters. A failed transitive ESM chunk can remain cached by its unchanged URL; a full browser reload may be needed after such a deployment failure. Request timeouts, cross-tab coordination, backend APIs, and automatic retry loops are not implemented. Production deployment configuration is described under Running the application.

## Cross-project capacity (R5)

Delivery exposes `./Capacity`: `listCapacityStatuses(people)` accepts People-owned employee IDs and weekly schedules and returns only employee IDs and oversubscribed months. Delivery reads all persisted allocations and reuses the same working-day capacity calculation as its planner, including months outside the visible horizon. Exactly 100% is within capacity; edits above 100% are saved and warned.

Shell injects the configured Delivery capability loader into People independently of page loading. Standalone People resolves `delivery` in its runtime configuration; production serves `/people/remote-config.json`. People marks oversubscribed employees in its searchable register, refetches after document-scoped `delivery.allocationsChanged` events carrying only `{ employeeId }`, and offers retry when capacity authority fails. It neither reads Delivery storage nor retains allocation replicas. This transport does not synchronize separate browser documents.

Allocation saves atomically stamp an optional `editSequence` and increment a counter in the existing IndexedDB metadata store. Transactions serialize the counter across connections/tabs; no clock or fabricated fixture timestamps are used. No IndexedDB version/store/index change or destructive migration is required. Existing/fixture records keep unknown edit history until edited. Delivery reconstructs the latest remaining positive allocation per employee/month after reload, naming its project and work item even if another project is open. Deletion removes the contribution; attribution falls back to the latest remaining edited contribution, or explicitly reports unknown historical order. Canonical hours, pricing, and rounding are unchanged.

## Staffing row totals (R3)

The staffing grid includes a sticky, read-only TOTAL column over the displayed horizon. Each month's Hours/PM/%/Cost is derived from canonical hours using that employee/month's capacity or effective-dated pricing; PM and % totals sum those converted monthly values, rather than applying one capacity denominator to a year's hours. Unit switching and display reconciliation never write allocations.

Each WBS root's exact horizon total is rounded once. Existing largest-remainder distribution assigns its monthly display units; a pure controlled-rounding extension distributes those integer margins through descendants. It prefers largest-remainder child row totals and stable remainder ordering, with a feasible floor/ceiling alternative where independent row/month choices conflict. Every numeric row TOTAL equals its displayed months, and each parent month/TOTAL equals its displayed children. Independent nearest rounding of every child is mathematically incompatible with those constraints in some cases; inherited assignments resolve that conflict without a rounding budget or stored adjustments.

Historical before-first-rate Cost remains marked zero and contributes zero. Any unavailable month makes the row TOTAL unavailable, while known months and available subtrees remain visible. Parent cells and all totals are read-only; existing selected-WBS navigation, leaf editing, and R5 warnings/assignment attribution remain intact.
