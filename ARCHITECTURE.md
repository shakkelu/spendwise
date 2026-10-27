# Spendwise — System Architecture

## 1. Architecture Overview

This document defines Spendwise’s system design and required behavior; it does not establish implementation completion or production readiness. See README.md and PROJECT_PLAN.md for verified status and limitations. The design consists of a mobile client, a backend API, and a MongoDB database.

The mobile app handles the user interface and user interactions. The backend handles authentication, authorization, business rules, financial calculations, and data validation. MongoDB stores application data.

## 2. System Components

### Mobile Application

Location: `apps/mobile/`

Technology: React Native, Expo, TypeScript.

Responsibilities:

- Display financial summaries, transactions, and cash-flow forecasts.
- Collect user input and perform basic client-side validation.
- Communicate with the backend over HTTPS.
- Display loading, success, and error states.
- Never contain database credentials or server-side secrets.

### Backend API

Location: `services/api/`

Technology: Node.js, Express, TypeScript.

Responsibilities:

- Authenticate users.
- Authorize access to user-owned resources.
- Validate requests and responses.
- Apply transaction and cash-flow business rules.
- Calculate financial summaries and forecasts.
- Communicate with MongoDB.
- Return consistent API responses and errors.

### Database

Technology: MongoDB.

Responsibilities:

- Store user accounts and authentication-related data.
- Store transactions, expected income, and upcoming expenses.
- Associate financial records with their owning user.
- Support reliable queries and updates.

## 3. Request Flow

1. A user interacts with the mobile app.
2. The app sends an HTTPS request to the backend API.
3. The backend authenticates the request where required.
4. The backend validates input and checks resource ownership.
5. The backend applies business rules and queries or updates MongoDB.
6. The backend returns a response.
7. The mobile app updates the interface.

The mobile app must not connect directly to MongoDB.

## 4. Data Ownership and Authorization

- Every private financial record must belong to a specific user.
- The backend must derive the authenticated user identity from a verified authentication context.
- The backend must never trust a client-supplied user ID as proof of ownership.
- Database queries and updates must enforce user ownership.
- Authentication and authorization must be tested independently.

## 5. Financial Data Rules

### Approved MVP Rules

- Use one currency per account. Currency conversion is outside the MVP.
- Represent monetary values as integer minor units using currency-specific precision; do not assume every currency has two decimal places.
- Record currency explicitly and keep account financial records consistent with that currency.
- Represent transaction amounts as positive values with an explicit income or expense type.
- The user provides an opening balance and its effective date.
- Recorded transactions must not be counted twice relative to the opening balance. Do not apply a transaction again if its effect is already included in that balance.
- Expected income affects the forecast on its scheduled date and remains clearly labeled as projected, not guaranteed funds.
- Keep recorded balances, expected income, upcoming expenses, and projected balances distinguishable.

### Financial implementation policy

Selected under the autonomous mandate and the owner's delegated decision on the
specific policy review. These rules must be explained in the interface.

- Supported currencies: USD/EUR/GBP/INR (2 decimal places), JPY (0), KWD (3). Currency is immutable after account setup; no conversion.
- Parse decimal strings exactly; reject excess precision instead of rounding. Store integer minor units. Individual amounts/opening balances are bounded to 10^12 minor units in magnitude. Transactions are positive; opening balances may be negative. Aggregate with integer arithmetic and reject unsafe output.
- Financial dates are Gregorian YYYY-MM-DD calendar dates from 1900 through 2199. The account chooses an IANA timezone, with UTC explicitly shown as the default. Authentication timestamps are UTC instants.
- Opening balance applies at the START of its date. Transactions on/after that date must not already be included in that opening balance. Reject earlier records and future-dated actual transactions. Opening date cannot be future. Opening edits recompute totals; moving it past existing records is rejected.
- Current balance includes actual transactions through today in the account timezone. Monthly totals include actual transactions only.
- Forecast covers 90 calendar days starting today, from the current recorded balance. Pending events apply on their scheduled date, including today. All expected income remains projected, never guaranteed.
- Overdue income is visibly excluded until explicitly rescheduled or received. Overdue expenses reduce the first forecast day as a conservative assumption. Never silently change scheduled dates.
- Settlement atomically creates one linked actual transaction and marks the expectation settled. User supplies receipt/settlement date within opening-date/today bounds. Settled/cancelled expectations are excluded from projections.
- Correct a settled item via its linked transaction. Deleting that transaction returns the expectation to pending with explicit confirmation. Settled expectations cannot be independently edited or removed until their linked transaction is undone.
- Client-generated IDs and account version checks reject duplicate creates and stale edits. Keep financial state in one bounded document for atomic settlement. Initial account limit is 5,000 total records; reject further creates visibly, never silently truncate.

## 6. Security Principles

