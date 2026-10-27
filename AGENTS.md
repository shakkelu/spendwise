# AGENTS.md — Spendwise Development Instructions

## 1. Start Here

Before making changes, read these files:

1. `README.md`
2. `PROJECT_PLAN.md`
3. `ARCHITECTURE.md`
4. `ENGINEERING_STANDARD.md`

The engineering standards are mandatory for all implementation work.

## 2. Current Project Status

Spendwise is in early development.

The repository includes an Expo mobile MVP, Express/MongoDB backend, authentication/session and financial-domain implementations, and automated tests. External email, deployment, device, backup/restore and security release gates remain open; see README.md and PROJECT_PLAN.md. Do not claim production readiness from local tests alone.

## 3. Work Incrementally

- Complete only the task explicitly requested by the user.
- Inspect existing files before changing them.
- Explain the proposed approach before substantial implementation.
- Prefer small, reviewable changes over large batches.
- Do not generate the entire application in one operation.
- Do not introduce unrelated features or dependencies.

## 4. Preserve the Architecture

- Mobile app: React Native, Expo, and TypeScript in `apps/mobile/`.
- Backend API: Node.js, Express, and TypeScript in `services/api/`.
- Database: MongoDB.
- Keep mobile presentation, backend business logic, and persistence responsibilities separate.
- Do not connect the mobile app directly to MongoDB.

## 5. Security Requirements

- Never commit secrets, real credentials, private keys, or real financial records.
- Do not put backend secrets in mobile application code or bundles.
- Enforce authentication and user-level authorization on the server.
- Validate all untrusted input on the backend.
- Use fictional data for development screenshots and demonstrations.
- Do not weaken security controls just to make a feature work.

## 6. Financial Correctness

- Use integer minor units with currency-specific precision.
- Enforce one currency per account for the MVP; record currency explicitly and perform no currency conversion.
- Follow the approved financial rules in `ARCHITECTURE.md`, section 5 (“Financial Data Rules”). Do not silently resolve its open questions during implementation.
- Distinguish actual transactions from expected income, upcoming expenses, and projections.
- Make forecast assumptions explicit.
- Never represent expected income as guaranteed funds.
- Add tests for important financial calculations and edge cases.

## 7. Required Verification

For each implementation task:

1. Identify the files changed.
2. Run relevant checks that are available, such as formatting, linting, type checking, and tests.
3. Report the commands executed and their actual outcomes.
4. Clearly identify checks that were not run.
5. Do not claim success without verification.

## 8. Explain Changes

Provide a concise summary of:

- What changed and why.
- Important design or security decisions.
- Commands and tests run.
- Known limitations or next steps.

The user is learning software engineering while building Spendwise. Explain important architectural decisions in understandable terms without replacing explanations with large code dumps.

## 9. Git and Destructive Actions

- Do not commit, push, publish releases, or modify Git history unless the user explicitly asks.
- Never delete or overwrite user work without approval.
- Never run destructive database commands without explicit approval and a verified recovery plan.
- Do not install dependencies or run project-generation commands before the relevant task has been agreed upon.

## 10. Current Task Boundary

Until the user explicitly authorizes implementation, work only on repository preparation, documentation, and inspection.

Do not generate mobile or backend application code merely because the repository contains a planned architecture.
