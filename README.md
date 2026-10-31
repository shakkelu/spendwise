# Spendwise

**Cash-flow clarity for freelancers and solo founders.**

Spendwise is an open-source personal finance and cash-flow planning app designed to help freelancers and solo founders understand their recorded finances, upcoming commitments, and projected future balance.

Instead of focusing only on past spending, Spendwise aims to make irregular income, expected client payments, and upcoming expenses easier to plan around.

> **Development status:** The local MVP is implemented and undergoing release-readiness review. Production gates remain open; see Development below.

## MVP Features

- **Financial overview** — Understand recorded balances, monthly income, and expenses.
- **Transaction management** — Record and categorize income and expenses.
- **Expected income** — Track client payments that are due or anticipated.
- **Upcoming expenses** — Keep future financial commitments visible.
- **Cash-flow forecasting** — Explore projected balances using clearly stated assumptions.
- **Device-only or cloud use** — Start without registration; create an account to transfer device records, or explicitly replace them when signing into an existing account.
- **Monitor and appearance** — Recorded spending charts, bottom navigation, a sidebar, and System/Light/Dark themes.
- **Privacy-conscious design** — Device-only records stay in private app storage; cloud records are protected through backend authorization.

## Technology Stack

- React Native, Expo, and TypeScript
- Node.js, Express, and TypeScript
- MongoDB

## Project Structure

```text
apps/
  mobile/                # Expo mobile MVP and component tests
services/
  api/                   # Express API, domain, auth, and integration tests
docs/                    # Empty placeholder for future documentation
.github/                 # Empty placeholder for future workflows/templates
README.md                # Project overview
AGENTS.md                # Development instructions
PROJECT_PLAN.md          # Product plan
ARCHITECTURE.md          # Planned architecture and financial rules
ENGINEERING_STANDARD.md  # Engineering standards
package.json             # Private workspace and shared commands
package-lock.json        # Single dependency lockfile
compose.yaml             # Isolated local MongoDB instances
eslint.config.mjs        # Shared lint rules
.nvmrc                   # Exact Node.js pin
.prettierrc.json         # Shared formatting configuration
LICENSE                  # MIT license
.gitignore               # Ignore rules
```

## Project Documentation

- [Product Plan](PROJECT_PLAN.md)
- [System Architecture](ARCHITECTURE.md)
- [Engineering Standards](ENGINEERING_STANDARD.md)

## Development

The local MVP includes verified-email accounts, opaque sessions, transactions,
opening balances, expected income/upcoming expenses, and a 90-day forecast.
It is undergoing release-readiness review. Do not store real financial data or
expose this development setup publicly. Outstanding release gates are below.

Use Node **24.22.1**, npm **11.19.1**, fnm, and Docker Desktop. From the root:

```sh
fnm exec --using=24.22.1 node --version
fnm exec --using=24.22.1 npm --version
fnm exec --using=24.22.1 npm ci --engine-strict
# First setup only; refuses to overwrite existing local environment files:
fnm exec --using=24.22.1 npm run db:setup
fnm exec --using=24.22.1 npm run db:up
MAIL_MODE=local fnm exec --using=24.22.1 npm run dev:api
```

The API listens on `127.0.0.1:3000`. It validates PORT (1–65535), requires an
authenticated MongoDB connection before listening, and closes its pool on shutdown.
`GET /health` returns HTTP 200 and `{"status":"ok"}` for process liveness; it does
not continuously verify database readiness. `dev:api` compiles and starts; rerun
after edits. `build:api` compiles source/tests; `start:api` runs the built server
using process environment only, without loading a local environment file.

### Local credentials and email

Setup generates `.env.mongo`, `services/api/.env`, and `services/api/.env.test`
with separate random credentials and owner-only permissions. They are ignored.
Preserve existing files and volumes; do not rerun setup to change passwords.
`services/api/.env.example` documents configuration without real secrets.

`MAIL_MODE=local` is an explicit local-only email outbox. Register with synthetic
addresses ending in `.test`, `.invalid`, or `.example`. Read the verification code
from the private ignored `services/api/.tmp/mail/` JSON file for that address and
enter it in the app's Verify email screen. Recovery works the same way. Codes
expire in 30 minutes and are single-use. Codes are never returned by a public API
or logged. The outbox is a development aid, not external email-delivery verification.
Do not share it, commit it, or use it for real people. Failed delivery is logged
without a recipient or credential; restore delivery and request another code.
SMTP sends run asynchronously with two workers and a bounded in-memory backlog
of 64 messages, so external delivery timing/failure is not reflected in account
existence responses. This queue is not durable across process loss; request a new
code if needed, and monitor delivery before enabling public registration.

