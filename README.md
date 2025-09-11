# Cloudflare R2 File Service

Layanan pengunggahan file sederhana menggunakan Express.js dengan antarmuka pengguna modern berbasis Tailwind CSS, yang khusus menggunakan Cloudflare R2 untuk penyimpanan cloud. Dilengkapi dengan sistem autentikasi JWT yang aman.

## Fitur Utama
- **Autentikasi Aman**: Sistem login/logout dengan JWT access & refresh tokens
- **Unggah file**: Drag & drop atau pemilihan file dengan progress bar
- **Manajemen File**: Tampilkan, unduh, dan hapus file dengan pagination
- **Sharing**: Buat URL publik dan temporary URL untuk berbagi file
- **UI Modern**: Antarmuka responsif dengan Tailwind CSS dan Font Awesome
- **Security**: HTTP-only cookies, token refresh otomatis

## Cara Setup

### 1. Instal dependensi
```bash
npm install
```

### 2. Variabel Lingkungan
Salin file `.env.example` ke `.env` dan sesuaikan dengan konfigurasi Anda:
```bash
cp .env.example .env
```

Edit file `.env` dengan konfigurasi R2 Anda:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Cloudflare R2 Configuration
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=https://your-public-bucket-url.r2.dev

# Authentication Configuration
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ACCESS_TOKEN_SECRET=your-super-secret-access-token-key-change-this-in-production
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-key-change-this-in-production

# API Configuration
API_KEY=your-api-key-for-external-access-change-this
```

### 3. Jalankan aplikasi

#### Untuk Development Lokal (tanpa Vercel CLI):
```bash
# Development dengan auto-reload
npm run dev

# Atau jalankan biasa
npm start
```

#### Untuk Testing dengan Vercel (jika sudah install Vercel CLI):
```bash
# Development dengan Vercel
npm run vercel:dev

# Deploy ke production
npm run vercel:deploy
```

Aplikasi akan berjalan di:
- **Local development**: `http://localhost:3000`
- **Vercel development**: `http://localhost:3000` (atau port yang ditampilkan Vercel)

## Deployment ke Vercel

### Persiapan
1. Pastikan semua file sudah menggunakan `module.exports` (bukan `export default`)
2. Set environment variables di Vercel dashboard
3. Pastikan `vercel.json` sudah dikonfigurasi dengan benar

### Deploy
```bash
# Install Vercel CLI (opsional, bisa deploy via Git)
npm i -g vercel

# Deploy
vercel --prod
```

Atau push ke Git repository yang sudah terhubung dengan Vercel untuk auto-deployment.

## Authentication

### Default Credentials
- **Username**: `admin`
- **Password**: `admin123`

### Security Features
- JWT Access Token (15 menit)
- JWT Refresh Token (7 hari)
- HTTP-only cookies untuk keamanan
- Automatic token refresh
- Protected routes

### Login Process
1. Akses `http://localhost:3000` (akan redirect ke login)
2. Masukkan username dan password
3. Setelah login berhasil, akan redirect ke dashboard file manager

## API Endpoints

### Authentication Routes
```
POST /auth/login     - Login dengan username/password
POST /auth/logout    - Logout dan clear cookies
POST /auth/refresh   - Refresh access token (dengan refresh token di cookie)
GET  /auth/status    - Check authentication status
```

### Internal (Frontend) File Routes (Requires JWT Auth via Cookie)
```
POST   /r2/upload              - Upload file (via web UI)
POST   /r2/upload-webp         - Upload & convert image to WebP (via web UI)
GET    /r2/files               - List files with pagination (web UI)
GET    /r2/download/:key       - Download file
GET    /r2/presigned/:key      - Get temporary URL
DELETE /r2/files/:key          - Delete file
```

### Public API Routes (Requires API Key)
```
POST   /api/upload             - Upload single file (API key)
POST   /api/upload-multiple    - Upload multiple files (max 10, API key)
POST   /api/files/upload       - Upload single file (API key atau JWT)
POST   /api/files/upload-webp  - Upload image and convert to WebP (API key; juga mendukung JWT via cookie)
GET    /api/files              - List files with pagination (API key atau JWT)
DELETE /api/files/:key         - Delete file (API key atau JWT)
GET    /api/stats/storage      - Get detailed storage statistics (API key atau JWT)
GET    /api/stats/quick        - Get quick storage stats (API key atau JWT)
GET    /api/apikey             - Return configured API key (PUBLIC for docs/dev; jangan aktifkan di production)
GET    /api/info               - API information
```

## API Integration

### API Authentication
API eksternal menggunakan API Key untuk autentikasi. Sertakan API key dalam header:

```bash
# Option 1: X-API-Key header
curl -H "X-API-Key: your-api-key" \
     -X POST \
     http://localhost:3000/api/upload

# Option 2: Authorization Bearer
curl -H "Authorization: Bearer your-api-key" \
     -X POST \
     http://localhost:3000/api/upload
```

### Upload File via API
```bash
# Single file upload
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -F "file=@/path/to/your/file.jpg" \
  http://localhost:3000/api/upload

# Multiple files upload
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -F "files=@/path/to/file1.jpg" \
  -F "files=@/path/to/file2.png" \
  http://localhost:3000/api/upload-multiple

# Upload & convert to WebP (opsional param: quality [1-100], default 80)
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -F "image=@/path/to/image.png" \
  -F "quality=80" \
  http://localhost:3000/api/files/upload-webp
```

### API Documentation
Akses dokumentasi API lengkap di: `http://localhost:3000/api-docs.html` atau `http://localhost:3000/api-docs` (setelah login)

## Frontend Features

Frontend dapat diakses di `http://localhost:3000` dan menyediakan:

