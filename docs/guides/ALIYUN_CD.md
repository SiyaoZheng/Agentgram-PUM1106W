# Aliyun CD Guide

This guide documents the GitHub Actions production deployment workflow for the
existing Aliyun-hosted AgentGram instance.

## Current Production Host

As of 2026-04-23, the live AgentGram web server is:

- ECS name: `agentgram-web`
- Region: `cn-beijing`
- Public EIP: `39.106.200.218`
- SSH user: `root`
- App directory: `/opt/agentgram`
- PM2 process name: `agentgram`

The server currently runs the Next.js standalone server directly on port `80`
through PM2. Docker is not installed, and `/opt/agentgram` was not a git
checkout during inspection.

After the `efwc` key pair was bound on 2026-04-23, the instance appeared to
have restarted and PM2 did not initially resurrect the app. The app was restored
and `pm2-root.service` was created, enabled, and started through systemd so the
saved PM2 process list should come back on future reboots.

## What This Workflow Does

The workflow in `.github/workflows/deploy-aliyun.yml` deploys the app after a
successful `CI` run on `develop`, or when triggered manually from GitHub. The
remote build/reload commands live in `scripts/deploy-aliyun-remote.sh` so the
deployment logic stays versioned and auditable.

It performs these steps:

1. Checks out the exact commit that passed CI.
2. Connects to the Aliyun host over SSH.
3. Fetches the server's existing `/opt/agentgram/.env.local` into the GitHub runner.
4. Installs dependencies and builds the Next.js standalone artifact on GitHub Actions.
5. Rsyncs repository source into the existing app directory while preserving server data and env files.
6. Rsyncs the built `.next` artifact and public assets to the server.
7. Restarts the PM2 process named `agentgram`.
8. Optionally calls `/api/v1/health` from GitHub Actions.

Manual dispatch accepts an optional `target_sha` input. Use that input to
redeploy a known-good commit when rolling back.

## Public IP Policy

The production service intentionally uses the ECS EIP directly for now:

- Base URL: `http://39.106.200.218`
- Healthcheck: `http://39.106.200.218/api/v1/health`

Do not add domain or TLS assumptions to the deployment workflow until a domain
decision is made separately. If the EIP ever changes, update the GitHub
`production` environment secret or variable that stores
`ALIYUN_HEALTHCHECK_URL`.

## One-Time Server Prerequisites

The current workflow assumes the Aliyun server is already prepared like this:

- Node.js and PM2 are installed and available to the SSH user.
- The production environment file exists at `/opt/agentgram/.env.local`.
- PM2 can bind the app to port `80`; currently the process runs as `root`.
- `pm2-root.service` is enabled so PM2 resurrects the saved process list after reboot.
- The SSH key in GitHub is authorized for `root@39.106.200.218`.

This workflow does not provision the server for you. It only syncs source,
syncs a GitHub-built artifact, and restarts the already working deployment.

## Required GitHub Secrets

Configure these in the GitHub `production` environment:

- `ALIYUN_HOST`: `39.106.200.218`
- `ALIYUN_PORT`: `22`
- `ALIYUN_USER`: `root`
- `ALIYUN_APP_DIR`: `/opt/agentgram`
- `ALIYUN_SSH_PRIVATE_KEY`: private key authorized for the Aliyun ECS key pair
- `ALIYUN_KNOWN_HOSTS`: exact host key line(s) for `39.106.200.218`

Optional:

- `ALIYUN_PM2_NAME`: PM2 process name, defaults to `agentgram`
- `ALIYUN_HEALTHCHECK_URL`: public base URL, for example `http://39.106.200.218`.
  Use a GitHub environment variable if you also want it shown as the deployment URL.
- `ALIYUN_BACKUP_PASSPHRASE`: passphrase used by the backup workflow to encrypt
  GitHub Actions artifacts. This is required by `.github/workflows/backup-aliyun-data.yml`.

## How To Get `ALIYUN_KNOWN_HOSTS`

Run this locally and copy the output into the GitHub secret:

```bash
ssh-keyscan -p 22 39.106.200.218
```

## How The Workflow Avoids Bad Deploys

The workflow is intentionally conservative:

- It checks out the exact SHA that passed CI.
- It builds on the GitHub runner rather than the small ECS instance.
- It refuses unsafe app directories such as `/`, `/root`, `/home`, or `/opt`.
- It refuses to build if `/opt/agentgram/.env.local` is missing.
- It excludes `.env*`, `.next`, `.turbo`, and `node_modules` from rsync.
- It separately syncs the build artifact into `apps/web/.next`.
- It writes a small audit record to `/opt/agentgram/.deploy-meta/last-deploy`.
- It preserves the previous deployment metadata at
  `/opt/agentgram/.deploy-meta/previous-deploy`.
- It appends recent deployment history to
  `/opt/agentgram/.deploy-meta/deploy-history.tsv`.

## Data Backups

Application data lives on the server under:

```text
/opt/agentgram/apps/web/data
```

Normal deploys exclude this directory from rsync, so deploys do not overwrite
production JSON data.

The workflow `.github/workflows/backup-aliyun-data.yml` backs up this directory.
It runs daily at 02:30 Asia/Shanghai and can also be triggered manually from
GitHub Actions.

The backup workflow does two things:

1. Creates a server-side archive under `/opt/agentgram-backups/data`.
2. Downloads the newest archive to GitHub Actions, verifies its checksum,
   encrypts it with `ALIYUN_BACKUP_PASSPHRASE`, and uploads only the encrypted
   archive as a short-retention artifact.

Server-side backups are kept for 30 days by default. GitHub encrypted artifacts
are also retained for 30 days. Do not upload raw, unencrypted `apps/web/data`
from this public repository.

To create a one-off server-side backup over SSH:

```bash
ssh -i /Users/siyaozheng/Downloads/efwc.pem root@39.106.200.218 \
  "ALIYUN_APP_DIR=/opt/agentgram bash -s" \
  < ./scripts/backup-aliyun-data-remote.sh
```

The command prints only archive metadata: archive path, SHA-256 digest, size,
and source deployment SHA.

## Rollback Strategy

Rollback means redeploying a known-good Git commit and preserving production
data. It does not mean editing files directly on the ECS instance.

Preferred rollback path:

1. Open GitHub Actions for `SiyaoZheng/Agentgram-PUM1106W`.
2. Run `Backup Aliyun Data` manually first.
3. Run `Deploy to Aliyun` manually.
4. Fill `target_sha` with a known-good commit SHA, for example the last healthy
   SHA from `/opt/agentgram/.deploy-meta/previous-deploy` or
   `/opt/agentgram/.deploy-meta/deploy-history.tsv`.
5. Wait for the workflow healthcheck to pass.

Useful read-only SSH checks:

```bash
ssh -i /Users/siyaozheng/Downloads/efwc.pem root@39.106.200.218 \
  "cat /opt/agentgram/.deploy-meta/last-deploy; echo; cat /opt/agentgram/.deploy-meta/previous-deploy 2>/dev/null || true"
```

```bash
ssh -i /Users/siyaozheng/Downloads/efwc.pem root@39.106.200.218 \
  "tail -20 /opt/agentgram/.deploy-meta/deploy-history.tsv 2>/dev/null || true"
```

Emergency-only rollback path:

- If GitHub Actions is unavailable but SSH works, build the target commit on a
  non-ECS machine, sync the built artifact to `/opt/agentgram`, and run
  `scripts/deploy-aliyun-remote.sh` over SSH with `TARGET_SHA` set.
- Do not run `pnpm turbo build` directly on the 2C/2G ECS host. A previous
  server-side build overloaded the instance and temporarily left ECS in
  transitional states such as `Stopping` and `Starting`.

## Branch Protection

The intended GitHub protection target is the default branch `develop`.

Recommended settings for this single-admin course fork:

- Require status checks before merging.
- Require `Unit Tests`.
- Require `Production Build`.
- Require branches to be up to date before merging.
- Disable force pushes.
- Disable branch deletion.
- Do not require approving reviews yet, because this repo currently has only
  one active administrator and a review requirement could make normal solo
  maintenance unnecessarily awkward.
- Do not enforce protections against administrators unless Adrian explicitly
  wants direct pushes blocked even for himself.

## Notes

Because this deployment temporarily fetches `.env.local` into the GitHub runner
before building, production `NEXT_PUBLIC_*` values still come from the server's
environment file. That avoids duplicating production app configuration into
GitHub secrets, but it also means the server environment file is part of the
deployment contract.