- Use HTTPS for production API communication.
- Keep secrets out of source control and mobile application bundles.
- Store passwords using a suitable password-hashing algorithm; never store plaintext passwords.
- Validate and constrain all untrusted input on the backend.
- Apply appropriate authentication, authorization, rate limiting, and error handling.
- Avoid logging passwords, access tokens, or unnecessary financial details.
- Use synthetic financial data in public demonstrations.

### Approved authentication design

Spendwise owns email/password accounts and opaque server-managed sessions.
Passwords use Argon2id (19 MiB, two passes, one lane), with bounded concurrent
hashing. Accept 15–128 Unicode code points without trimming or normalization.
Email identifiers are trimmed/lowercased; case variants identify the same account.

Issue 32-byte random session credentials only to the intended client through the
HTTPS login flow. Store SHA-256 token hashes, user, creation/last-activity times,
absolute expiry and account authentication version. Accept only Bearer headers.
Validate every request; expire after 24 hours idle or seven days absolute. Database
TTL deletion is cleanup, not authorization. No refresh tokens initially.
Multiple device sessions are independent. Logout revokes one session; password
reset/change increments the account authentication version to invalidate all.
Mobile uses Expo SecureStore and clears user state on logout. Offline logout must
explain that remote revocation was not confirmed.

Require verified email before private access. Verification/recovery tokens are
random, hashed, single-use and valid for 30 minutes. Generic responses avoid
account enumeration. Production requires TLS SMTP configuration; development uses
an ignored private outbox with synthetic addresses, never a verification bypass.
Cap JSON bodies at 16 KiB and use database-backed IP/email authentication limits.
Never trust arbitrary forwarded headers; deployment proxy settings require review.
Never log raw credentials. Production email delivery, TLS, operational rate-limit
tuning and recovery verification remain release gates.

## 7. Testing Strategy

- Unit tests for financial calculations and validation.
- API tests for successful and unsuccessful requests.
- Authorization tests that attempt cross-user access.
- Authentication tests covering invalid credentials and expired or invalid sessions.
- Integration tests for database operations.
- Mobile verification for loading, empty, error, and success states.

## 8. Deployment Boundaries

- The mobile application is distributed separately from the backend.
- Production secrets belong in the deployment environment, not in the repository.
- Production database access must be restricted.
- Public source code does not mean production credentials or private user data should be public.

### Dependency advisories — release readiness

Reassessed 2026-10-27. The original audit had five high-severity package entries
from two underlying advisories. The current audit has three high-severity entries
from one remaining advisory; this is not a whole-project security clearance.

| Advisory                                                                             | Current state                                            | Evidence and release condition                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), node-forge | Remediated in the locked tree by `node-forge@1.4.1`      | Official [1.4.1 changelog](https://github.com/digitalbazaar/forge/blob/v1.4.1/CHANGELOG.md) identifies the signature-verification fix. The patch satisfies both Expo dependencies' existing `^1.3.3` ranges. No overrides, framework downgrade, or force fix was used. Repeat compatibility/export/signing checks with future updates. |
| [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), zod        | OPEN: `zod@3.25.76`, inherited by `@expo/cli` and `expo` | Current CLI requires the v3 range. The advisory's v4 fix is not a compatible patch. Reassess supported Expo remediation and CLI input reachability before release. No forced major override or downgrade is accepted.                                                                                                                  |

The Android export source map inspected during implementation did not list
node-forge or zod modules. It did list Expo's Metro require helper under the CLI
package; this does not imply inclusion of the vulnerable validation/signature
modules. The inspected arm64 release-variant APK also had no node-forge/Zod modules in its
generated 595-source JavaScript map, and contained no source maps. This evidence
applies to those artifacts, not Expo Go itself, development servers, future builds
or every possible code path. Repeat artifact review for the final production build. Restrict development tooling to trusted
local use, avoid exposing it publicly, and do not publish source maps.

The Zod finding remains a release gate requiring compatible upstream remediation
or a separately documented evidence-based owner risk decision. No such risk
acceptance is implied by passing application tests. API-scoped audit results are
reported separately from the complete workspace audit.

## 9. Other Open Decisions

- Before public release: Verify production email delivery/recovery, TLS/proxy configuration, abuse limits and the authentication policy in section 6.
- Before public deployment: Select hosting, a verified HTTPS API endpoint, signing identity/package ownership and network/proxy configuration. The established local runtime, workspaces, database and adb connectivity are documented in README.md.
- Before public operations: Tune abuse limits and monitoring, verify external email delivery/recovery and assess durable delivery/retry requirements. API error conventions, isolated tests and duplicate/stale-write handling are implemented and documented in README.md.
- Before accepting real financial data: Document mobile caching and logout cleanup, data retention/deletion, protected backups, and restore verification. Identify targeted ignore rules when credential, signing, or database-export tooling is selected.

Hosting, release automation, and automated mobile end-to-end tooling can be decided later.
