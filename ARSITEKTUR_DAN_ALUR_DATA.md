# ARSITEKTUR & ALUR DATA — Kernel Clash Arcade

Dokumen panduan ringkas alur kerja sistem untuk tim.

---

## 1. MAPPING ALUR KONEKSI

```
              [ Frontend — React + Vite ]
        Guest + Buat/Gabung Room + Ruang Tunggu
              REST  +  Socket.io (1 instance)
                          │
                          ▼
        [ Express + Socket.io — Port 3000 ]
                          │
                          ▼
        [ Supabase PostgreSQL — PgBouncer 6543 ]
```

| Bagian | Teknologi |
|---|---|
| Guest auth, buat room, gabung room | REST (fetch/axios) |
| Ruang tunggu, siap, kick, mulai turnamen | Socket.io |
| Data & validasi | Express + pg |

> Satu repo, satu aplikasi, satu `src/lib/socket.js`.

---

## 2. ATURAN PENTING ALUR DATA

1. **Header ngrok**: Semua request REST & Socket handshake WAJIB bawa header `ngrok-skip-browser-warning: true`.
2. **Identitas Player (`userId`)**:
   - Lahir saat `POST /api/auth/guest`.
   - Nama & warna avatar **di-generate otomatis** oleh frontend (tanpa layar input) — lihat `SPESIFIKASI_AUTO_NAME.md`.
   - Simpan di `localStorage.setItem('userId', data.userId)`.
   - Dipakai di REST (`POST /api/rooms`) dan Socket handshake (`emit('auth', userId)`).
3. **Pembungkusan Response REST**:
   - Sukses: `{ "success": true, "data": { ... } }` → Frontend ambil dari `res.data`.
   - Error: `{ "success": false, "error": { "code": "...", "message": "..." } }`.
4. **Event Socket.io**:
   - TIDAK dibungkus `success/data`. Direct payload.
5. **Alur dari REST ke Socket**:
   - Buat/gabung room dilakukan lewat REST, lalu navigasi ke halaman room dengan membawa **kode room** (idealnya di URL, misal `/room/:code`) + opsional objek room hasil REST untuk render awal.
   - Halaman room tetap wajib `emit('room:join', { code })`; `room:state` dari server adalah sumber kebenaran.
   - Hanya ada **satu koneksi socket** untuk seluruh aplikasi (`src/lib/socket.js`).

---

## 3. FLOW KEHIDUPAN ROOM

```
[Buat Room / Gabung] ──► [Lobi Room (Waiting)] ──► [Klik Ready (Semua Player)]
                                                               │
                                                               ▼
[Selesai Semua Minigame] ◄── [Main Minigame] ◄── [Host Klik Mulai Tournament]
```

> Jumlah & tema minigame **belum final** (minigame 2 dan 3 masih dibahas).
> Alur di atas tidak berubah berapa pun jumlah minigame-nya.

- **Host Keluar di Lobi**: Room otomatis dibubarkan (`status = finished`). Player tersisa dapat event `room:disbanded` → balik ke menu utama.
- **Player Disconnect**: Socket bersih-bersih otomatis dalam 20 detik.
