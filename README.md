# Kernel Clash Arcade — Backend

Backend REST API dan Socket.IO untuk game edukasi Sistem Operasi berbasis multiplayer 4 pemain. Seluruh aturan lobby, eksekusi ronde, penilaian, dan metrik simulasi dijalankan secara terpusat di server agar hasilnya konsisten untuk semua klien.

## Deskripsi Sistem

Backend berjalan dalam satu aplikasi dan satu port. Endpoint REST dan koneksi Socket.IO dilayani dari origin yang sama.

### Game 1 — Stick Brawl

Server mengelola tiga ronde dengan mekanisme berbeda:

| Ronde | Mekanisme | Perilaku Server |
|---|---|---|
| 1 | Tanpa Aturan / Race Condition | Tidak ada pembatasan akses. Tabrakan antar pemain memicu `BOOM` dan dicatat sebagai langkah kejadian. |
| 2 | Mutex | Hanya satu pemain yang memegang kunci gerbang pada satu waktu. Permintaan lain ditolak sampai kunci dilepas. |
| 3 | Semaphore | Dua slot kunci tersedia, sehingga dua pemain boleh masuk bersamaan. |

Host dapat mengatur durasi ronde sebelum pertandingan dimulai. Setiap aksi penting dikirim ke klien sebagai **Log Kejadian** bernomor langkah melalui event `stickbrawl:state`, `stickbrawl:tick`, dan `stickbrawl:chest_result`.

### Game 2 — Deadlock Dungeon / Resource Ordering

Server menjalankan tiga ronde dengan algoritma berbeda:

| Ronde | Algoritma | Perilaku Server |
|---|---|---|
| 1 | No Prevention | Circular wait dapat terjadi dan menghasilkan deadlock. |
| 2 | Resource Ordering | Resource hanya boleh diambil menurut urutan yang ditentukan. |
| 3 | Banker's Algorithm | Permintaan dikabulkan hanya jika keadaan sistem tetap aman. |

Deadlock hanya dideteksi pada ronde 1. Ronde 2 dan 3 memakai pencegahan, sehingga jumlah deadlock bernilai `0`.

Metrik simulasi yang dikirim ke klien:

- `deadlocks`
- `finishedPlayers`
- `avgFinishTimeSec`
- `rejectedRequests`

Data tersebut dikirim lewat `jellyfish:round_end` dan `jellyfish:game_end`. Tidak ada nilai metrik yang ditulis statis di frontend.

### Aturan Lobby

- Kapasitas room tepat 4 pemain.
- Warna pemain (Merah, Hijau, Biru, Kuning) ditetapkan server berdasarkan kursi saat join.
- Permainan hanya dimulai jika room penuh dan semua tamu sudah `ready`.
- Transisi antar ronde dan antar game dikendalikan host.

### Penilaian

```text
Game 1  = +1 per pukulan
Game 2  = 100 + 50 * held + 200 * exited + 100 * no_deadlock
          + speedBonus[100, 75, 50, 25] - 15 * deadlock
Total   = Game 1 + Game 2
```

## Fitur Utama

- REST API dan Socket.IO pada satu origin dan satu port.
- Validasi lobby: tepat 4 pemain dan semua tamu ready sebelum host memulai.
- Eksekusi ronde, timer, dan transisi dikendalikan server.
- Deteksi deadlock dan pencegahan melalui resource ordering serta Banker's Algorithm.
- Log Kejadian bernomor langkah untuk visualisasi Game 1.
- Metrik simulasi dikirim dari hasil eksekusi nyata, bukan data statis.
- Penyimpanan room, pemain, status, skor, dan riwayat pertandingan ke PostgreSQL.
- Healthcheck untuk memantau status deploy.

## Teknologi

- Node.js
- TypeScript
- Express 5
- Socket.IO 4
- PostgreSQL
- Supabase melalui PgBouncer port `6543`
- Deploy: Heroku

Struktur database:

| Tabel | Fungsi |
|---|---|
| `users` | Identitas pemain dan warna avatar |
| `rooms` | Kode room, host, status, dan minigame berjalan |
| `room_players` | Keanggotaan room, status host, dan status ready |
| `minigame_scores` | Skor dan metrik per pemain per minigame |
| `game_history` | Riwayat pertandingan yang selesai |

## Instalasi

### Prasyarat

- Node.js 20 atau lebih baru
- npm
- PostgreSQL atau project Supabase
- `psql` opsional jika ingin menjalankan skema lewat terminal

### Langkah

1. Masuk ke folder backend:

   ```powershell
   cd C:\latihan\projectakhirso\Backend_SistemOperasi
   ```

2. Pasang dependency:

   ```powershell
   npm install
   ```

3. Buat file `.env`:

   ```env
   PORT=3000
   NODE_ENV=development
   DATABASE_URL="postgresql://<user>:<password>@<host-pooler>:6543/postgres"
   CLIENT_URL=http://localhost:5173
   ```

   `DATABASE_URL` memakai host PgBouncer dengan port `6543`. Karakter `?` pada password harus ditulis sebagai `%3F`.

4. Jalankan skema database. Cara paling mudah untuk Supabase: buka **SQL Editor**, lalu salin isi `src/db/schema.sql` dan jalankan.

   Alternatif lewat terminal yang mendukung expansion variabel:

   ```powershell
   npm run db:schema
   ```

