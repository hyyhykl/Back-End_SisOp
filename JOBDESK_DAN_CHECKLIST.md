# JOBDESK & TASK CHECKLIST — Kernel Clash Arcade

Dokumen pembagian tugas Frontend & Backend.

---

## 👥 PEMBAGIAN PERAN

- **Backend**: REST API, Socket.io Handler, DB Supabase PostgreSQL, Logic Algoritma Minigame OS, Deployment Heroku.
- **Frontend**: Seluruh halaman React — guest, buat/gabung room, daftar room, ruang tunggu real-time, siap, kick, mulai turnamen, popup bubarkan room.

---

## 📋 CHECKLIST PENGERJAAN PER MODUL

### FASE 1: AUTH, LOBBY & ROOM (Sedang Berjalan)

#### Backend
- [x] Schema DB `users`, `rooms`, `room_players`, `minigame_scores`, `game_history`
- [x] REST Auth Guest (`POST /api/auth/guest`)
- [x] REST Room (`GET /api/rooms`, `POST /api/rooms`, `GET /api/rooms/:code`)
- [x] Socket Lobby (`auth`, `room:join`, `room:leave`, `room:set_ready`, `room:kick`)
- [x] Auto-leave & Cleanup disconnect
- [x] Validasi `USER_NOT_FOUND` (404)

#### Frontend — Halaman Guest, Daftar Room & Ruang Tunggu
- [x] Implementasi header `ngrok-skip-browser-warning` (terverifikasi: GET /api/rooms berhasil ambil data via ngrok)
- [x] Halaman Gabung Room (`GET /api/rooms`, `GET /api/rooms/:code`)
- [x] Halaman Buat Room (`POST /api/rooms`)
- [x] Simpan `userId` di `localStorage`
- [x] Daftar room real-time: listener `rooms:updated` + polling cadangan 10 detik
- [x] `socket.io-client` terpasang di project
- [x] Event backend `rooms:updated` tersedia (broadcast saat daftar room berubah)
- [ ] Handling error `USER_NOT_FOUND` (clear localStorage jika DB di-reset)
- [ ] Auto-name & warna avatar acak (tanpa layar input) — lihat `SPESIFIKASI_AUTO_NAME.md`
- [ ] Buat modul `src/lib/socket.js` berisi satu instance socket + `extraHeaders` ngrok
- [ ] Pastikan yang terpasang `socket.io-client` v4, BUKAN `socket.io` (server)

##### Ruang Tunggu (Socket)
- [ ] Ganti halaman room placeholder dengan halaman room final
- [ ] Layout ruang tunggu sesuai Figma (`game - Lobi (Host)` / `game - Lobi (Tamu)`)
- [ ] Socket handshake (`auth` + `room:join`) dengan `extraHeaders` ngrok
- [ ] Daftar pemain real-time (event `room:state`, `room:player_joined`)
- [ ] Tombol siap / batal siap (`room:set_ready`)
- [ ] Kick pemain, host saja (`room:kick`)
- [ ] Tombol mulai turnamen, host saja (`tournament:start`)
- [ ] Popup konfirmasi bubarkan room saat host keluar
- [ ] Reaksi saat room bubar / pemain keluar (`room:disbanded`, `room:player_left`)

> **Alur di frontend (satu aplikasi):** buat/gabung room lewat REST
> (`POST /api/rooms` atau `GET /api/rooms/:code`). Setelah sukses, navigasi ke
> halaman room dengan membawa **kode room** (idealnya di URL, misal `/room/:code`)
> plus opsional objek room hasil REST untuk render awal. Halaman room lalu
> membuka socket dan `emit('room:join', { code })`.
>
> Jangan membuka dua koneksi socket untuk room yang sama — pemain akan terdaftar
> dobel. Gunakan selalu satu instance dari `src/lib/socket.js`.

---

### FASE 2: MINIGAME 1 — DEADLOCK DUNGEON (Algoritma Banker / Resource Allocation)

#### Backend
- [ ] Endpoint / Event generator state resource & claim matrix
- [ ] Validasi Safe State / Deadlock detection di server
- [ ] Event `game:input` & sync score per player

#### Frontend
- [ ] Visualisasi alokasi resource & RAG (Resource Allocation Graph)
- [ ] UI input alokasi resource player
- [ ] Layar papan skor mini per ronde

---

### FASE 3: MINIGAME 2 & 3 — BELUM DITENTUKAN

> **Status:** Belum final. Modul, algoritma, dan mekanik masih dibahas.
> Jangan dikerjakan sebelum desainnya fix. Bagian ini sengaja dikosongkan.

Hal yang perlu diputuskan dulu:
- [ ] Tema Sistem Operasi untuk masing-masing minigame
- [ ] Algoritma/strategi yang divalidasi server (minimal 3 per modul)
- [ ] Bentuk visualisasi langkah demi langkah
- [ ] Metrik kinerja yang diperbandingkan

---

### FASE 4: PODIUM & LEADERBOARD (Final)

#### Backend
- [ ] Aggregator skor semua minigame dari `minigame_scores`
- [ ] Simpan riwayat ke `game_history`
- [ ] Reset status room ke finished

#### Frontend
- [ ] Layar Podium Juara 1, 2, 3, 4
- [ ] Tombol Kembali ke Lobi / Replay
