# R2 Storage Panel

A self-hostable file manager for **Cloudflare R2**, built with Express.js and a modern Tailwind CSS interface. It ships with secure JWT authentication, a public API guarded by API keys, drag-and-drop uploads, WebP conversion, and storage statistics.

> Works as a standalone Node server or as Vercel serverless functions.

## Features

- **Secure authentication** — JWT access & refresh tokens stored in HTTP-only cookies
- **File uploads** — drag & drop or file picker with progress feedback
- **File management** — list, download, and delete files with pagination
- **Sharing** — generate public URLs and temporary presigned URLs
- **WebP conversion** — convert images to WebP on upload (via `sharp`)
- **Storage stats** — capacity and file-count dashboard
- **Public API** — API-key protected endpoints for external integrations
- **Modern UI** — responsive interface with Tailwind CSS and Font Awesome

## Tech Stack

- **Backend:** Node.js + Express, JWT, bcryptjs
- **Frontend:** Vanilla JavaScript, Tailwind CSS, Font Awesome
- **Storage:** Cloudflare R2 (S3-compatible, via AWS SDK v3)
- **Deployment:** standalone Node or Vercel serverless functions

## Requirements

- Node.js >= 22
- A Cloudflare R2 bucket and access credentials

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example file and fill in your own values:

```bash
cp .env.example .env
```

```env
# Server
PORT=3000
NODE_ENV=development

# Cloudflare R2
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=https://your-public-bucket-url.r2.dev

# Authentication — CHANGE THESE BEFORE DEPLOYING
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
ACCESS_TOKEN_SECRET=use-a-long-random-string-min-32-chars
REFRESH_TOKEN_SECRET=use-a-different-long-random-string

# Public API
API_KEY=generate-a-strong-random-api-key
```

> **Security:** The default admin credentials are placeholders. Always set a strong password and unique 32+ character secrets before exposing the app. Never commit your `.env` file — it is gitignored by default.

### 3. Run

```bash
# Auto-reload (development)
npm run dev

# Plain start
npm start
```

The app runs at `http://localhost:3000` and redirects to the login page.

## Authentication

The dashboard is protected by username/password login backed by JWT:

- Access token (short-lived) and refresh token (long-lived)
- Tokens are delivered as HTTP-only cookies, never in the response body
- Automatic token refresh and protected routes
- Auto logout on session expiry

The public API uses a separate API key for machine-to-machine access.

## API Reference

### Authentication routes

```
POST /auth/login     Log in with username/password
POST /auth/logout    Log out and clear cookies
POST /auth/refresh   Refresh the access token (uses refresh cookie)
GET  /auth/status    Check authentication status
```

### Internal file routes (require a JWT session cookie)

```
POST   /r2/upload          Upload a file (web UI)
POST   /r2/upload-webp      Upload and convert an image to WebP (web UI)
GET    /r2/files            List files with pagination
GET    /r2/download/:key    Download a file
GET    /r2/presigned/:key   Get a temporary (presigned) URL
DELETE /r2/files/:key       Delete a file
```

### Public API routes (require an API key, or a JWT session where noted)

```
POST   /api/upload             Upload a single file (API key)
POST   /api/upload-multiple    Upload up to 10 files (API key)
POST   /api/files/upload       Upload a single file (API key or JWT)
POST   /api/files/upload-webp  Upload and convert an image to WebP (API key or JWT)
GET    /api/files              List files with pagination (API key or JWT)
DELETE /api/files/:key         Delete a file (API key or JWT)
GET    /api/stats/storage      Detailed storage statistics (API key or JWT)
GET    /api/stats/quick        Quick storage stats (API key or JWT)
GET    /api/info               API information
GET    /api/apikey             Return the configured API key (admin JWT session only)
```

> **Note:** `GET /api/apikey` is intended only to populate the in-app API docs for a logged-in admin. It requires a valid JWT session and never responds to unauthenticated or cross-origin requests.

### Using the API

Pass the API key as a header — either form works:

```bash
# X-API-Key header
curl -H "X-API-Key: your-api-key" -X POST http://localhost:3000/api/upload

# Authorization Bearer
curl -H "Authorization: Bearer your-api-key" -X POST http://localhost:3000/api/upload
```

Upload examples:

```bash
# Single file
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -F "file=@/path/to/file.jpg" \
  http://localhost:3000/api/upload

# Multiple files (max 10)
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -F "files=@/path/to/file1.jpg" \
  -F "files=@/path/to/file2.png" \
  http://localhost:3000/api/upload-multiple

# Upload and convert to WebP (optional quality 1-100, default 80)
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -F "image=@/path/to/image.png" \
  -F "quality=80" \
  http://localhost:3000/api/files/upload-webp
```

Full interactive API docs are available at `/api-docs` after logging in.

## Frontend

Accessible at `http://localhost:3000`:

- **File manager** — responsive dashboard with drag & drop, type filtering, search, pagination, and image preview
- **WebP converter** — `/webp-converter` utility page
- **Stats dashboard** — `/stats` capacity and file-count overview
- **File operations** — copy public URL, generate temporary presigned URL (default 1 hour, override with `?expires=<seconds>`), download, and delete

## Upload Limits

- Internal web UI (`/r2/upload`): 25 MB per file by default
- Serverless API (`/api/upload`, `/api/upload-multiple`): 4 MB per file (Vercel Hobby compatibility)
- WebP endpoints accept an `image` field and an optional `quality` parameter (default 80)

## Deployment

### Vercel

1. Push the repository to GitHub.
2. Import the project at [vercel.com](https://vercel.com).
3. Set the environment variables (same keys as `.env`) in the Vercel dashboard.
4. Deploy — Vercel builds the serverless functions in `api/` automatically.

### Standalone Node

```bash
NODE_ENV=production npm start
```

Put it behind a reverse proxy (nginx, Caddy) with HTTPS enabled.

### Production checklist

- [ ] Change `ADMIN_USERNAME` / `ADMIN_PASSWORD`
- [ ] Set strong, unique `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET` (32+ chars)
- [ ] Set a strong `API_KEY`
- [ ] Set `NODE_ENV=production`
- [ ] Serve over HTTPS and configure CORS origins for your domain

## Project Structure

```
r2-storage-panel/
├── api/                    # Serverless functions / Express handlers
│   ├── utils.js            # Shared utilities (auth, CORS, responses)
│   ├── r2-client.js        # R2 (S3-compatible) client
│   ├── auth.js             # Auth endpoints (login/refresh/logout/status)
│   ├── r2.js               # Internal file operations (JWT)
│   ├── files.js            # API-key/JWT file operations
│   ├── upload.js           # API-key single upload
│   ├── upload-multiple.js  # API-key multiple upload
│   ├── stats.js            # Storage statistics
│   ├── apikey.js           # Return API key (admin JWT only)
│   └── info.js             # API info
├── public/                 # Static frontend
│   ├── index.html          # File manager
│   ├── login.html          # Login page
│   ├── webp-converter.html # WebP converter UI
│   ├── stats.html          # Stats dashboard
│   └── api-docs.html       # API documentation
├── server.js               # Express entry point (standalone)
├── vercel.json             # Vercel configuration
└── .env.example            # Environment template
```

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before opening a pull request. For security issues, see [SECURITY.md](SECURITY.md).

## License

Released under the [MIT License](LICENSE).
