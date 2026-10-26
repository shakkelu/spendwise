# Spendwise — System Architecture

## 1. Architecture Overview

This document describes Spendwise’s planned system and required behavior, not existing implementation. The planned system consists of a mobile client, a backend API, and a MongoDB database. The responsibilities and request flow below describe that planned system.

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

### Open Financial Questions

Resolve these questions before implementing the affected behavior:

- Monetary validation: Which currencies are supported? What numeric limits apply? How is input with excess precision handled, and what rounding rules, if any, apply? May an account's currency change after financial records exist?
- Opening-balance boundary: Does the balance apply at the start or end of its effective date? How are transactions on that date or earlier handled without double counting? How do later edits to the opening balance affect calculations?
- Dates and timezones: Which fields are calendar dates and which are timestamps? Which timezone governs monthly summaries and forecasts? Which date boundaries are inclusive?
- Forecast horizon: What period is shown, what is its starting balance and date, and is the horizon fixed or selectable?
- Overdue expected income: When a scheduled date passes without receipt, how does the item affect the current forecast? Is rescheduling explicit or automatic?
- Payment transitions: How is an expected payment linked to a recorded income transaction? Which date records receipt, and how does the transition prevent counting the payment as both expected and received?
- Upcoming expenses: Which due-date and settlement rules determine forecast inclusion and prevent counting an expense again after it becomes a recorded transaction?

These questions do not authorize additional MVP features. Do not assume answers during implementation.

## 6. Security Principles

- Use HTTPS for production API communication.
- Keep secrets out of source control and mobile application bundles.
- Store passwords using a suitable password-hashing algorithm; never store plaintext passwords.
- Validate and constrain all untrusted input on the backend.
- Apply appropriate authentication, authorization, rate limiting, and error handling.
- Avoid logging passwords, access tokens, or unnecessary financial details.
- Use synthetic financial data in public demonstrations.

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

## 9. Other Open Decisions

- Before authentication work: Select and document the authentication/session mechanism and its security requirements, including any credential issuance, expiry, renewal, revocation, secure mobile storage, and logout behavior. No mechanism is selected by this document.
- With initial scaffolding and integration: Choose runtime and package-manager versions, workspace setup, local database setup, environment configuration, and mobile-to-API connectivity. Clarify local development transport; production HTTPS remains required.
- With the relevant implementation: Choose testing tools, isolated database-test setup, and repeatable formatting, linting, type-checking, and test commands. Define API response/error conventions and handling of repeated financial submissions.
- Before accepting real financial data: Document mobile caching and logout cleanup, data retention/deletion, protected backups, and restore verification. Identify targeted ignore rules when credential, signing, or database-export tooling is selected.

Hosting, release automation, and automated mobile end-to-end tooling can be decided later.