5. Jalankan server:

   ```powershell
   npm run dev
   ```

6. Cek healthcheck:

   ```text
   http://localhost:3000/health
   ```

### Build Produksi

```powershell
npm run build
npm start
```

Hasil kompilasi TypeScript ada di folder `dist/`.

## Cara Penggunaan

### Endpoint REST

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/health` | Healthcheck server dan database |
| `GET` | `/api/rooms` | Daftar room yang tersedia |

Semua response API dikirim tanpa cache browser.

### Event Socket.IO utama

| Arah | Event | Fungsi |
|---|---|---|
| Klien → Server | `room:join` | Masuk room memakai kode room |
| Klien → Server | `room:set_ready` | Menandai tamu sebagai siap |
| Klien → Server | `room:leave` | Keluar room |
| Klien → Server | `room:kick` | Host mengeluarkan pemain |
| Server → Klien | `room:state` | Sinkronisasi anggota, warna, dan status room |
| Server → Klien | `rooms:updated` | Daftar room berubah |
| Klien → Server | `stickbrawl:start` | Host memulai Game 1 |
| Klien → Server | `stickbrawl:run` | Eksekusi aksi pemain |
| Server → Klien | `stickbrawl:state` | Snapshot arena dan Log Kejadian |
| Server → Klien | `stickbrawl:round_end` | Hasil ronde Game 1 |
| Klien → Server | `jellyfish:join` | Mendaftar ke sesi Game 2 |
| Klien → Server | `jellyfish:request_resource` | Meminta resource |
| Klien → Server | `jellyfish:release` | Melepas seluruh resource |
| Klien → Server | `jellyfish:next_round` | Host melanjutkan ronde |
| Server → Klien | `jellyfish:state` | Snapshot arena dan resource |
| Server → Klien | `jellyfish:deadlock` | Notifikasi deadlock |
| Server → Klien | `jellyfish:round_end` | Hasil dan metrik ronde |
| Server → Klien | `jellyfish:game_end` | Rekap akhir dan metrik gabungan |

### Alur Singkat

1. Host membuat room lewat frontend. Backend membuat kode room dan menetapkan host.
2. Tiga pemain lain masuk memakai kode room tersebut.
3. Server menolak mulai apabila jumlah pemain belum 4 atau masih ada tamu yang belum ready.
4. Host memulai Game 1. Server mengirim hitung mundur, state arena, dan Log Kejadian.
5. Setelah Game 1 selesai, host menekan tombol lanjut ke Game 2.
6. Server menjalankan tiga ronde Game 2 dan mengirim metrik asli tiap ronde.
7. Server menyimpan skor ke `minigame_scores` dan riwayat ke `game_history`.

## Konfigurasi Deploy

### Heroku

App yang dipakai: `kernel-clash-api`.

Isi Config Vars di **Settings → Reveal Config Vars** sebelum deploy:

```text
NODE_ENV=production
CLIENT_URL=https://www.jnpdev.tech
DATABASE_URL=postgresql://<user>:<password>@<host-pooler>:6543/postgres
```

- `CLIENT_URL` adalah origin frontend, bukan backend.
- Di dashboard Heroku, value Config Vars **tanpa tanda kutip**.
- Jangan menambahkan `PORT`; Heroku menyediakannya otomatis.
- Kalau `CLIENT_URL` dikosongkan, server memakai fallback `http://localhost:5173` dan frontend produksi akan terkena CORS.
- `Procfile`: `web: npm start`.
- Script `build` sudah ada di `package.json`, sehingga Heroku menjalankannya otomatis saat deploy.

### Deploy lewat GitHub

1. Root repo harus berisi `package.json` dan `Procfile`.
2. Hubungkan repo di **Deploy → GitHub → Connect to GitHub**.
3. Pilih branch `main`, lalu **Deploy Branch**.
4. Aktifkan dyno di **Resources → web = 1**.
5. Cek `https://kernel-clash-api.herokuapp.com/health`.

Bagian pipeline Heroku tidak dipakai.

### Domain Backend

1. Heroku → **Settings → Domains → Add domain**:

   ```text
   api.jnpdev.tech
   ```

2. Salin DNS target yang muncul.
3. Di Namify, buka **DNS → DNS Records**, tambahkan:

   | Type | Host name | Value |
   |---|---|---|
   | CNAME | `api` | `<DNS target Heroku>` |

4. Setelah aktif, frontend memakai:

   ```env
   VITE_API_BASE_URL=https://api.jnpdev.tech/api
   VITE_SOCKET_URL=https://api.jnpdev.tech
   ```

   Variabel `VITE_` dibekukan saat build, sehingga frontend wajib di-deploy ulang setelah diubah.

### Catatan Akses Repo

Jika akun GitHub yang dipakai bukan pemilik repo, akses deploy harus diberikan oleh pemilik repo:

- tambahkan akun sebagai collaborator dengan akses write, atau
- izinkan Heroku GitHub App untuk repo/organization tersebut, atau
- fork repo ke akun sendiri lalu hubungkan fork tersebut ke Heroku.

## Anggota Tim

| Nama | NIM | Peran |
|---|---|---|
|  |  |  |
|  |  |  |
|  |  |  |
|  |  |  |
