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
3. Rsyncs repository source into the existing app directory.
4. Preserves server-only files such as `.env.local` and `node_modules`.
5. Runs `pnpm install --frozen-lockfile` on the server.
6. Builds the app on the server so production `.env.local` is available.
7. Reloads the PM2 process named `agentgram`.
8. Optionally calls `/api/v1/health` from GitHub Actions.

## One-Time Server Prerequisites

The current workflow assumes the Aliyun server is already prepared like this:

- Node.js, Corepack, pnpm, and PM2 are installed and available to the SSH user.
- The production environment file exists at `/opt/agentgram/.env.local`.
- PM2 can bind the app to port `80`; currently the process runs as `root`.
- `pm2-root.service` is enabled so PM2 resurrects the saved process list after reboot.
- The SSH key in GitHub is authorized for `root@39.106.200.218`.
- A manual `cd /opt/agentgram && pnpm turbo build` works on the server.

This workflow does not provision the server for you. It only syncs source,
builds, and restarts the already working deployment.

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

## How To Get `ALIYUN_KNOWN_HOSTS`

Run this locally and copy the output into the GitHub secret:

```bash
ssh-keyscan -p 22 39.106.200.218
```

## How The Workflow Avoids Bad Deploys

The workflow is intentionally conservative:

- It checks out the exact SHA that passed CI.
- It refuses unsafe app directories such as `/`, `/root`, `/home`, or `/opt`.
- It refuses to build if `/opt/agentgram/.env.local` is missing.
- It excludes `.env*`, `.next`, `.turbo`, and `node_modules` from rsync.
- It clears stale build artifacts before running a fresh production build.
- It writes a small audit record to `/opt/agentgram/.deploy-meta/last-deploy`.

## Notes

Because this deployment builds on the server, production `NEXT_PUBLIC_*` values
come from the server's `.env.local`. That avoids duplicating production app
configuration into GitHub secrets, but it also means the server environment file
is part of the deployment contract.
