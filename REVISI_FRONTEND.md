# REVISI FRONTEND — Fix CORS + ngrok

> **Tanggal:** 11 Nov 2026
> **Penyebab error:** `No 'Access-Control-Allow-Origin' header is present` padahal status 200 OK.
> **Akar masalah:** Request TIDAK PERNAH sampai ke backend. Ngrok free tier menyisipkan
> "browser warning page" untuk semua request dari browser. Halaman itu (status 200)
> tidak punya header CORS, makanya browser blokir. Backend sudah dibenerin
> (CORS allow-all di development), tapi frontend WAJIB kirim header khusus agar
> request bisa menembus halaman warning ngrok.

---

## 1. TAMBAHKAN HEADER `ngrok-skip-browser-warning` DI SEMUA REQUEST

### A. Kalau pakai `fetch`

Ubah SEMUA pemanggilan fetch ke backend. Contoh sebelum:

```js
// ❌ SEBELUM
const res = await fetch(`${API_BASE}/rooms`);
```

Sesudah:

```js
// ✅ SESUDAH
const res = await fetch(`${API_BASE}/rooms`, {
  headers: { 'ngrok-skip-browser-warning': 'true' },
});
```

### B. Kalau pakai `axios` (LEBIH MUDAH — sekali aja)

Cukup set di satu tempat saat bikin instance axios, semua request otomatis kebawa:

```js
// src/api.js atau src/lib/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    'ngrok-skip-browser-warning': 'true',
  },
});

export default api;
```

Pemanggilan selanjutnya tinggal:

```js
import api from './api';

// Otomatis sudah bawa header
const rooms = await api.get('/rooms');
const user  = await api.post('/auth/guest', { name, avatarColor });
const room  = await api.post('/rooms', { name, isPrivate, userId });
```

### C. Kalau fetch-nya dibungkus helper sendiri

Bikin helper sekali, pakai di semua tempat:

```js
// src/lib/api.js
const API_BASE = import.meta.env.VITE_API_BASE_URL;

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers || {}),
    },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || 'Request gagal');
  return json.data;
}
```

Pemanggilan:

```js
import { apiFetch } from './lib/api';

const rooms = await apiFetch('/rooms');
const user  = await apiFetch('/auth/guest', {
  method: 'POST',
  body: JSON.stringify({ name: 'PlayerOne', avatarColor: 'pink' }),
});
```

---

## 2. SOCKET.IO — WAJIB PAKAI `extraHeaders`

### Sebelum (❌ bermasalah lewat ngrok):

```js
const socket = io(VITE_SOCKET_URL, {
  auth: { userId },
  transports: ['websocket'],   // ❌ JANGAN paksa websocket-only
});
```

### Sesudah (✅ benar):

```js
import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_SOCKET_URL, {
  auth: { userId: localStorage.getItem('userId') },
  extraHeaders: {
    'ngrok-skip-browser-warning': 'true',
  },
  // JANGAN set transports — biarkan default (mulai dari polling, lalu upgrade WS)
});
```

**Kenapa jangan `transports: ['websocket']`:**
- `extraHeaders` cuma terbawa oleh transport **polling** (HTTP).
- Browser tidak bisa kirim custom header saat handshake WebSocket.
- Kalau upgrade ke websocket gagal karena ngrok, Socket.io otomatis tetap
  jalan di polling — lobi tetap berfungsi normal.

---

## 3. FILE `.env.local` (atau `.env`) FRONTEND

Pastikan variabelnya benar (prefix `VITE_` wajib untuk Vite):

```env
VITE_API_BASE_URL=https://subconvolutely-isodynamic-evangelina.ngrok-free.dev/api
VITE_SOCKET_URL=https://subconvolutely-isodynamic-evangelina.ngrok-free.dev
```

Catatan:
- `VITE_API_BASE_URL` → ada `/api` di belakang.
- `VITE_SOCKET_URL`   → TANPA `/api`.
- Setiap ganti isi `.env` → **restart `npm run dev`** (Vite tidak hot-reload env).
- URL ngrok **berubah tiap restart ngrok** di sisi backend. Kalau backend
  restart ngrok-nya, minta URL baru ke backend lalu update file ini.

---

## 4. SIMPAN IDENTITAS GUEST (supaya tidak hilang saat refresh)

**Keputusan produk:** tidak ada layar input nama. Nama & warna dibuat otomatis
saat pertama kali app dibuka. Detail lengkap di `SPESIFIKASI_AUTO_NAME.md`.

Setelah POST `/api/auth/guest` sukses:

