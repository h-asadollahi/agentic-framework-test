# SendGrid Setup Guide

Complete guide to configuring SendGrid with domain authentication for the Marketing Agent platform. This ensures your emails are delivered reliably and not flagged as spam.

---

## Prerequisites

- A [SendGrid](https://sendgrid.com) account (free tier: 100 emails/day)
- Access to your domain's DNS (Hetzner DNS Console)
- The project cloned and `.env` file created

---

## Step 1: Authenticate Your Domain

Domain authentication adds DKIM and SPF records so email providers trust your sender identity.

### 1.1 Start the Authentication Flow

1. Log in to [SendGrid](https://app.sendgrid.com)
2. Go to **Settings** → **Sender Authentication**
3. Under **Domain Authentication**, click **"Authenticate Your Domain"**

### 1.2 Choose DNS Host

1. Select **"Other Host (Not Listed)"** as your DNS host
2. Click **Next**

### 1.3 Enter Your Domain

1. Enter your domain (e.g., `yourdomain.com`)
2. Optionally toggle **"Use automated security"** (recommended — ON)
3. Optionally toggle **"Use custom return path"** if you want a custom bounce subdomain
4. Click **Next**

### 1.4 Copy the DNS Records

SendGrid will generate DNS records. You'll typically see:

| Type  | Host/Name                          | Value/Points to                           |
|-------|------------------------------------|-------------------------------------------|
| CNAME | `s1._domainkey.yourdomain.com`     | `s1.domainkey.u12345.wl123.sendgrid.net`  |
| CNAME | `s2._domainkey.yourdomain.com`     | `s2.domainkey.u12345.wl123.sendgrid.net`  |
| CNAME | `em1234.yourdomain.com`            | `u12345.wl123.sendgrid.net`               |

> **Note**: The exact values will be unique to your account. Copy them exactly as shown in SendGrid.

### 1.5 Add DNS Records in Hetzner

1. Log in to [Hetzner DNS Console](https://dns.hetzner.com)
2. Select your domain zone
3. For each record from SendGrid:
   - Click **"Add Record"**
   - Type: **CNAME**
   - Name: Enter only the subdomain part (e.g., `s1._domainkey` — Hetzner appends the domain automatically)
   - Value: The target from SendGrid (e.g., `s1.domainkey.u12345.wl123.sendgrid.net.`)
   - TTL: 3600 (or default)
   - Click **Save**
4. Repeat for all records

> **Important**: Some DNS panels require a trailing dot (`.`) on CNAME values. Hetzner usually handles this automatically — check that the record was saved correctly.

### 1.6 Verify in SendGrid

1. Go back to SendGrid's Sender Authentication page
2. Wait 5–30 minutes for DNS propagation
3. Click **"Verify"**
4. All records should show a green checkmark

> **Troubleshooting**: If verification fails, double-check:
> - No typos in the CNAME name/value
> - Hetzner didn't duplicate the domain (e.g., `s1._domainkey.yourdomain.com.yourdomain.com`)
> - Wait longer (up to 48 hours in rare cases) and retry
> - Use `dig` to check: `dig CNAME s1._domainkey.yourdomain.com`

---

## Step 2: Create a Restricted API Key

A least-privilege API key for sending emails only.

1. In SendGrid, go to **Settings** → **API Keys**
2. Click **"Create API Key"**
3. Name it: `marketing-agent-mail-send`
4. Select **"Restricted Access"**
5. Under permissions, enable **only**:
   - **Mail Send** → **Full Access**
6. Leave everything else as **No Access**
7. Click **"Create & View"**
8. **Copy the key immediately** — it starts with `SG.` and is shown only once

> **Security**: Never commit your API key to git. It belongs only in your `.env` file.

---

## Step 3: Configure Environment Variables

Edit your `.env` file:

```bash
# SendGrid
SENDGRID_API_KEY=SG.your_actual_api_key_here

# Must match your authenticated domain (e.g., agents@yourdomain.com)
EMAIL_FROM_ADDRESS=agents@yourdomain.com
EMAIL_FROM_NAME=Marketing Agent

# Admin email for escalation notifications
ADMIN_EMAIL=you@yourdomain.com
```

### Important Notes

- `EMAIL_FROM_ADDRESS` **must** use your authenticated domain. If you authenticated `yourdomain.com`, the sender must be `something@yourdomain.com`.
- Using an unauthenticated sender address will cause emails to fail or land in spam.
- `ADMIN_EMAIL` can be any valid email address (doesn't need to be on the same domain).

---

## Step 4: Test Email Delivery

Run the included test script:

```bash
# Send a test email
npm run test:email -- you@yourdomain.com
```

You should see:

```
Sending test email to: you@yourdomain.com
From: Marketing Agent <agents@yourdomain.com>

Email sent successfully!
Message ID: abc123xyz
Check your inbox (and spam folder) for the test email.
```

### Verify Delivery

1. **Check your inbox** — you should receive the test email within seconds
2. **Check SendGrid Activity**:
   - Go to **Activity** in the SendGrid dashboard
   - Search for the recipient email
   - Status should show **"Delivered"**
3. **Check email headers** (optional):
   - Open the email → "Show Original" / "View Source"
   - Look for:
     - `dkim=pass` — proves DKIM signing works
     - `spf=pass` — proves SPF alignment
     - `Authentication-Results: ... dkim=pass ... spf=pass`

---

## Troubleshooting

### "403 Forbidden" error

- Your API key doesn't have **Mail Send** permission. Create a new key with the correct scope.

### "The from address does not match a verified Sender Identity"

- Your `EMAIL_FROM_ADDRESS` doesn't match the authenticated domain.
- Either authenticate the domain in SendGrid, or use a verified Single Sender address.

### Emails land in spam

- Domain authentication not verified — check the CNAME records.
- Try sending from a subdomain (e.g., `mail.yourdomain.com`) if the root domain has conflicting SPF records.
- Warm up your sending gradually — don't blast hundreds of emails on day one.

### DNS records not propagating

```bash
# Check if CNAME records are visible
dig CNAME s1._domainkey.yourdomain.com
dig CNAME s2._domainkey.yourdomain.com
dig CNAME em1234.yourdomain.com
```

If empty, the records haven't propagated yet or there's a typo.

---

## SendGrid Free Tier Limits

| Limit | Value |
|-------|-------|
| Daily emails | 100 |
| Monthly emails | 100/day |
| API rate limit | Variable |
| Dedicated IP | Not included (shared IP pool) |

For production with higher volumes, upgrade to the Essentials plan ($19.95/mo for 50K emails).

---

## Architecture Reference

```
.env
├── SENDGRID_API_KEY          → EmailChannel constructor → sgMail.setApiKey()
├── EMAIL_FROM_ADDRESS        → EmailChannel.fromAddress  → "from" field
├── EMAIL_FROM_NAME           → EmailChannel.fromName     → "from" display name
└── ADMIN_EMAIL               → escalateTask              → escalation recipient

Flow:
  escalateTask / notifyTask
      → channelRegistry.get("email")
      → emailChannel.send(request)
      → sgMail.send({ to, from, subject, text, html })
      → SendGrid API → Recipient inbox
```

See `src/channels/email-channel.ts` for the implementation.
