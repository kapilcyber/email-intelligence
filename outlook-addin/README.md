# Email Intelligence — Outlook add-in

This folder contains the Outlook add-in package for Email Intelligence. The add-in now opens the **VM-hosted Next.js app inside the Outlook task pane** instead of opening a separate browser tab.

The add-in entry route is the dashboard app's `/outlook` page, which:

- loads Office.js inside the task pane
- captures the current Outlook item context
- stores that context in session storage
- redirects into the full dashboard in embedded Outlook mode

## Prerequisites

- Node.js 18+ (for the build script)
- For **local sideloading**: Outlook desktop or Outlook on the web in your Microsoft 365 tenant
- **HTTPS** is required for production hosts; for **localhost**, `http://localhost` is allowed by Office for development

## Configure

1. Copy `.env.example` to `.env`.
2. Set:
   - **`ADDIN_ORIGIN`** — public URL of this static site (where `manifest.xml` is served). Example with Docker: `http://localhost:3010`
   - **`DASHBOARD_URL`** — full URL of the Email Intelligence Next.js app (same as `NEXTAUTH_URL` / how users open the dashboard). Example: `http://localhost:3001`

## Build

```bash
cd outlook-addin
npm install
npm run build
```

Output:

- `dist/manifest.xml`
- `dist/outlook-addin/*` static add-in files
- `email-intelligence-outlook-addin.zip`

The build also mirrors the generated add-in assets into:

- `email-dashboard/public/outlook-addin`

so the dashboard app on the VM can serve:

- `https://172.16.200.30/outlook-addin/manifest.xml`
- `https://172.16.200.30/outlook-addin/commands.html`

Optional: parse the built manifest locally (does not call the Office validation gateway):

```bash
npm run manifest:info
```

The `office-addin-manifest validate` command posts to Microsoft's validation service, which often rejects **localhost** manifests; use **HTTPS internal URLs** when validating for production.

## Serve locally (optional)

From the **repository root** (after `npm run build` in `outlook-addin`):

```bash
docker compose --profile outlook-addin up -d outlook_addin
```

Add-in static files: **http://localhost:3010/manifest.xml**

## Deploy on the VM

1. Build the add-in:

```bash
cd outlook-addin
node scripts/build.mjs
```

2. Rebuild/restart the dashboard stack so the copied files under `email-dashboard/public/outlook-addin` are served by the VM-hosted app.

3. Use one of these in Outlook / Microsoft 365 admin:

- Manifest URL: `https://172.16.200.30/outlook-addin/manifest.xml`
- Zip upload: `outlook-addin/email-intelligence-outlook-addin.zip`

## Sideload for testing

1. Outlook **Windows**: **File → Manage Add-ins** (or **Get Add-ins → My add-ins → Add a custom add-in → Add from File**) and pick `dist/manifest.xml`, or use **Upload My Add-in** per your Outlook version.
2. **Outlook on the web**: **Settings → Mail → Customize actions → Add-ins → My add-ins → Custom add-ins** (wording varies) and upload the manifest.
3. Open a message; use the **Home** ribbon **Email Intelligence** group → **Dashboard**.
4. The task pane will load the VM-hosted Email Intelligence app directly inside Outlook.

If the browser does not open, check **popup blockers** for the add-in origin.

## Organization-wide deployment (production)

1. Host `dist/` on an **internal HTTPS** origin trusted by all PCs (e.g. `https://ei-addin.company.internal`).
2. Update `.env` with production `ADDIN_ORIGIN` and `DASHBOARD_URL`, then `npm run build`.
3. In **Microsoft 365 admin center**, deploy either:
   - from **manifest URL** (recommended): `https://172.16.200.30/outlook-addin/manifest.xml`
   - or upload `email-intelligence-outlook-addin.zip` if your admin flow asks for a packaged upload
4. Assign to **everyone** or specific groups. Ensure **Conditional Access** and **certificates** allow Outlook clients to load that URL.

## Changing the add-in

- Bump `<Version>` in `manifest/manifest.template.xml` when you change ribbon or URLs (Office caches manifests).
- Rebuild and redeploy static files; if admins use manifest URL, they may need to **update** the deployment when the manifest content changes.

## Security notes

- Keep **single-tenant** Azure AD on the dashboard; validate `tid` on APIs as you already do for enterprise.
- Do not put secrets in `taskpane.js`; it is public static content.
- Replace placeholder **PNG** icons in `dist/assets` with branded assets for production (the build script writes tiny placeholder PNGs for convenience).
- The add-in does not contain secrets; it only reads Outlook context and launches your existing secured dashboard.

## Files

| Path | Purpose |
|------|--------|
| `manifest/manifest.template.xml` | Office manifest template; `{{ADDIN_ORIGIN}}`, `{{DASHBOARD_APP_DOMAIN}}` replaced at build |
| `public/taskpane.html` | Legacy task pane shell (kept for compatibility/testing) |
| `public/taskpane.js` | Legacy launcher script (task pane now points to the dashboard `/outlook` route) |
| `public/commands.html` | Ribbon **FunctionFile** (required) |
| `scripts/build.mjs` | Renders the manifest, copies static files into `dist/`, mirrors them into the dashboard public folder, and creates the zip package |

## References

- [Outlook add-ins overview](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/outlook-add-ins-overview)
- [Centralized Deployment](https://learn.microsoft.com/en-us/microsoft-365/admin/manage/centralized-deployment-faq)
