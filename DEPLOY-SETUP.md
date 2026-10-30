# FACTS site: set up automatic deploys (guide for the site owner, and for an AI assistant helping them)

**Goal.** After this setup, merging to `main` in `tnguyen-VTX/F.A.C.T.S.` tests, builds and publishes the two FACTS tools to the website, with no manual file copying:

- BAR Builder -> `<web folder>/bar-builder/`
- Journal Entry Maker -> `<web folder>/journal-entry-maker/`

Both tools are plain static files (no server code, no database; every report is read in the user's own browser). The workflow already exists in the repository at `.github/workflows/deploy-site.yml`; the owner only has to do the steps below once.

**Current status (10/30/2026):** the site runs on **Cloudflare Workers with static assets**, with both tools served from the same Worker inside the shared header and footer. The SSH/rsync deploy below does not apply, so the deploy job is **switched off** (it runs only when the repository variable `DEPLOY_ENABLED` is `true`). The owner publishes `main` by hand for now; the tests and builds still run on every pull request and merge. Steps 3 to 4 are only for a server with SSH; a Cloudflare route (for example `wrangler deploy` from the workflow with a Cloudflare API token) is still to be worked out.

**Already done:** the site owner has direct (Write) access to the repository. Nothing to do for access.

> **If you paste this into an AI assistant**, say: "Follow DEPLOY-SETUP.md with me one step at a time. Ask me for anything you need (for example how the site is hosted). Do not ask me to paste private keys into the chat; tell me where to put them instead." The assistant should stop and ask at every step marked **Ask**.

---

## Step 0. Find out how the site is hosted (**Ask**)

Ask the owner: *"What does facts.ledgerandlearning.com run on?"* Then choose:

| Answer | Do this |
|---|---|
| A server or VPS where we have SSH (and `rsync` installed) | Continue with Steps 1 to 6 below. |
| Cloudflare Workers with static assets (the current site) | Deploy job stays off. Publish `main` by hand (`npm run build:bar` and `npm run build:jem`, then add `dist-bar-builder` and `dist-jem` to the Worker's assets at `/bar-builder/` and `/journal-entry-maker/`). Later option: `wrangler deploy` in the workflow with a Cloudflare API token. |
| Cloudflare Pages, Netlify, Vercel or GitHub Pages | Skip Steps 3 to 4. Create two projects from this repository: build command `npm run build:bar`, output folder `dist-bar-builder`; and `npm run build:jem`, output `dist-jem`. Put them at `/bar-builder/` and `/journal-entry-maker/` of the same address. Then do Steps 5 to 6 and tell Tim, so the upload step in the workflow can be removed. |
| WordPress or another CMS, or a host with only FTP/SFTP | Tell Tim ("SFTP only" or "CMS"); the upload step needs a small change. Meanwhile use the manual route at the bottom. |

## Step 1. Get the workflow onto `main`

The workflow file is on the branch `facts-tools`. It does nothing until it is on `main`.

1. In GitHub open the repository, **Pull requests**, **New pull request**, base `main`, compare `facts-tools`.
2. Check the changes list includes `.github/workflows/deploy-site.yml` and `DEPLOY-SETUP.md`, then **Create pull request** and **Merge**.
3. If GitHub says `main` has conflicting changes, stop and tell Tim (do not choose sides blindly).
4. After merging, open **Actions**. A run named "Test, build and deploy the FACTS site" appears. Its `build` job should turn green. Its `deploy` job will fail with "Missing deploy secret" until Step 4. That failure is expected.

## Step 2. Protect `main` (recommended)

Repository **Settings -> Branches -> Add branch protection rule**, branch name `main`:

- Tick **Require a pull request before merging** and set **Required approvals: 1**.
- Tick **Require status checks to pass before merging** and select the check named **build** (it only appears after the workflow has run once).
- Tick **Do not allow bypassing the above settings** (otherwise repository admins can push straight to `main`).

Result: no change reaches the live site without a passing build and a second person's approval. If you prefer to push directly, skip the approvals but keep the status check.

## Step 3. Make a deploy key (SSH servers only)

On any computer that has `ssh-keygen` (a terminal on Mac, Linux, or Windows with OpenSSH):

```
ssh-keygen -t ed25519 -f facts-deploy -N "" -C "facts-deploy"
```

This makes two files: `facts-deploy` (private) and `facts-deploy.pub` (public).

1. Put the **public** key line (the contents of `facts-deploy.pub`) in `~/.ssh/authorized_keys` of an account on the web server that can write to the site folder. A dedicated account that can only write to that folder is best.
2. Check the server has `rsync`: `ssh <account>@<server> "rsync --version"`.
3. Find the web folder path that contains (or will contain) `bar-builder/` and `journal-entry-maker/`, for example `/var/www/facts`. (**Ask** the owner if unsure.)
4. Run `ssh-keyscan -p 22 <server>` and keep the output; it identifies the server for the workflow.
5. Keep the **private** key file for Step 4, then delete it from the computer. Never paste it into a chat, email or the repository.

## Step 4. Add the secrets in GitHub

To switch the deploy job on, also add the repository **variable** (not secret) `DEPLOY_ENABLED` = `true` (Settings -> Secrets and variables -> Actions -> Variables).

Repository **Settings -> Secrets and variables -> Actions -> New repository secret**. Add each of these exactly (names are case-sensitive):

| Name | Value |
|---|---|
| `DEPLOY_HOST` | the server name, for example `facts.ledgerandlearning.com` |
| `DEPLOY_USER` | the account name from Step 3 |
| `DEPLOY_SSH_KEY` | the entire private key file, including the `-----BEGIN` and `-----END` lines |
| `DEPLOY_PATH` | the web folder path from Step 3, no trailing slash |
| `DEPLOY_KNOWN_HOSTS` | the full output of `ssh-keyscan` from Step 3 |
| `DEPLOY_PORT` | only if SSH is not on port 22 |

Optional approval before every deploy: **Settings -> Environments -> New environment**, name it `production`, tick **Required reviewers** and add yourself. (The workflow's deploy job uses this environment; it also works if you leave it without reviewers.)

## Step 5. Web server settings

1. Serve both folders over **HTTPS**.
2. If the server sends its own `Content-Security-Policy` header, copy the policy from the `<meta http-equiv="Content-Security-Policy">` tag in each page's `index.html`. It must include **`worker-src 'self'`**; without it, reading award letter PDFs fails.
3. Make sure files ending `.mjs` are served as JavaScript (`text/javascript`). (The PDF reader's worker file is `assets/pdf.worker.min-*.mjs`.)
4. Keep analytics, chat widgets and other third-party scripts **off** this address. The tools keep school data (employee names and pay) in the user's browser, and every page on the same address can read it.

## Step 6. Run it and check

1. **Actions -> Test, build and deploy the FACTS site -> Run workflow**, tick **Deploy**, run it (or merge any small change to `main`).
2. Wait for `build` and then `deploy` to be green. If you set required reviewers, approve the deploy when GitHub asks.
3. Open `https://facts.ledgerandlearning.com/bar-builder/` and `.../journal-entry-maker/`:
   - The BAR Builder page's menu has: Load reports, BAR Builder, Schools, How to use, About. The Journal Entry Maker page has: Load reports, Journal Entry Maker, Schools, How to use, About.
   - BAR Builder shows "Start from an award letter". Choose a PDF letter: values fill in and no error appears.
   - In the browser's developer tools, Network tab: requests go only to the site itself.
4. Tell Tim it worked (or paste the red error from the Actions log).

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `deploy` says "Missing deploy secret for X" | Secret X is missing or misspelled (Step 4). |
| `Permission denied (publickey)` | The public key is not in `authorized_keys` of `DEPLOY_USER`, or `DEPLOY_SSH_KEY` is incomplete (needs the BEGIN/END lines and a final newline). |
| `Host key verification failed` | Redo `ssh-keyscan` (Step 3) and update `DEPLOY_KNOWN_HOSTS`. |
| `rsync: command not found` | Install `rsync` on the server, or tell Tim the host is SFTP-only. |
| Files appear but the page is blank or PDF reading fails | `worker-src 'self'` missing from the server's CSP header, or `.mjs` not served as JavaScript (Step 5). |
| `build` fails at "Install" | Tell Tim; the spreadsheet library downloads from `cdn.sheetjs.com`. |
| `build` fails at "Test" | A code change broke a test; fix on a branch, do not skip the check. |

## Security notes

- The repository is public. Never commit real workbooks, exports, award letters or payroll files (they are git-ignored). Secrets live only in GitHub.
- Pull requests from forks do not receive the secrets. The deploy job runs only for this repository after a merge to `main` (or a manual run).
- To stop automatic deploys at any time: delete the `DEPLOY_SSH_KEY` secret and remove the key from the server.

## Manual route (if automatic deploy is not possible)

`FACTS-site-files.zip` holds the two built pages. Unzip it and copy `facts-site/bar-builder/` and `facts-site/journal-entry-maker/` to the web folder (replace the old copies, keep `assets/` next to `index.html`). A zip is only a stopgap: it is a snapshot and goes out of date with every change. To make a fresh one from the repository: `npm install`, `npm run build:bar`, `npm run build:jem`, then copy `dist-bar-builder/` and `dist-jem/`.
