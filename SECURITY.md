# Security policy

This project holds tokens that can post publicly to social media accounts. Security problems are
treated as the highest-priority defects.

## Supported versions

The project is pre-release. Only the latest commit on `main` receives security fixes.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately through GitHub: open this repository's **Security** tab and choose
**Report a vulnerability**. Please include:

- the file, service or workflow affected
- steps to reproduce, or a proof of concept
- what an attacker could do with it
- a suggested fix, if you have one

You should receive an acknowledgement within 7 days. Once the report is confirmed, a fix is
prepared privately and released before the details are made public. Reporters are credited
unless they ask not to be.

Never include a real token, API key or `.env` file in a report. Describe where the secret would
be exposed instead.

## Scope

**In scope**

- Leaking or mishandling of tokens and API keys by code in this repository
- Any way to publish without a matching human approval, or to publish the same content twice
- Any way to make a service reachable from outside the local machine
- Weaknesses in the CI configuration or the dependency supply chain of this repository

**Out of scope**

- Vulnerabilities in the platforms and providers this project calls (Meta, YouTube, TikTok,
  Buffer, Google, Cloudflare, Groq). Report those to the vendor.
- Attacks that need an already-compromised operating-system account on the machine running the
  services. That account is the trust boundary.
- Social engineering of the account owner.

## Security model

The project is early, so some controls exist today and others arrive with the service that needs
them. The Status column says which.

| Asset                  | Threat                               | Control                                                                                                      | Status          |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------- |
| Tokens                 | Leak through logs or reports         | Known secret values are stripped from every log line and report before it is written                         | In place        |
| Tokens                 | Sent to the wrong host               | An upload URL returned by a platform is checked against the expected host before the token is attached       | In place        |
| Public posts           | An accidental public post in testing | The Facebook spike saves a draft unless `--publish` is given; the Buffer spike only ever creates a draft     | In place        |
| Repository             | A committed secret                   | `.env` is git-ignored; gitleaks scans every push and pull request                                            | In place        |
| Dependencies           | Malicious install scripts            | npm install scripts are denied in `package.json`; CI installs with `--ignore-scripts`                        | In place        |
| Dependencies           | Known vulnerabilities                | Lockfile committed; Dependabot proposes updates weekly                                                       | In place        |
| Local services         | Access from the network              | Every service and n8n bind to localhost. No tunnel, no public webhook, no inbound port                       | From Phase 1    |
| Tokens                 | Theft at rest or through n8n         | Publishing tokens live only in the publisher service, encrypted at rest. n8n holds none                      | Phase 4         |
| Public posts           | An unreviewed or altered post        | The publisher refuses any job whose file hash and payload hash do not match a recorded approval              | Phase 4         |
| Public posts           | A duplicate after a timeout or crash | One idempotency key per content item and target; the platform is asked what happened before any retry        | Phase 4         |
| Media fetched by a URL | Exposure of unpublished media        | Unguessable short-lived links, deleted when the platform confirms, with a storage lifecycle rule as backstop | Phase 5         |
| Accounts               | Over-broad access                    | Only the minimum scopes: three Page permissions, Instagram publish, `youtube.upload`, one Buffer key         | At each connect |

Phases are defined in [docs/PLAN.md](docs/PLAN.md). The reasoning behind these controls is recorded in
[docs/architecture/decisions/0004-localhost-and-approval-binding.md](docs/architecture/decisions/0004-localhost-and-approval-binding.md).

## Handling secrets

- Secrets belong in `.env`, which is git-ignored. `.env.example` lists the variable names and
  must never contain a real value.
- Never paste a token into an issue, a pull request, a commit message, a test or a log.
- Test fixtures use obviously fake values such as `fake-gemini-key`.
- Free-tier model prompts may be used by the provider to improve its products. Never put
  secrets or personal data in a prompt.

### If a secret is exposed

Revoke first, clean up second. A secret that reached a remote must be treated as compromised
even after the commit is removed.

1. **Revoke or rotate it at the provider.**

   | Secret                     | Where to revoke it                                                               |
   | -------------------------- | -------------------------------------------------------------------------------- |
   | Gemini API key             | Google AI Studio, API keys: delete the key and create a new one                  |
   | Cloudflare API token       | Cloudflare dashboard, My Profile, API Tokens: roll or delete the token           |
   | Meta Page access token     | Facebook settings, Business integrations: remove the app, then issue a new token |
   | Meta app secret            | Meta App Dashboard, App settings, Basic: reset the app secret                    |
   | Buffer API key             | Buffer, Settings, API: delete the key                                            |
   | Google OAuth refresh token | Google Account, Security, Third-party access: remove the app's access            |

2. **Check for misuse.** Review recent posts, drafts and scheduled items on every connected
   account, and the provider's usage dashboard.
3. **Remove it from the repository history** if it was committed, and force-push. Anyone with a
   clone must fetch the rewritten history.
4. **Record what happened** and what was rotated.

## Maintainer checklist for the GitHub repository

These settings are not stored in the repository and must be enabled once in GitHub:

- [ ] Private vulnerability reporting (Settings, Code security)
- [ ] Secret scanning and push protection (Settings, Code security)
- [ ] Dependabot alerts and security updates (Settings, Code security)
- [ ] A ruleset on `main`: require a pull request and passing CI, block force pushes
- [ ] Two-factor authentication on the owner's GitHub account