### Dashboard File Manager (Internal, JWT Auth)
- **Responsive Design**: Bekerja optimal di desktop dan mobile
- **Drag & Drop Upload**: Upload multiple files sekaligus
- **File Filtering**: Filter berdasarkan tipe file (gambar, dokumen, audio, video, archive)
- **Search**: Pencarian file berdasarkan nama
- **Pagination**: Load more untuk performa optimal
- **Image Preview**: Preview gambar dengan zoom in/out

### Halaman Tambahan
- **WebP Converter**: Halaman utilitas untuk konversi gambar ke WebP via UI di `/webp-converter` (backend: `POST /r2/upload-webp`)
- **Stats Dashboard**: Ikhtisar kapasitas dan jumlah file di `/stats` (backend: `GET /api/stats/quick` dan `GET /api/stats/storage`)

### File Operations
- **Public URL**: Copy direct link ke file
- **Temporary URL**: Generate presigned URL (default 1 jam; dapat diubah dengan query `?expires=<detik>`, mis. 86400 untuk 24 jam)
- **Download**: Download file langsung
- **Delete**: Hapus file dengan konfirmasi

### Security UI
- **Login Page**: Modern login interface
- **Auto Logout**: Otomatis logout saat session expired
- **Toast Notifications**: Feedback untuk semua operasi

## Struktur Aplikasi
```
file-service/
├── .env.example              # Template konfigurasi
├── package.json              # Dependencies
├── README.md                 # Dokumentasi
├── api/                      # Vercel serverless functions
│   ├── utils.js              # Shared utilities
│   ├── r2-client.js          # R2 client for serverless
│   ├── auth.js               # Authentication endpoints handler (JWT login/refresh/logout/status)
│   ├── r2.js                 # Internal file operations (JWT)
│   ├── files.js              # API key/JWT file operations (list/delete/upload-webp)
│   ├── upload.js             # API key upload (single)
│   ├── upload-multiple.js    # API key upload multiple
│   ├── stats.js              # Storage statistics endpoints (API key/JWT)
│   ├── apikey.js             # Return configured API key (admin)
│   └── info.js               # API info
├── public/
│   ├── index.html            # Main UI (file manager)
│   ├── login.html            # Login page
│   ├── webp-converter.html   # WebP converter UI
│   ├── stats.html            # Stats dashboard UI
│   └── api-docs.html         # API documentation
└── vercel.json               # Vercel configuration
```

## Security Notes

### Production Deployment
1. **Change default credentials** di environment variables
2. **Set strong JWT secrets** (minimal 32 karakter)
3. **Enable HTTPS** untuk production
4. **Set NODE_ENV=production**
5. **Configure proper CORS origins**

### Environment Variables untuk Production
```env
NODE_ENV=production
ADMIN_USERNAME=your_secure_username
ADMIN_PASSWORD=your_strong_password
ACCESS_TOKEN_SECRET=very-long-random-string-for-access-tokens
REFRESH_TOKEN_SECRET=different-very-long-random-string-for-refresh-tokens
```

## Deployment ke Vercel

### Langkah Deployment

1. **Push ke GitHub repository**
2. **Connect ke Vercel**:
   - Login ke [vercel.com](https://vercel.com)
   - Import project dari GitHub
   - Pilih repository ini

3. **Set Environment Variables di Vercel**:
   ```
   R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=your_access_key_id
   R2_SECRET_ACCESS_KEY=your_secret_access_key
   R2_BUCKET_NAME=your_bucket_name
   R2_PUBLIC_URL=https://your-public-bucket-url.r2.dev
   
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your_secure_password
   ACCESS_TOKEN_SECRET=your-super-secret-access-token-key
   REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-key
   API_KEY=your-api-key-for-external-access
   ```

4. **Deploy**: Vercel akan otomatis deploy project

### Struktur Serverless
```
file-service/
├── api/                      # Vercel serverless functions
│   ├── utils.js              # Shared utilities
│   ├── r2-client.js          # R2 client for serverless
│   ├── auth-middleware.js    # JWT middleware
│   ├── auth-routes.js        # Authentication endpoints
│   ├── r2.js                 # Internal file operations (JWT)
│   ├── files.js              # API key file operations
│   ├── upload.js             # API key upload
│   ├── upload-multiple.js    # API key upload multiple
│   └── info.js               # API info
├── public/                   # Static files
│   ├── index.html            # Main UI
│   ├── login.html            # Login page
│   └── api-docs.html         # API documentation
└── vercel.json               # Vercel configuration
```

### Testing Local Development
```bash
# Install Vercel CLI
npm i -g vercel

# Run local development server
vercel dev

# Access at http://localhost:3000
```

## Teknologi yang Digunakan
- **Backend**: Vercel Serverless Functions, JWT, bcryptjs
- **Frontend**: Vanilla JavaScript, Tailwind CSS, Font Awesome
- **Storage**: Cloudflare R2 (S3-compatible)
- **Security**: HTTP-only cookies, CORS, JWT refresh mechanism
- **Deployment**: Vercel (Full-stack serverless)

## Catatan & Limitasi Upload
- Endpoint internal (web UI) `/r2/upload` menggunakan limit ukuran default 25MB per file.
- Endpoint API serverless `/api/upload` dan `/api/upload-multiple` menggunakan limit 4MB per file (kompatibilitas Vercel Hobby).
- Endpoint konversi WebP:
  - `/r2/upload-webp` (UI internal) menerima image dan mengonversi ke WebP dengan parameter opsional `quality` (default 80).
  - `/api/files/upload-webp` (API) fungsionalitas setara, memerlukan field `image` dan opsional `quality`.
