# Spendwise — Product Plan

## 1. Product Overview

Spendwise is an open-source personal finance and cash-flow planning app designed for freelancers and solo founders.

Its primary purpose is to help users understand not only where their money has gone, but also how much money they may have available in the future.

## 2. Problem Statement

Freelancers and solo founders often deal with irregular income, delayed client payments, and recurring expenses. A conventional expense tracker may show past transactions without making upcoming cash shortages obvious.

Spendwise aims to make actual finances and projected cash flow easy to understand.

## 3. Target Users

- Freelancers with irregular client income
- Independent developers and consultants
- Solo founders managing personal or business-related cash flow

## 4. Core MVP Features

### Financial Overview

- Display the current recorded balance.
- Summarize income and expenses for the selected month.
- Show upcoming financial commitments.
- Clearly distinguish recorded figures from estimates.
- Accept a user-provided opening balance and effective date; avoid counting recorded transactions already reflected in that balance.

### Transaction Management

- Add, edit, and delete transactions.
- Categorize income and expenses.
- Record transaction dates, positive amounts, an explicit income/expense type, and descriptions.

### Expected Income and Upcoming Expenses

- Record expected client payments.
- Track expected payment dates and payment status.
- Record upcoming expenses and their due dates.
- Allow users to distinguish confirmed amounts from uncertain expectations.

### Cash-Flow Forecast

- Project the balance over a future period.
- Include the starting balance, expected income, and upcoming expenses.
- Clearly label forecast figures as estimates, not guaranteed outcomes.
- Make the assumptions behind projected balances understandable.
- Apply expected income on its scheduled date while keeping it labeled as projected, not guaranteed.

### User Accounts and Data Security

- Support device-only use without registration and optional individual cloud accounts.
- Transfer local records only during new-account creation; existing-account sign-in requires confirmation before replacing device records.
- Provide bottom navigation, a slide-out sidebar, System/Light/Dark themes, and recorded-spending charts in Monitor.
- Enforce authorization on the backend for every user-owned resource.
- Validate incoming data on the server.
- Prevent users from accessing another user's financial records.

MVP financial records use one currency per account, with no currency conversion. Monetary values use integer minor units with currency-specific precision. See `ARCHITECTURE.md`, section 5 (“Financial Data Rules”), for approved rules and the documented implementation policy.

## 5. Out of Scope for the MVP

- Bank account integrations
- AI financial advice
- Investment management
- Complex accounting and tax filing
- Push notifications
- Subscription billing
- A separate web dashboard

These may be considered in future versions.

## 6. Technology Stack

- Mobile: React Native, Expo, and TypeScript
- Backend: Node.js, Express, and TypeScript
- Database: MongoDB
- Source control: Git and GitHub

## 7. Product Principles

- Privacy and security come first.
- Keep the interface clear, calm, and professional.
- Make financial information understandable without accounting expertise.
- Separate actual values from estimates.
- Never present expected income as guaranteed money.
- Prefer maintainable, tested code over unnecessary complexity.
- Use fictional data for screenshots and public demonstrations.

## 8. Initial Release Goals

- Deliver a functional Android MVP.
- Publish the source code in a public GitHub repository.
- Provide an installable Android APK through GitHub Releases.
- Document setup, architecture, testing, and security practices.
- Consider Google Play distribution after the MVP is stable.

## 9. Delivery progress and verification

Implemented locally: workspace/mobile/API foundations, isolated authenticated
MongoDB, verified-email/password accounts, opaque sessions and recovery, ownership
checks, transaction/category management, opening balances, expected income and
upcoming expenses, atomic settlement/undo, current/monthly summaries and a 90-day
forecast. The mobile app integrates these flows with secure credential storage,
loading/error/empty states and explicit projection assumptions.

Verification on 2026-10-27 includes strict types, shared ESLint, API/domain tests,
real isolated MongoDB authentication/ownership/concurrency tests, mobile component
and session tests, Expo compatibility and Android export. Local checks cover 13
API/domain cases, 7 mobile component/session cases and 7 database/startup/email/restore
integration cases. The synthetic archive/restore check uses a fresh collection and
performs no destructive cleanup. Android emulator testing
verified opening balance 100.00, actual expense 10.25, expected income 25.00,
projection 114.75, settlement to recorded 114.75 without double counting, and
session persistence across restart. See README for runnable checks.

A local arm64 Android release variant compiled successfully with Gradle 9.3.1
and the installed JDK 17. The wrapper download initially timed out; an official
checksum-verified Gradle download resolved it. The artifact uses development
signing and a non-live HTTPS example endpoint, so it is not a distribution-ready
release. The hardened artifact disables backups and unused permissions. Artifact checks
verified its signature, absence of packaged source maps/database credentials,
and absence of node-forge/Zod sources in its generated JavaScript module map.
No physical-device test is claimed.

Release gates remain: real email delivery/recovery verification, production TLS,
hosting, signing identity/package ownership, protected backups and tested restore,
retention/deletion decisions, physical-device verification, and disposition of the
remaining Zod advisory. Forge was updated through its supported range to 1.4.1.
The application is not declared production-ready or security-cleared. No public
release, deployment, commit, staging or push is authorized by this progress record.

### Navigation and device-only upgrade

Owner-approved addition: device-only SQLite records, shared financial rules,
new-account transfer with retry receipts, explicit existing-account replacement,
bottom navigation/sidebar, System/Light/Dark appearance, and recorded-spending
charts. It does not add bank integrations, investment management, automatic merges,
or offline cloud writes. Verification results and remaining device/release gates
must be reported separately; earlier build evidence does not verify this upgrade.

Verification on 2026-10-28: strict clean install preserved the lockfile; lint,
strict types, API/domain tests and mobile/storage tests passed. Eight isolated
MongoDB integration cases passed during this upgrade, including authenticated,
new-account-only import and concurrent retry protection. Android export, native
arm64 release-variant build and emulator checks covered local records, charts,
the sidebar, appearance changes and persistence after restart. No physical-device
or iOS verification is claimed. The local APK uses development signing and a
non-live HTTPS example endpoint, and is not a production distribution artifact.
The current dependency audit remains open: three high and 13 low package entries;
see Architecture's advisory section. No commit or push was performed.
