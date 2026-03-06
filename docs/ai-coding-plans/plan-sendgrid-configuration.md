# Plan: Configure SendGrid with Domain Authentication

## Context

The email channel adapter (`src/channels/email-channel.ts`) is fully implemented using `@sendgrid/mail`. The code is ready — it reads `SENDGRID_API_KEY`, `EMAIL_FROM_ADDRESS`, and `EMAIL_FROM_NAME` from env vars. What's missing is the **actual SendGrid configuration**: domain authentication (DNS records) so emails aren't rejected as spam, a properly scoped API key, and a way to verify the setup works.

The user has:
- An existing SendGrid account
- A domain with DNS managed at **Hetzner**
- A VPS (used for domain/DNS management, not for hosting the app)

## What to do

### Step 1: Create `docs/sendgrid-setup.md` — Configuration Guide

A step-by-step ops guide covering:

**A. Domain Authentication (Sender Identity)**
- Log into SendGrid → Settings → Sender Authentication → Authenticate Your Domain
- Select DNS host: "Other" (Hetzner)
- Enter the user's domain
- SendGrid generates **3 CNAME records** (for DKIM) + **1 TXT record** (optional, for SPF via SendGrid's include)
- Guide to add these DNS records in Hetzner DNS Console
- Wait for propagation (~5–30 min), then click "Verify" in SendGrid
- Note: If using Cloudflare proxy in front of Hetzner, disable proxy (DNS-only) for the CNAME records

**B. API Key Creation**
- SendGrid → Settings → API Keys → Create API Key
- Restricted Access: only enable **Mail Send → Full Access**
- Copy the key (starts with `SG.`)
- Note: key is shown only once

**C. `.env` Configuration**
- `SENDGRID_API_KEY=SG.xxxxxx`
- `EMAIL_FROM_ADDRESS=agents@<their-domain>` (must match authenticated domain)
- `EMAIL_FROM_NAME=Marketing Agent`
- `ADMIN_EMAIL=<their admin email>`

### Step 2: Create `scripts/test-email.ts` — Verification Script

A standalone script that:
- Loads `.env` via dotenv
- Imports `@sendgrid/mail`
- Sends a test email to a specified address
- Reports success/failure with the SendGrid message ID
- Usage: `npx tsx scripts/test-email.ts recipient@example.com`

### Step 3: Add npm script for convenience

Add to `package.json`:
```json
"test:email": "tsx scripts/test-email.ts"
```

### Step 4: Update `.env.example` comments

Minor update — add a note that `EMAIL_FROM_ADDRESS` must match the authenticated domain.

## Files to modify/create

| File | Change |
|------|--------|
| `docs/sendgrid-setup.md` | **New** — Full SendGrid configuration guide (domain auth + API key + DNS records at Hetzner) |
| `scripts/test-email.ts` | **New** — Test script to verify email delivery end-to-end |
| `package.json` | Add `test:email` script |
| `.env.example` | Add comment that `EMAIL_FROM_ADDRESS` must match authenticated domain |

## Verification

1. Run `npx tsx scripts/test-email.ts your@email.com` — should receive a test email
2. Check SendGrid Activity Feed (Activity → search by email) — should show "Delivered"
3. Check email headers — should show DKIM pass, SPF pass (proves domain auth is working)
4. Commit and push all changes to remote
