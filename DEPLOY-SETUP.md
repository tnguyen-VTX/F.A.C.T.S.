# Letting both of us change and deploy the FACTS site (for the site owner)

The FACTS tools (BAR Builder and Journal Entry Maker) are static files. This setup makes a merge to `main` build, test and publish them, so nobody copies files by hand. The workflow is `.github/workflows/deploy-site.yml`.

## How it works

1. Someone changes the code on a branch and opens a pull request into `main`.
2. Every pull request runs the tests and both builds (no deploy).
3. After review, the pull request is merged. The merge builds again and, if the deploy secrets exist, copies:
   - `dist-bar-builder/` to `<DEPLOY_PATH>/bar-builder/`
   - `dist-jem/` to `<DEPLOY_PATH>/journal-entry-maker/`
4. Each copy replaces only its own folder. Nothing else on the site is touched.
5. A manual run is also possible: GitHub, Actions, "Test, build and deploy the FACTS site", Run workflow, tick "Deploy".

## One-time setup (about 15 minutes)

### 1. Give the people access
Repository `tnguyen-VTX/F.A.C.T.S.`, Settings, Collaborators: add the site owner (and anyone else) with **Write** access.

### 2. Protect `main`
Settings, Branches, add a rule for `main`:
- Require a pull request before merging, with **1 approval**.
- Require status checks to pass: choose **build** (from this workflow).
- Do not allow bypassing.
This means a change cannot reach the site without a passing build and a second person.

### 3. Make a deploy key on the server
On any computer with `ssh-keygen`:
```
ssh-keygen -t ed25519 -f facts-deploy -N "" -C "facts-deploy"
```
- Put `facts-deploy.pub` in `~/.ssh/authorized_keys` of an account on the web server that can write to the site folder. Prefer an account that can write only there (a restricted SFTP/rsync user).
- Keep `facts-deploy` (the private key) for step 4, then delete it from the computer.
- The server needs `rsync` installed (most hosts have it). If the host only offers SFTP, tell us and the upload step will change.

### 4. Add the secrets
Repository Settings, Secrets and variables, Actions, "New repository secret" (or add them to the `production` environment from step 5):

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | server name, e.g. `facts.ledgerandlearning.com` |
| `DEPLOY_USER` | the account name from step 3 |
| `DEPLOY_SSH_KEY` | the whole private key file, including the BEGIN and END lines |
| `DEPLOY_PATH` | the site's web folder on the server, e.g. `/var/www/facts` (the folder that contains or will contain `bar-builder/` and `journal-entry-maker/`) |
| `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -p 22 <host>` run from a trusted computer (lets the workflow verify the server) |
| `DEPLOY_PORT` | optional, only if SSH is not on port 22 |

### 5. (Optional) Require an approval before each deploy
Settings, Environments, New environment named `production`, tick **Required reviewers**, add the site owner. Each deploy then waits for that approval.

### 6. Web server settings
- Serve the folders over HTTPS.
- If the server sends its own Content-Security-Policy header, use the one in each page's `index.html`. It includes `worker-src 'self'`; without it, reading award letter PDFs fails. Keep `.mjs` files served as JavaScript (`text/javascript`).
- Keep analytics, chat and other third-party scripts off this site: the tools keep school data (employee names and pay) in the browser, and every page on the same address can read it.

## First run and checks

1. Merge any small change into `main` (or run the workflow manually with "Deploy" ticked).
2. In the Actions tab the `build` job should be green, then `deploy`.
3. Open both pages: the menu shows five items, the title is "BAR Builder" or "Journal Entry Maker", and the browser's Network tab shows requests only to the site itself.
4. If `deploy` fails with "Missing deploy secret", a secret from step 4 is empty or misspelled. If rsync fails, check the server account, the folder permissions and `DEPLOY_KNOWN_HOSTS`.

## If the host is not a plain server

- **Cloudflare Pages, Netlify, Vercel or GitHub Pages:** they can build this repo themselves (build command `npm run build:bar`, output `dist-bar-builder`; a second project for `npm run build:jem`, output `dist-jem`). Then the rsync step is not needed; say so and we will remove it.
- **A CMS (for example WordPress) or a host with SFTP only:** tell us how files are normally uploaded and we will change the upload step.

## Security notes
- The repository is public. Never commit real workbooks, exports, award letters or payroll files (they are git-ignored). Secrets live only in GitHub.
- Pull requests from forks do not get the secrets, and the deploy job runs only on `main` of this repository.
- To stop automatic deploys at any time, delete the `DEPLOY_SSH_KEY` secret (or remove the key from the server).
