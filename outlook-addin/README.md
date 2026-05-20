# Email Intelligence — Outlook add-in (internal launcher)

This folder contains a **minimal Office Add-in** that adds a **ribbon button** and **task pane** in Outlook. The task pane opens your **existing** Next.js dashboard in the **default browser** (`window.open`). No UI rebuild.

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

Output: `dist/` (`manifest.xml`, `taskpane.html`, `taskpane.js`, `commands.html`, assets, etc.).

Optional: parse the built manifest locally (does not call the Office validation gateway):

```bash
npm run manifest:info
```

The `office-addin-manifest validate` command posts to Microsoft's validation service, which often rejects **localhost** manifests; use **HTTPS internal URLs** when validating for production.

## Serve locally (Docker)

From the **repository root** (after `npm run build` in `outlook-addin`):

```bash
docker compose --profile outlook-addin up -d outlook_addin
```

Add-in static files: **http://localhost:3010/manifest.xml**

## Sideload for testing

1. Outlook **Windows**: **File → Manage Add-ins** (or **Get Add-ins → My add-ins → Add a custom add-in → Add from File**) and pick `dist/manifest.xml`, or use **Upload My Add-in** per your Outlook version.
2. **Outlook on the web**: **Settings → Mail → Customize actions → Add-ins → My add-ins → Custom add-ins** (wording varies) and upload the manifest.
3. Open a message; use the **Home** ribbon **Email Intelligence** group → **Dashboard** to show the task pane, then **Open dashboard**.

If the browser does not open, check **popup blockers** for the add-in origin.

## Organization-wide deployment (production)

1. Host `dist/` on an **internal HTTPS** origin trusted by all PCs (e.g. `https://ei-addin.company.internal`).
2. Update `.env` with production `ADDIN_ORIGIN` and `DASHBOARD_URL`, then `npm run build`.
3. In **Microsoft 365 admin center**, use **Integrated apps** / **Centralized Deployment** to deploy the add-in from **manifest URL** (recommended):  
   `https://ei-addin.company.internal/manifest.xml`
4. Assign to **everyone** or specific groups. Ensure **Conditional Access** and **certificates** allow Outlook clients to load that URL.

## Changing the add-in

- Bump `<Version>` in `manifest/manifest.template.xml` when you change ribbon or URLs (Office caches manifests).
- Rebuild and redeploy static files; if admins use manifest URL, they may need to **update** the deployment when the manifest content changes.

## Security notes

- Keep **single-tenant** Azure AD on the dashboard; validate `tid` on APIs as you already do for enterprise.
- Do not put secrets in `taskpane.js`; it is public static content.
- Replace placeholder **PNG** icons in `dist/assets` with branded assets for production (the build script writes tiny placeholder PNGs for convenience).

## Files

| Path | Purpose |
|------|--------|
| `manifest/manifest.template.xml` | Office manifest template; `{{ADDIN_ORIGIN}}`, `{{DASHBOARD_APP_DOMAIN}}` replaced at build |
| `public/taskpane.html` | Task pane shell |
| `public/taskpane.js` | Opens `DASHBOARD_URL` in a new window |
| `public/commands.html` | Ribbon **FunctionFile** (required) |
| `scripts/build.mjs` | Renders manifest + copies static files into `dist/` |

## References

- [Outlook add-ins overview](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/outlook-add-ins-overview)
- [Centralized Deployment](https://learn.microsoft.com/en-us/microsoft-365/admin/manage/centralized-deployment-faq)
