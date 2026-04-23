# Security Policy

## Reporting a Vulnerability

If you discover a security issue in the JC IMPACT dashboard — including but not limited to XSS, data exposure, exposed credentials in the repository or build output, or any issue with how Mapbox/ArcGIS requests are made — please **do not** open a public GitHub issue.

Instead, email the project maintainer directly:

**gery.linares95@gmail.com**

Please include:
- A description of the vulnerability
- Steps to reproduce (URL, browser, console output, etc.)
- Any proof-of-concept that helps us reproduce the issue

We aim to acknowledge reports within **72 hours** and provide a remediation plan within **7 days** for confirmed issues.

## Scope

In scope:
- The deployed site at `https://jcimpact.vercel.app` (and any configured custom domain)
- The source code in this repository
- The public data file at `src/data/data.json`

Out of scope:
- Issues in third-party services (Mapbox, ArcGIS, Vercel) — report those to the vendor directly
- Denial-of-service issues handled by Vercel's edge protection
- Self-XSS requiring the user to paste attacker code into the DevTools console

## Data Handling Notes

This site publishes a subset of JCPD incident data that is **already approved for public release**. If you believe a specific record contains personally identifiable information (officer/victim/suspect names, license plates, VINs, specific case numbers, etc.) that should not be public, please report it via the email above — we will investigate and remove or redact the record.

## Supported Versions

Only the latest `main` branch deployed to production is supported. Previous deployments in Vercel's deployment history are retained for rollback purposes only.
