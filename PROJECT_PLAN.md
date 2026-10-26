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

### Transaction Management
- Add, edit, and delete transactions.
- Categorize income and expenses.
- Record transaction dates, amounts, and descriptions.

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

### User Accounts and Data Security
- Support individual user accounts.
- Enforce authorization on the backend for every user-owned resource.
- Validate incoming data on the server.
- Prevent users from accessing another user's financial records.

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
