# EvalAI — Licensing Setup Manual

This manual explains how to set up and operate the EvalAI licensing system. It is
written for **you, the vendor** (the person selling EvalAI), and covers everything
from generating your signing keys to issuing and renewing customer licences.

---

## 1. How the licensing works (read this first)

EvalAI uses **signed licence keys** for self-hosted deployments. The model is:

- You hold a **private signing key** (secret, kept only by you).
- Each deployed EvalAI server holds the matching **public key** (safe to share).
- You issue each customer a **licence key** — a signed token containing their
  institution name, plan tier, and expiry date.
- The server verifies the key with the public key. Because only you have the
  private key, **a customer cannot forge a licence or extend their own expiry.**

Payment is handled **offline** — you invoice the institution through your normal
sales process. The software only enforces the plan tier and expiry date.

### Important honest caveats

1. **This is a contractual speed bump, not unbreakable DRM.** EvalAI is
   self-hosted and open-source-stack, so a technically capable customer could
   patch the app to ignore the licence check. For institutional buyers who sign
   contracts and care about compliance, this is normally sufficient. Do not
   expect it to stop a determined bad actor.
2. **Guard your private key with your life.** Anyone who obtains it can mint
   unlimited licences. It must never be committed to version control, shipped in
   the customer package, or stored on a customer's server.
3. **Expiry never destroys data.** When a licence expires, existing data stays
   fully readable; only new privileged actions (creating exams) are blocked.
   This is by design.

---

## 2. One-time vendor setup: generate your signing keys

