# Migration: Apps Script → Vercel + Next.js

## Goal

Replace the Google Apps Script web app with a Next.js application hosted on Vercel. Preserve all current functionality. Establish a proper foundation for mobile-first UI, secure authentication, and future feature development.

## Target stack

| Layer | Current | Target |
|---|---|---|
| Hosting | script.google.com | Vercel (free) |
| Frontend | HTML/CSS/JS (Apps Script served) | React (Next.js) |
| Backend | Google Apps Script (.gs functions) | Next.js API routes (Node.js) |
| Auth | Google OAuth via Apps Script USER_ACCESSING | NextAuth.js with Google provider |
| Sheet access | Service account via Sheets REST API | Service account via Sheets REST API (unchanged) |
| Data | Google Sheets (unchanged) | Google Sheets (unchanged) |

## Migration steps

### 1. Prerequisites
- Vercel account (free, no credit card)
- Google Cloud Console project — may already exist from service account setup
- Node.js installed locally
- Existing service account key JSON

### 2. Google OAuth client
Create an OAuth 2.0 client ID in Google Cloud Console (type: Web Application). This replaces the implicit Apps Script OAuth client. Provides a custom app name on the consent screen and proper redirect URI control.

Depends on: Google Cloud Console project existing.

### 3. Next.js project scaffold
Initialize a new Next.js project. Establish folder structure for pages, components, and API routes. Configure Vercel deployment from the git repository.

Depends on: nothing — can be done in parallel with step 2.

### 4. Authentication
Integrate NextAuth.js with the Google provider using the OAuth client from step 2. Gate all pages and API routes behind authentication. Verified email is the identity token for access control.

Depends on: steps 2 and 3.

### 5. Port backend logic
Rewrite the five core server functions as Next.js API routes:
- `getInitialData` → `GET /api/initial-data`
- `getNeighborhoodData` → `GET /api/neighborhood/[name]`
- `saveNeighborhood` → `POST /api/neighborhood/[name]`
- Access control logic from `Auth.gs`
- Sheet read/write helpers from `Data.gs`

The service account JWT signing and Sheets REST API call code is already plain HTTP — it moves with minimal changes.

Depends on: steps 3 and 4.

### 6. Port frontend UI
Convert the existing HTML/CSS/JS to React components. Rebuild mobile-first. The existing CSS design language (colors, typography, card layout) carries over; the structure moves from string-concatenated HTML to JSX components.

This is also the point to implement the mobile-first responsive layout.

Depends on: step 3. Can proceed in parallel with step 5.

### 7. Environment variables
Move secrets from Apps Script Script Properties to Vercel environment variables:
- `SERVICE_ACCOUNT` — service account key JSON
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth client credentials
- `NEXTAUTH_SECRET` — NextAuth session signing key
- Sheet IDs from `Config.gs`

Depends on: steps 2 and 3.

### 8. Deploy and test
Deploy to Vercel preview environment. Test auth flow, data loading, and save operations against the live sheets. Validate mobile layout.

Depends on: all prior steps.

### 9. Cutover
Share the Vercel URL with neighborhood contacts. Retire the Apps Script deployment (leave it running until all users have successfully accessed the new app).

Depends on: step 8.

## What does not change

- Google Sheets remain the data store
- Master sheet structure and column layout
- SRP cache sheets and scraper
- Access control logic (email → authorized rows)
- The visual design

## Key dependencies summary

```
OAuth client (2)
      │
      ▼
NextAuth setup (4) ◄── Next.js scaffold (3) ◄── Vercel account (1)
      │                        │
      ▼                        ▼
API routes (5)          React UI (6)
      │                        │
      └──────────┬─────────────┘
                 ▼
         Env vars + deploy (7, 8)
                 │
                 ▼
            Cutover (9)
```