```js
// Simpan sekali
localStorage.setItem('userId', data.userId);
localStorage.setItem('userName', data.name);
localStorage.setItem('avatarColor', data.avatarColor);

// Saat app load, cek dulu:
const userId = localStorage.getItem('userId');
if (!userId) {
  // belum ada sesi → generate nama acak (CepatKernel, TenangBuffer, ...)
  // lalu POST /api/auth/guest
}
```

---

## 5. CARA VERIFIKASI SUDAH BERES

1. Buka frontend di browser → **F12** → tab **Network**.
2. Lakukan aksi yang manggil `/api/rooms`.
3. Klik request `/api/rooms` → lihat **Response Headers**. Harus muncul:

   ```
   Access-Control-Allow-Origin: https://trident-savings-patronize.ngrok-free.dev
   ```

4. Kalau di tab **Response** masih keluar halaman HTML berisi tulisan
   "ngrok" → header `ngrok-skip-browser-warning` BELUM terpasang.

### Alternatif cek manual (tanpa frontend)

Buka langsung di tab browser:

```
https://subconvolutely-isodynamic-evangelina.ngrok-free.dev/api/health
```

Harusnya muncul JSON `{"status":"ok",...}`. Kalau muncul halaman warning
ngrok dulu, klik **"Visit Site"** — setelah itu request dari browser yang
sama akan lolos (tapi ini hanya berlaku per browser, header tetap wajib
dipasang untuk solusi permanen).

---

## 6. FORMAT DATA BACKEND ( Pengingat )

Semua response REST dibungkus:

```json
{ "success": true,  "data": { ... } }
{ "success": false, "error": { "code": "...", "message": "..." } }
```

Jadi baca datanya lewat `json.data`, contoh:

```js
const res = await fetch(`${API_BASE}/rooms`, {
  headers: { 'ngrok-skip-browser-warning': 'true' },
});
const json = await res.json();
const rooms = json.data;   // ← array room ada di .data
```

Event Socket.io TIDAK dibungkus `success/data` — payload langsung.
Daftar event:

| Emit dari client | Payload | Balasan server |
|---|---|---|
| `auth` | `userId` (string) | — |
| `room:join` | `{ code }` | `room:state`, `room:player_joined`, `toast` |
| `room:leave` | `{ code }` | `room:player_left` / `room:disbanded` |
| `room:set_ready` | `{ code, isReady }` | `room:player_ready` |
| `room:kick` | `{ code, targetUserId }` | `room:kicked`, `room:player_left` |
| `tournament:start` | `{ code }` | `tournament:starting` |

---

## 7. RINGKASAN TODO FRONTEND

- [ ] Pasang header `ngrok-skip-browser-warning: 'true'` di semua REST request
      (paling gampang: satu instance axios / satu helper fetch).
- [ ] Socket.io client: tambah `extraHeaders` + hapus `transports: ['websocket']`.
- [ ] Pastikan `.env` pakai prefix `VITE_` dan restart dev server tiap ganti env.
- [ ] Simpan `userId` ke `localStorage` setelah POST `/api/auth/guest`.
- [ ] Baca response REST lewat `json.data` (ada pembungkus `success/data`).
- [ ] Verifikasi di Network tab: header `Access-Control-Allow-Origin` muncul.
- [ ] Auto-name & warna avatar acak, tanpa layar input — lihat `SPESIFIKASI_AUTO_NAME.md`.

---

## 8. PENANGANAN SESI KEDALUWARSA (`USER_NOT_FOUND`)

**Masalah:** Kalau data user di database dihapus manual (reset via SQL), `userId`
lama di localStorage jadi tidak valid. Backend sekarang tidak lagi balas error 500
FK mentah, tapi balas error yang jelas:

**REST** (`POST /api/rooms`) — status 404:
```json
{
  "success": false,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "Sesi tamu sudah tidak berlaku. Refresh halaman dan masukkan nama lagi."
  }
}
```

**Socket** (event `auth`) — toast error:
"Sesi tamu kedaluwarsa. Refresh halaman dan masukkan nama lagi."

### Yang harus frontend lakukan saat menangkap error ini:

1. Hapus `localStorage` (userId, userName, avatarColor).
2. Reload halaman — aplikasi otomatis membuat identitas baru (auto-name).
   Tidak perlu layar input nama.

Contoh implementasi:

```js
try {
  await api.post('/rooms', { name, isPrivate, userId });
} catch (err) {
  const code = err.response?.data?.error?.code;
  if (code === 'USER_NOT_FOUND') {
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    localStorage.removeItem('avatarColor');
    // Reload → app membuat identitas guest baru otomatis
    window.location.reload();
  } else {
    // tampilkan pesan error lain
  }
}
```

> Tips: bisa juga cek di saat app load — kalau ada `userId` di localStorage,
> panggil `POST /api/auth/guest` untuk memverifikasi... atau cukup tangani
> error saat pertama kali gagal (lebih hemat request).
