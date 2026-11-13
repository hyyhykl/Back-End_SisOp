# PANDUAN REALTIME FRONTEND — Daftar Room & Ruang Tunggu

Dokumen ini untuk **satu frontend developer** yang mengerjakan seluruh halaman
frontend (daftar room + ruang tunggu) memakai **OpenCode**.

---

## 0. ATURAN KERJA

1. **Satu sesi OpenCode saja.** Jangan jalankan dua sesi yang mengedit file
   bersamaan.
2. **Backup folder project** sebelum perubahan besar (copy folder atau zip).
3. Kerjakan bertahap: `socket.js` → daftar room → halaman room → tes.

---

## 1. TUGAS 1 — DAFTAR ROOM (SOCKET + POLLING CADANGAN)

**File:** `src/screens/JoinRoom.jsx` (atau nama file daftar room di project)

**Yang harus dilakukan:**

- Panggil `GET /api/rooms` saat halaman pertama dibuka dan saat tab kembali aktif.
- Dengarkan event socket `rooms:updated` → panggil `GET /api/rooms` (instan).
- Tetap jalankan polling lambat **10 detik** sebagai cadangan bila socket putus.
- Hentikan interval & lepas listener saat halaman ditutup (cleanup).
- Jangan menumpuk request: kalau request sebelumnya belum selesai, lewati dulu.
- Jangan tampilkan loading penuh saat refresh — cukup update data diam-diam.
- Tombol **Refresh** tetap ada sebagai kontrol manual.
- Jangan polling saat tab tidak terlihat (`document.hidden`).

**Referensi kode:**

```jsx
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { socket } from '../lib/socket';

const POLL_MS = 10000;   // cadangan saja; update utama datang dari socket

export default function JoinRoom({ onSwitchToCreate, onJoinRoom, onToast }) {
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);   // hanya loading awal
  const inFlight = useRef(false);

  async function loadRooms(silent = true) {
    if (inFlight.current) return;          // hindari request bertumpuk
    if (silent && document.hidden) return; // tab tidak aktif → skip

    inFlight.current = true;
    try {
      const data = await api('/rooms');
      setRooms(Array.isArray(data) ? data : []);
    } catch {
      if (!silent) setRooms([]);
    } finally {
      inFlight.current = false;
      setLoadingRooms(false);
    }
  }

  useEffect(() => {
    loadRooms(false);                       // muat pertama kali

    // Update instan saat server memberi sinyal
    socket.connect();
    socket.on('rooms:updated', () => loadRooms(true));

    // Cadangan bila socket putus / event terlewat
    const timer = setInterval(() => loadRooms(true), POLL_MS);

    const onVisible = () => {
      if (!document.hidden) {
        if (!socket.connected) socket.connect();
        loadRooms(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      socket.off('rooms:updated');
      document.removeEventListener('visibilitychange', onVisible);
      // Jangan socket.disconnect() di sini — koneksi dipakai halaman room juga.
    };
  }, []);

  // ... sisa JSX tidak perlu diubah
}
```

**Definisi selesai (DoD):**

- [ ] Buka dua browser (normal + incognito), buat room di satu sisi.
- [ ] Sisi lain (halaman daftar room) menampilkan room baru **tanpa refresh**, hampir instan.
- [ ] Room yang dibubarkan hilang dari daftar hampir instan.
- [ ] Matikan socket sebentar (DevTools → Offline) → polling 10 detik tetap memperbarui daftar.
- [ ] Tab Network tidak menumpuk request.
- [ ] Tidak ada listener ganda setelah pindah halaman bolak-balik.
- [ ] Tidak ada warning `setState on unmounted component`.

---

## 2. TUGAS 2 — SOCKET DI HALAMAN ROOM

**File:** `src/screens/Room/**`

**Yang harus dilakukan:**

- Pakai **satu instance socket** dari `src/lib/socket.js`. Jangan `io()` baru.
- Saat masuk halaman: `socket.connect()` → `emit('auth', userId)` → `emit('room:join', { code })`.
- Pasang listener: `room:state`, `room:player_joined`, `room:player_left`,
  `room:player_ready`, `room:disbanded`, `room:kicked`, `toast`.
- Saat keluar halaman: **emit `room:leave` sebelum navigasi**, lalu lepas listener.
- Jangan mendaftarkan listener berulang (gunakan `socket.off` di cleanup).
- Data dari server = sumber kebenaran. `room:state` menimpa state lokal.

**Referensi kode:**

