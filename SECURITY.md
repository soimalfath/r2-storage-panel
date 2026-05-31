# Security Policy

## Supported Versions

This project is under active development. Security fixes are applied to the
latest released version on the `main` branch.

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, report it privately using GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
("Report a vulnerability" under the repository's **Security** tab).

When reporting, please include:

- A description of the vulnerability and its impact
- Steps to reproduce
- Affected version or commit
- Any suggested mitigation, if known

You can expect an initial acknowledgement within 72 hours. Once the issue is
confirmed, a fix will be prepared and a coordinated disclosure timeline agreed.

## Security Best Practices for Operators

This software handles file storage credentials and access tokens. When you
deploy it:

- **Change all default credentials** (`ADMIN_USERNAME`, `ADMIN_PASSWORD`).
- **Use strong, unique secrets** for `ACCESS_TOKEN_SECRET` and
  `REFRESH_TOKEN_SECRET` (32+ random characters each).
- **Use a strong, random `API_KEY`** and rotate it if exposed.
- **Never commit your `.env` file.** It is gitignored by default.
- **Serve over HTTPS only** in production and set `NODE_ENV=production`.
- **Restrict CORS origins** to the domains you control.
- Treat R2 access keys as secrets and scope them to the minimum required
  permissions.

## Known Design Notes

- Authentication tokens are stored in HTTP-only cookies, never in
  `localStorage` or response bodies.
- `GET /api/apikey` returns the configured API key only to an authenticated
  admin session (valid JWT cookie). It must never be exposed publicly.