### Android development

Start an Android emulator or connect an authorized Android device via USB debugging:

```sh
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081
CI=1 EXPO_NO_TELEMETRY=1 fnm exec --using=24.22.1 npm exec --workspace=@spendwise/mobile -- expo start --go --android --localhost --port 8081
```

Use the Expo Go version recommended by Expo CLI for SDK 57. For interactive local
reloads omit `CI=1`. USB/adb reverse keeps the API bound to host loopback; no LAN
listener or public tunnel is required. Physical-device verification must be
reported separately from emulator verification.

The mobile development default is `http://127.0.0.1:3000`. An optional
`EXPO_PUBLIC_API_URL` supplies the API address; this is public configuration, never
a place for secrets. Release JavaScript refuses a missing/non-HTTPS API URL.
Android backup is disabled and unused storage/audio/overlay/vibration permissions
are blocked in Expo configuration. SecureStore holds only the session credential. Cloud financial state is held in memory,
not persisted as an offline cache, and cleared at logout. Device-only records are
persisted separately in private SQLite storage. Offline logout warns if
server revocation could not be confirmed.

### Device-only mode and navigation

Choose **Continue without an account** to use the app without the API or an internet
connection. Configure an opening balance, then record transactions and expected
payments. Records persist across app restarts in private SQLite storage. Removing
the app or clearing its data can erase them; there is no cloud recovery for local
mode. Android backup remains disabled. Do not promise a platform-independent
forensic erase or backup guarantee; iOS/physical-device behavior still needs review.

The fixed bottom tabs are Overview, Transactions, Upcoming and Monitor. The menu
button opens a sidebar with Forecast, Account, account connection/sign-out, and
Follow device/Light/Dark appearance settings. Follow device is the default.
Monitor shows six monthly income/expense columns and category spending bars with
text values; it excludes opening balances and expected payments. Select its month
in Overview. Forecast remains separately labeled as projected, never guaranteed.

From the sidebar, **Create account or sign in** offers two distinct paths:

- New account: create and verify the account, then sign in with those credentials.
  Local records transfer only to the new account associated with that registration.
  Transfer progress survives restart; retries cannot duplicate or overwrite cloud
  records. After an upload attempt, local editing is locked until the transfer is
  completed (or the owner confirms replacement by an existing cloud account).
- Existing account: explicitly confirm replacement before authentication. Local
  records are cleared only after authentication, successful cloud loading, and
  credential persistence. Cancellation or a failed load preserves local records.
  There is no automatic merging.

Cloud changes require a connection. Signing out clears access to the cloud account
and offers a fresh local session or another sign-in. A local transfer is never an
implicit background upload. No real email delivery is claimed by these flows.

### Database isolation and verification

| Environment | Host loopback port | Database/user    | Volume                            |
| ----------- | ------------------ | ---------------- | --------------------------------- |
| Development | 27117              | `spendwise_dev`  | `spendwise-local_mongo-dev-data`  |
| Tests       | 27118              | `spendwise_test` | `spendwise-local_mongo-test-data` |

Compose pins `mongo:8.0.34-noble` by multi-platform digest. Application users have
readWrite only on their database; administrator credentials remain in local Compose
configuration. Docker administrators can inspect that configuration. Test startup
is opt-in; integration tests require the dedicated local test address and credentials.
Tests retain synthetic fixtures. The archive/restore check uses MongoDB tools in
the test container, keeps its archive in memory and restores into a fresh uniquely
named collection. It never overwrites an existing collection. No automatic drop, collection deletion, or volume
cleanup is performed. Do not run volume prune or `down -v` as routine cleanup.

```sh
fnm exec --using=24.22.1 npm run verify
fnm exec --using=24.22.1 npm run db:test:up
fnm exec --using=24.22.1 npm run test:db
fnm exec --using=24.22.1 npm run build:api
fnm exec --using=24.22.1 npm run db:stop
```

`verify` runs ESLint, both strict TypeScript checks, API unit/HTTP tests, mobile
component tests, and formatting. Database integration tests are separate and fail
rather than skip if the test environment is unavailable. Node's test runner handles
API tests; Jest/Expo and React Native Testing Library handle mobile component tests.
Native calls in component tests are mocked; these tests are not device tests.

