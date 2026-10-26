# Spendwise — System Architecture

## 1. Architecture Overview

Spendwise uses a mobile client, a backend API, and a database.

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

- Store monetary amounts using a representation that avoids binary floating-point rounding errors, such as integer minor units.
- Record the currency explicitly.
- Use consistent rules for transaction dates and time zones.
- Keep recorded balances and projected balances distinguishable.
- Document how expected income, expenses, and forecast dates affect calculations.
- Do not treat uncertain income as guaranteed.

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

