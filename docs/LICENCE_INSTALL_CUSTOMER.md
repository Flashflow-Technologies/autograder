# EvalAI — Licence Installation Guide

This short guide explains how to install and manage your EvalAI licence key. It is
intended for the **IT administrator** at your institution. You will have received
a **licence key** (a long text string) from your EvalAI provider.

You do **not** need any special tools — just the licence key and admin access to
your EvalAI installation.

---

## What you received

Your EvalAI provider has sent you a **licence key** that looks like a long string
of letters and numbers (with a single dot in the middle), for example:

```
eyJpbnN0aXR1dGlvbiI6...long string...iJ9.PcMN7pLB0Ni...long string...qcw
```

This key activates EvalAI for your institution, with your agreed plan and validity
period. Keep it somewhere safe (your password manager or IT records).

---

## Option A — Activate from the admin screen (recommended)

This is the quickest method and needs no server access.

1. Log in to EvalAI as an **administrator**.
2. From the Admin home page, click **Licence**.
3. Paste your licence key into the **Install / renew licence** box.
4. Click **Activate licence**.

The screen will confirm activation and show your institution name, plan, and
expiry date.

> **Important — make it permanent:** A key activated this way is active until the
> server restarts. To make it stick across restarts, also complete **Option B**
> below (add it to the server configuration). If you only use Option A, you will
> need to re-paste the key after every server restart.

---

## Option B — Set it in the server configuration (makes it permanent)

Do this so the licence survives server restarts. You will need access to the
server where EvalAI is deployed.

1. In the EvalAI project folder (the folder containing `docker-compose.yml`),
   open or create a file named **`.env`**.
2. Add or update these lines:

   ```bash
   # Turn licence enforcement on
   LICENSE_ENFORCE=true

   # The public key provided by EvalAI (paste exactly as given to you).
   # It is one line, with \n marking the line breaks.
   LICENSE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...provided by EvalAI...\n-----END PUBLIC KEY-----\n"

   # Your licence key
   LICENSE_KEY=eyJ...your full licence key here...qcw
   ```

3. Save the file and restart EvalAI:

   ```bash
   docker compose up -d
   ```

> Your provider supplies the value for `LICENSE_PUBLIC_KEY`. Paste it exactly as
> given. The `LICENSE_KEY` is your own licence string from Option A.

### Confirm it worked

Check the server startup log:

```bash
docker compose logs server | grep -i licen
```

You should see a line indicating the **licence is active**, with your institution
name, plan, and the number of days remaining.

---

## Checking your licence status anytime

Log in as an administrator → Admin home → **Licence**. The screen shows:

- **Status** — active, expired, or invalid
- **Institution** your licence is registered to
- **Plan** and what it includes
- **Expiry date** and days remaining

---

## Renewing your licence

When your licence is approaching expiry, contact your EvalAI provider to renew.
They will send you a **new licence key**. To install it:

1. Activate it on the **Licence** screen (Option A), **and**
2. Update `LICENSE_KEY` in your `.env` file with the new key and restart
   (Option B), so it persists.

The new key replaces the old one automatically.

---

## What happens if the licence expires

EvalAI is designed to **protect your data** if a licence lapses:

- **Your existing data is never deleted and stays fully readable** — all past
  exams, scores, and reports remain accessible.
- Only **new actions** (such as creating a new exam) are paused until you install
  a renewed licence.

So an expired licence will not lock you out of your records — it simply prevents
creating new exams until renewal.

---

## Troubleshooting

| What you see                                   | What it means / what to do                                                        |
|------------------------------------------------|-----------------------------------------------------------------------------------|
| "Invalid licence signature"                    | The key doesn't match the public key on your server. Confirm you pasted the correct `LICENSE_PUBLIC_KEY` from your provider, and the correct licence key. Contact your provider if it persists. |
| "Licence has expired"                          | Your validity period has ended. Contact your provider to renew.                    |
| Licence works, then resets after a restart     | You activated via the screen only (Option A). Add `LICENSE_KEY` to `.env` (Option B). |
| "Programming questions are not included in your plan" | Your current plan doesn't include programming questions. Contact your provider to upgrade. |
| Startup log shows licence not active           | Check that `LICENSE_PUBLIC_KEY` and `LICENSE_KEY` are set correctly in `.env` and that `LICENSE_ENFORCE=true`. |

---

## Need help?

For a new key, a renewal, a plan upgrade, or any licensing question, contact your
EvalAI provider. Keep your licence key and provider contact details with your IT
records.