### API and financial behavior

Public auth endpoints: `/auth/register`, `/auth/request-verification`, `/auth/verify`,
`/auth/login`, `/auth/recover`, `/auth/reset` (POST). Registration and email requests
return a generic HTTP 202 response. Login intentionally issues a session token
only after verified credentials. Protected endpoints require an Authorization Bearer
header: GET/POST `/account`, POST `/account/operations`, `/auth/logout`, `/auth/password`.
Authenticated POST `/account/import` accepts a validated device ledger only with
the capability attached to its new-account registration. It atomically initializes
an empty ledger and stores a payload receipt for idempotent retries. An existing
ledger is never overwritten, even if the original import is retried after edits.
This route alone has an 8 MiB JSON limit after authentication/rate limiting; ordinary
requests retain the 16 KiB limit. The existing 5,000-record bound still applies.
No cookie authentication or browser CORS access is enabled. Authentication is limited
to 30 requests per source address and 10 per email identifier per 15-minute window;
private account requests are limited to 120 per minute per user. Authenticated logout
remains available when request counters are exhausted. Tune these limits against
the eventual deployment topology before release.

Account creation takes `currency`, `timezone`, `openingAmount` (decimal string), and
`openingDate`. Operations include `version`, `action`, and a UUID `id`; record fields
are `type`, decimal-string `amount`, `date`, `category`, and `description`.
Actions are transaction-create/update/delete, expectation-create/update/delete,
settings, and settle. Settlement additionally requires `transactionId` and its
actual `date`. Deleting a linked transaction requires `confirmRestore: true`.
Responses contain the new ledger; GET `/account?month=YYYY-MM` includes the summary
and forecast. Monetary response values are integer minor units. HTTP 400 represents
invalid input, 401 invalid/expired sessions, 404 missing owned records, 409 duplicate
or stale mutations, 413 oversized bodies, 429 abuse limits, and 503 temporary failures.
Errors have `{"error":"safe message"}`. Unknown private routes require authentication.

The account version rejects concurrent stale writes. A lost-response retry cannot
create another record with the same UUID. Refresh before resubmitting a conflict;
never generate another ID just to bypass it. Settlement and its linked transaction
are committed in one account-document update. The account has a visible 5,000-record
limit, with no silent truncation. See Architecture section 5 for date, currency,
opening-balance and overdue-item rules; all projections remain estimates.

### Release readiness and operational gates

A public deployment has not been authorized. Before accepting real users/data:

- Supply real SMTP settings and a verified sender, then independently verify delivery,
  verification, reset and abuse behavior. Production refuses the local outbox; SMTP
  requires verified TLS (465 or STARTTLS 587).
- Set `NODE_ENV=production`, a verified-TLS MongoDB URI, and a public HTTPS mobile API
  URL. The API remains loopback-bound behind a TLS reverse proxy on the same host;
  only loopback proxy forwarding is trusted. Review network topology before using
  this configuration. Do not expose local Compose or the development outbox.
- Select hosting, signing identity/package ownership, protected backup storage,
  retention/deletion policy, monitoring and recovery procedures. The local synthetic archive/restore round trip is verified, but restore from the
  selected protected production backup storage must also be tested before accepting
  real financial records. Existing volumes are not backups; production backup
  durability, encryption and recovery are not yet verified.
- Complete native release and physical-device verification, including SecureStore,
  logout/storage failure, keyboard/accessibility, network loss and recovery.
- Reassess [dependency advisories](ARCHITECTURE.md#dependency-advisories--release-readiness).
  Passing tests or a scoped audit do not security-clear the whole project.

Android native directories are ignored Expo-generated output. Generate them with
`expo prebuild --platform android --no-install --skip-dependency-update react,react-native`
through the pinned fnm/npm workspace command. The verified native build uses JDK 17, Gradle 9.3.1, Android SDK 36, Build Tools
35/36, NDK 27.1.12297006 and CMake 3.22.1. Install the Android tools and review/accept
their licenses yourself when setting up another machine; Gradle may fetch missing
components once those licenses are already accepted. Use `android:build` in the mobile
workspace for a local release-variant check. Do not publish artifacts using the
generated development signing key; production signing requires the owner's setup.
Never publish source maps or local outbox/configuration files with a release.

## Contributing

Contributions and constructive feedback are welcome. Contribution guidelines will be published as the project develops.

## License

Spendwise is released under the [MIT License](LICENSE).
