# Spendwise — Engineering Standards

These standards apply to all application code, tests, configuration, and documentation in this repository.

## 1. Type Safety
- Use TypeScript for the mobile app and backend.
- Avoid `any`; use explicit types or `unknown` with appropriate narrowing.
- Do not silence type errors without documenting a justified reason.
- Keep shared types organized and avoid unnecessary duplication.

## 2. Code Organization
- Keep HTTP routing, business logic, database access, and validation responsibilities separate.
- Keep React components focused and reasonably small.
- Use clear, descriptive names.
- Avoid unnecessary abstractions and premature optimization.

## 3. Input Validation
- Treat all client input as untrusted.
- Validate request bodies, query parameters, route parameters, and relevant environment variables.
- Reject malformed or out-of-range financial values.
- Do not rely on mobile-side validation as a security boundary.

## 4. Authentication and Authorization
- Protect private endpoints with authentication.
- Enforce ownership checks on every user-owned resource.
- Never trust a client-supplied user ID to establish identity.
- Never expose passwords, password hashes, server secrets, or authentication/session credentials accidentally in API responses, errors, or logs.
- Intentional authentication/session credential issuance is permitted only if required by the authentication mechanism selected later, through its documented secure flow, to the intended client, and subject to its documented security requirements. This rule does not select an authentication mechanism or authorize credential exposure elsewhere.
- Test unauthorized and cross-user access attempts.

## 5. Financial Correctness
- Represent monetary values as integer minor units using currency-specific precision.
- Never use ordinary floating-point arithmetic for authoritative monetary calculations.
- Enforce one currency per account for the MVP, record currency explicitly, and perform no currency conversion.
- Use positive transaction amounts with an explicit income or expense type.
- Follow the approved opening-balance and forecast rules in `ARCHITECTURE.md`, section 5 ("Financial Data Rules"). Resolve its relevant open questions before implementing the affected behavior.
- Keep actual, expected, and projected values distinct.
- Test currency precision, numeric and date boundaries, opening-balance double counting, and forecast assumptions. Test monetary validation, overdue-income handling, and payment transitions against their rules once those rules are decided.

## 6. Error Handling
- Return consistent, documented API error responses.
- Do not expose stack traces, secrets, or internal implementation details to clients.
- Handle expected failures explicitly.
- Avoid silently swallowing errors.

## 7. Security and Privacy
- Never commit `.env` files, credentials, private keys, access tokens, or real financial records.
- Provide safe example environment configuration without actual secrets.
- Store passwords using an established password-hashing library and secure configuration.
- Apply appropriate request-size limits and rate limits.
- Avoid logging sensitive financial or authentication data.
- Use fictional data in screenshots, fixtures, and demonstrations.

## 8. Testing
- Add or update tests when changing behavior.
- Test business rules independently from HTTP handlers.
- Include negative tests, not only successful cases.
- Test authentication, authorization, validation, and financial calculations.
- Do not claim a test passed unless it was actually executed and passed.

## 9. Dependencies
- Prefer established, maintained packages.
- Avoid adding a dependency for functionality that is straightforward to implement safely without one.
- Explain the purpose of new dependencies.
- Never disable security checks merely to make a build pass.

## 10. Configuration
- Read server configuration from validated environment variables.
- Keep development and production settings separate.
- Never embed backend secrets in the mobile app.
- Provide a documented `.env.example` containing placeholders only.

## 11. API Design
- Use consistent route naming, request validation, status codes, and response shapes.
- Apply authentication and authorization before accessing private resources.
- Document meaningful API behavior and error cases.
- Do not expose database internals unnecessarily.

## 12. Maintainability
- Prefer straightforward, readable implementations.
- Avoid duplicated business rules.
- Remove dead code and unused imports.
- Do not make unrelated changes during a focused task.
- Explain non-obvious decisions in comments or documentation.

## 13. Database Changes
- Define and document data models and required fields.
- Enforce data ownership in database operations.
- Consider existing data when changing a schema.
- Never run destructive database operations against production without explicit approval and a verified recovery plan.

## 14. Accessibility and User Experience
- Provide accessible labels for important interactive controls.
- Support loading, empty, error, and success states.
- Avoid misleading financial summaries or forecasts.
- Make the difference between recorded and projected values clear.

## 15. Required Workflow for AI-Assisted Changes
Before implementing a substantial change:
1. Inspect the relevant files and existing project conventions.
2. Explain the intended change and identify its risks.
3. Make the smallest reasonable set of changes.
4. Run relevant formatting, linting, type checks, and tests where available.
5. Report what changed, what commands were run, and any checks that failed or were not run.
6. Update documentation when behavior or architecture changes.

Never claim that a feature is secure, tested, or production-ready without evidence.