```jsx
import { useEffect, useState } from 'react';
import { socket } from '../../lib/socket';
import { api } from '../../lib/api';

export default function Room({ roomCode, initialRoom, userId, onExit }) {
  const [players, setPlayers] = useState(initialRoom?.players ?? []);
  const [me, setMe] = useState(initialRoom?.me ?? null);
  const [room, setRoomInfo] = useState(initialRoom ?? null);

  useEffect(() => {
    let active = true;

    // Fallback: hanya saat refresh / buka link langsung (tidak ada data awal)
    if (!initialRoom) {
      api(`/rooms/${roomCode}`)
        .then((data) => { if (active) setRoomInfo(data); })
        .catch(() => {});
    }

    socket.connect();
    socket.emit('auth', userId);
    socket.emit('room:join', { code: roomCode });

    const onState = (data) => {
      setRoomInfo(data.room);
      setPlayers(data.players);
      setMe(data.me);
    };
    const onJoined = (p) => setPlayers((prev) =>
      prev.some((x) => x.userId === p.userId) ? prev : [...prev, p]
    );
    const onLeft = ({ userId: id }) => setPlayers((prev) =>
      prev.filter((p) => p.userId !== id)
    );
    const onReady = ({ userId: id, isReady }) => setPlayers((prev) =>
      prev.map((p) => (p.userId === id ? { ...p, isReady } : p))
    );
    const onDisbanded = () => { if (active) onExit?.('disbanded'); };
    const onKicked = () => { if (active) onExit?.('kicked'); };

    socket.on('room:state', onState);
    socket.on('room:player_joined', onJoined);
    socket.on('room:player_left', onLeft);
    socket.on('room:player_ready', onReady);
    socket.on('room:disbanded', onDisbanded);
    socket.on('room:kicked', onKicked);

    return () => {
      active = false;
      socket.off('room:state', onState);
      socket.off('room:player_joined', onJoined);
      socket.off('room:player_left', onLeft);
      socket.off('room:player_ready', onReady);
      socket.off('room:disbanded', onDisbanded);
      socket.off('room:kicked', onKicked);
    };
  }, [roomCode, userId]);

  // Dipanggil tombol keluar — WAJIB emit dulu, baru pindah halaman
  function handleLeave() {
    socket.emit('room:leave', { code: roomCode });
    // beri waktu singkat agar server sempat memproses
    setTimeout(() => onExit?.('left'), 300);
  }

  // ... render memakai `players`, `me`, `room`
}
```

**`src/lib/socket.js` (satu instance untuk seluruh aplikasi):**

```js
import { io } from 'socket.io-client';

export const socket = io(import.meta.env.VITE_SOCKET_URL, {
  autoConnect: false,
  extraHeaders: { 'ngrok-skip-browser-warning': 'true' },
  // JANGAN set transports — biarkan default
});
```

**Definisi selesai (DoD):**

- [ ] Dua browser join room yang sama → daftar pemain bertambah **tanpa refresh**.
- [ ] Salah satu klik "Siap" → badge siap berubah di sisi lain **tanpa refresh**.
- [ ] Salah satu keluar → namanya hilang dari daftar sisi lain **tanpa refresh**.
- [ ] Host keluar → semua dapat `room:disbanded` dan kembali ke menu.
- [ ] Klik keluar → tidak perlu refresh, dan jumlah pemain di daftar room langsung benar.
- [ ] Pindah halaman 3× tidak menghasilkan listener ganda (cek dengan `socket.listeners('room:state').length`).

---

## 3. CARA MENYURUH DI OPENCODE

Satu prompt untuk keduanya. Kerjakan berurutan, jangan sekaligus.

```
Repo: Kernel Clash Arcade (React + Vite).

Kerjakan dua tugas ini berurutan. Selesaikan tugas 1 dulu, tunjukkan diff,
baru lanjut tugas 2.

Tugas 1 — halaman daftar room (JoinRoom):
Halaman ini tetap memakai REST untuk data. Socket HANYA sebagai sinyal:
socket.on('rooms:updated', () => loadRooms())
lalu loadRooms memanggil GET /api/rooms lewat helper api.
Polling 10 detik TETAP ADA sebagai cadangan — jangan diganti socket.
Cleanup interval & socket.off saat unmount. Jangan socket.disconnect() di sini
(koneksi dipakai halaman room). Skip saat document.hidden, guard biar request
tidak menumpuk, tombol Refresh tetap ada.
Jangan pindahkan data room ke payload socket — payload-nya kosong.

Tugas 2 — halaman room (src/screens/Room/**):
Ruang tunggu real-time: connect -> emit('auth', userId) -> emit('room:join', { code }).
Listener: room:state, room:player_joined, room:player_left, room:player_ready,
room:disbanded, room:kicked. room:state menimpa state lokal.
Saat keluar: emit('room:leave', { code }) dulu, lalu socket.off. Jangan paksa transports.

Pakai satu instance socket dari src/lib/socket.js (buat kalau belum ada).
Jangan ubah file lain. Tunjukkan diff tiap selesai satu tugas.
```

> Kalau agen mulai menyentuh file di luar tugas, tambahkan satu baris:
> `Jangan ubah file lain selain yang disebut di atas.` Itu sudah cukup.

---

## 4. URUTAN PENGERJAAN YANG DISARANKAN

1. Buat `src/lib/socket.js` (6 baris).
2. Kerjakan daftar room (Tugas 1) → tes.
3. Kerjakan halaman room (Tugas 2) → tes.
4. Tes bersama:
   - Browser 1 (normal): buat room, masuk ruang tunggu.
   - Browser 2 (incognito): buka daftar room → room baru harus muncul hampir instan → gabung.
   - Di ruang tunggu: klik siap di satu sisi → sisi lain berubah tanpa refresh.
   - Host keluar → sisi lain kembali ke menu.

> Ingat: dua tab di browser yang sama memakai `localStorage` yang sama
> (userId sama). Tes dua pemain wajib pakai incognito atau browser berbeda.

---

## 5. CEK CEPAT KALAU MASIH BASI

| Gejala | Cek |
|---|---|
| Daftar room tidak update | Tab Network: ada `GET /api/rooms` tiap 10 detik? Event `rooms:updated` terpasang? |
| Pemain masuk tidak muncul | Console: listener `room:player_joined` terpasang? |
| Harus refresh setelah keluar | Apakah `socket.emit('room:leave')` dipanggil sebelum navigasi? |
| Angka pemain tetap salah padahal DB benar | Berarti UI tidak refetch / tidak menerima event |
| Angka pemain salah dan DB juga salah | Berarti `room:leave` tidak sampai ke server |