Do this **once**, on your own secure machine (not a customer's server).

You need Node.js installed. From the project root:

```bash
node tools/license/generate.js keygen
```

This creates two files in your current directory:

| File                  | What it is                          | Where it goes                          |
|-----------------------|-------------------------------------|----------------------------------------|
| `vendor_private.pem`  | Your **secret** signing key         | Keep offline and secret. NEVER share.  |
| `vendor_public.pem`   | The public verification key         | Goes on every deployed server          |

**Immediately after generating:**

- Move `vendor_private.pem` somewhere safe (a password manager, an encrypted
  vault, or an offline backup). Back it up — if you lose it, you cannot issue or
  renew any licences and must re-key every customer.
- Confirm `vendor_private.pem` is **not** inside any folder you will zip and send
  to customers, and is **not** tracked by git. (The project's `.gitignore` should
  exclude `*.pem`; verify this.)

> The `tools/` folder is vendor-only. Do **not** ship the `tools/license/`
> directory or either `.pem` file to customers.

---

## 3. Per-deployment setup: install the public key on the server

Each customer's EvalAI server needs three environment variables. These are read
by the server container.

| Variable               | Purpose                                                        | Example                              |
|------------------------|----------------------------------------------------------------|--------------------------------------|
| `LICENSE_PUBLIC_KEY`   | The PEM public key the server uses to verify licences          | contents of `vendor_public.pem`      |
| `LICENSE_KEY`          | The institution's licence key (optional here; can be pasted in the admin UI instead) | the token you issue in step 4 |
| `LICENSE_ENFORCE`      | Turns enforcement on. `false` (default) = fully unlocked dev mode | `true` in production              |

### Setting them with Docker Compose

The compose file reads variables from a `.env` file in the project root (same
folder as `docker-compose.yml`). Create or edit that `.env` file:

```bash
# .env  (project root, next to docker-compose.yml)

LICENSE_ENFORCE=true

# Paste the PUBLIC key as a single line with \n for newlines, OR see the
# multi-line note below.
LICENSE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...rest of key...\n-----END PUBLIC KEY-----\n"

# Optional: bake in the licence key (or leave blank and paste it in the admin UI)
LICENSE_KEY=
```

Then make sure the server service in `docker-compose.yml` passes them through.
In the `server:` (and `worker:`) `environment:` block, add:

```yaml
    environment:
      # ... existing vars ...
      - LICENSE_PUBLIC_KEY=${LICENSE_PUBLIC_KEY}
      - LICENSE_KEY=${LICENSE_KEY:-}
      - LICENSE_ENFORCE=${LICENSE_ENFORCE:-false}
```

> **Newlines in the public key:** PEM keys are multi-line. The simplest reliable
> approach is to put the whole key on one line in `.env` using `\n` between
> lines, wrapped in double quotes, exactly as shown above. The app handles the
> `\n` sequences. If you prefer real multi-line, use Docker secrets or mount the
> key as a file and read it in — but the single-line `\n` form is easiest.

After editing, rebuild/restart:

```bash
docker compose up --build -d
```

Check the server log line on startup — it logs whether the licence is active:

```bash
docker compose logs server | grep -i licen
```

You should see either `Licence active` (with institution/plan/days left) or a
warning explaining why it isn't.

---

## 4. Issuing a licence to a customer

When you close a sale and invoice the institution, issue their licence key.

From the project root, on your machine where `vendor_private.pem` lives:

```bash
node tools/license/generate.js issue \
  --institution "Canara Engineering College" \
  --plan university \
  --months 12 \
  --key ./vendor_private.pem
```

| Flag             | Meaning                                                       |
|------------------|---------------------------------------------------------------|
| `--institution`  | The institution's name (appears on their licence screen)      |
| `--plan`         | One of: `essentials`, `institution`, `university`, `enterprise` |
| `--months`       | Licence duration in months from today (e.g. `12` for a year)  |
| `--key`          | Path to your private key                                      |

The command prints a **licence key** (a long string). That string is what you
give the customer.

### Delivering it to the customer

The customer activates it in **one** of two ways:

1. **Admin UI (easiest):** they log in as an admin → open the **Licence** screen
   (Admin home → "Licence") → paste the key → click **Activate licence**.
2. **Environment variable:** set `LICENSE_KEY=<the key>` in their `.env` and
   restart the server.

> **Persistence note:** A key activated only through the admin UI is active for
> the running server process. To survive a server restart, the customer should
> **also** set `LICENSE_KEY` in their environment. Tell them this when you send
> the key. (If you prefer keys to persist automatically in the database instead,
> that is a possible enhancement — ask your developer.)

---

## 5. The plan tiers

Plans are defined in `server/src/services/licenseService.js`. The current tiers:

| Plan          | Max students | Programming questions | HoD dashboard | AI generation |
|---------------|--------------|-----------------------|---------------|---------------|
| `essentials`  | 1,500        | **No**                | Yes           | Yes           |
| `institution` | 5,000        | Yes                   | Yes           | Yes           |
| `university`  | Unlimited    | Yes                   | Yes           | Yes           |
| `enterprise`  | Unlimited    | Yes                   | Yes           | Yes           |

To change what a plan includes (limits or feature flags), edit the `PLANS`
object in that file and rebuild. The feature flags currently enforced are:

- `programmingQuestions` — if `false`, saving a paper that contains any
  programming question is blocked with an upgrade message.

(Other flags like `hodDashboard` and `aiGeneration` are defined and available to
gate in the same way if you decide to differentiate tiers further.)

---

## 6. What enforcement actually does

When `LICENSE_ENFORCE=true`:

- **No licence / invalid / expired:** creating a new exam is blocked with a clear
  message. **Existing data stays fully readable** — nothing is deleted or locked.
- **Plan without programming questions:** saving a question paper that contains a
  programming question is rejected with an upgrade prompt.
- **Admin Licence screen** shows current status: plan, institution, expiry date,
  and days remaining, with a renewal field.

When `LICENSE_ENFORCE=false` (default): everything is unlocked. Use this for
development, demos, and evaluation.

---

## 7. Renewing a licence

When a customer renews (and you have invoiced them again):

1. Issue a fresh key with a new duration:
   ```bash
   node tools/license/generate.js issue \
     --institution "Canara Engineering College" \
     --plan university \
     --months 12 \
     --key ./vendor_private.pem
   ```
2. Send them the new key.
3. They paste it into the **Licence** screen (and update `LICENSE_KEY` in their
   `.env` for persistence).

The new key simply replaces the old one. There is no need to revoke the old key —
it will expire on its own date.

---

## 8. Upgrades and downgrades

To move a customer to a different plan (e.g. Institution → University), issue a
new key with the new `--plan` value and have them activate it. The new plan's
limits and features take effect immediately on activation.

---

## 9. Troubleshooting

| Symptom                                              | Likely cause / fix                                                                 |
|------------------------------------------------------|------------------------------------------------------------------------------------|
| Startup log says "Licence not active"                | `LICENSE_PUBLIC_KEY` not set, or `LICENSE_KEY` missing/expired. Check `.env`.       |
| Admin pastes key → "Invalid licence signature"       | The key was issued with a **different** private key than the server's public key. Re-issue with the matching key, or fix `LICENSE_PUBLIC_KEY`. |
| Admin pastes key → "Licence has expired"             | The `--months` window has passed. Issue a new key.                                 |
| "Unknown plan" error                                 | The `--plan` value wasn't one of the four valid plans. Re-issue.                   |
| Everything is unlocked despite no key                | `LICENSE_ENFORCE` is not `true`. Set it and restart.                               |
| Key works but resets after server restart            | `LICENSE_KEY` not set in `.env` — it was only pasted in the UI. Add it to `.env`.  |
| "Programming questions are not included in your plan"| The customer is on `essentials`. Upgrade them to `institution` or higher.          |

To verify a key yourself before sending it, you can re-run the `issue` output and
confirm the printed institution/plan/expiry are what you intended.

---

## 10. Security checklist (do not skip)

- [ ] `vendor_private.pem` is backed up somewhere safe and offline.
- [ ] `vendor_private.pem` is **not** in git and **not** in any customer package.
- [ ] The `tools/license/` folder is **not** shipped to customers.
- [ ] Each customer server has `LICENSE_PUBLIC_KEY` set and `LICENSE_ENFORCE=true`.
- [ ] `JWT_SECRET` is set to a strong unique value (separate from licensing, but
      essential for the admin login that controls licence installation).
- [ ] You keep a record of which institution has which plan and expiry, so you
      know when to invoice renewals.

---

## 11. Quick reference

```bash
# One-time: make your keys
node tools/license/generate.js keygen

# Issue a 1-year University licence
node tools/license/generate.js issue \
  --institution "Name Here" --plan university --months 12 \
  --key ./vendor_private.pem

# Server env (in .env at project root)
LICENSE_ENFORCE=true
LICENSE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
LICENSE_KEY=<optional; or paste in admin UI>
```

Plans: `essentials` · `institution` · `university` · `enterprise`
