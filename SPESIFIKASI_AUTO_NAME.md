# SPESIFIKASI AUTO-NAME — Kernel Clash Arcade

**Keputusan desain:** TIDAK ada layar input nama. Identitas guest dibuat otomatis
oleh frontend saat pertama kali aplikasi dibuka, lalu **disimpan permanen** di
localStorage.

**Backend tidak perlu diubah.** `POST /api/auth/guest` sudah siap dan tetap
memvalidasi nama (1–12 karakter) serta warna (pink/blue/orange/yellow).

---

## 1. ATURAN

| Aturan | Detail |
|---|---|
| Kapan dibuat | Hanya saat `localStorage.userId` belum ada |
| Dibuat oleh | Frontend (backend hanya menerima & menyimpan) |
| Format nama | `KataSifat` + `KataBenda`, contoh: `CepatKernel`, `TenangBuffer` |
| Panjang nama | Maksimal 12 karakter (batas backend) — kombinasi di bawah aman |
| Warna avatar | Dipilih acak dari 4 warna valid |
| Boleh berubah saat refresh? | TIDAK. Sekali dibuat, identitas dipakai terus |
| Ganti nama | Tidak disediakan (keputusan produk) |

---

## 2. SNIPPET SIAP PAKAI

Buat file `src/lib/guest.js`:

```js
const ADJECTIVES = [
  'Cepat', 'Cerdas', 'Gigih', 'Tenang',
  'Lincah', 'Jitu', 'Sigap', 'Tajam',
];

const NOUNS = [
  'Kernel', 'Pixel', 'Cache', 'Thread',
  'Buffer', 'Socket', 'Stack', 'Daemon',
];

export const AVATAR_COLORS = ['pink', 'blue', 'orange', 'yellow'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Contoh hasil: "CepatKernel", "TenangBuffer", "SigapDaemon"
export function generateGuestIdentity() {
  return {
    name: `${pick(ADJECTIVES)}${pick(NOUNS)}`,
    avatarColor: pick(AVATAR_COLORS),
  };
}
```

---

## 3. PASANG DI `App.jsx`

Ganti blok auto-generate lama (`Pemain` + 4 digit) dengan ini:

```jsx
import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { generateGuestIdentity } from './lib/guest';

export default function App() {
  const [guest, setGuest] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1. Sudah punya identitas? Langsung pakai, JANGAN buat ulang.
      const savedId = localStorage.getItem('userId');
      if (savedId) {
        if (!cancelled) {
          setGuest({
            userId: savedId,
            name: localStorage.getItem('userName'),
            avatarColor: localStorage.getItem('avatarColor'),
          });
          setBooting(false);
        }
        return;
      }

      // 2. Belum ada → buat nama acak yang enak dibaca, lalu daftarkan.
      try {
        const identity = generateGuestIdentity();
        const data = await api('/auth/guest', {
          method: 'POST',
          body: JSON.stringify(identity),
        });

        localStorage.setItem('userId', data.userId);
        localStorage.setItem('userName', data.name);
        localStorage.setItem('avatarColor', data.avatarColor);

        if (!cancelled) setGuest(data);
      } catch (err) {
        console.error('Gagal membuat sesi guest:', err);
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  if (booting) return <div>Memuat...</div>;

  // guest bisa null kalau request gagal — tampilkan retry, bukan layar input nama
  if (!guest) return <div>Gagal terhubung. Refresh halaman.</div>;

  return /* sisa aplikasi kamu */ null;
}
```

---

## 4. YANG HARUS DIHAPUS

Cari dan hapus pola lama di `App.jsx`:

```jsx
// ❌ HAPUS
const name = `Pemain${Math.floor(1000 + Math.random() * 9000)}`;
const avatarColor = 'pink';
```

Kalau pola ini masih ada, nama akan tetap `PemainXXXX` dan semua avatar pink.

---

## 5. PENANGANAN SESI KEDALUWARSA

Kalau database di-reset manual, `userId` di localStorage jadi tidak valid dan
backend membalas:

```json
{ "success": false, "error": { "code": "USER_NOT_FOUND",
  "message": "Sesi tamu sudah tidak berlaku..." } }
```

Aksi frontend: hapus localStorage → reload → aplikasi otomatis membuat identitas
baru. **Bukan** menampilkan layar input nama.

```js
function resetGuestSession() {
  localStorage.removeItem('userId');
  localStorage.removeItem('userName');
  localStorage.removeItem('avatarColor');
  window.location.reload();
}

// di catch request REST / listener toast socket:
if (err.response?.data?.error?.code === 'USER_NOT_FOUND') {
  resetGuestSession();
}
```

---

## 6. CATATAN TABRAKAN NAMA

Ada 8 × 8 = 64 kombinasi nama. Peluang dua dari maksimal 4 pemain di satu room
mendapat nama sama kecil, tapi **bukan nol**. Ini tidak merusak sistem (identitas
tetap dibedakan oleh `userId`), hanya bisa membingungkan saat demo.

Kalau ingin nol tabrakan, tambahkan 2 digit:

```js
name: `${pick(ADJECTIVES)}${pick(NOUNS)}${Math.floor(10 + Math.random() * 90)}`,
// contoh: "CepatKernel42" (14 karakter → MELEBIHI batas 12!)
```

**Perhatian:** `CepatKernel` (12 karakter) + 2 digit = 14 → ditolak backend
(`NAME_TOO_LONG`). Kalau mau pakai digit, potong dulu:

```js
name: `${pick(ADJECTIVES)}${pick(NOUNS)}`.slice(0, 10) + Math.floor(10 + Math.random() * 90),
```

---

## 7. TES MULTIPLAYER (PENTING)

`localStorage` dibagi antar tab pada browser yang sama. Dua tab Chrome =
**userId yang sama** = dianggap satu pemain.

| Cara tes | Hasil |
|---|---|
| 2 tab Chrome biasa | ❌ Sama pemain, join kedua gagal/aneh |
| 1 tab normal + 1 tab incognito | ✅ Dua pemain berbeda |
| Chrome + Edge | ✅ Dua pemain berbeda |
| Chrome + HP di jaringan yang sama (via ngrok) | ✅ Dua pemain berbeda |

---

## 8. CHECKLIST

- [ ] Hapus blok `Pemain${...}` + `avatarColor: 'pink'` di `App.jsx`
- [ ] Buat `src/lib/guest.js` dengan `generateGuestIdentity()`
- [ ] Request guest hanya jalan kalau `localStorage.userId` kosong
- [ ] Simpan `userId`, `userName`, `avatarColor` setelah request sukses
- [ ] Handle `USER_NOT_FOUND` → hapus localStorage → reload
- [ ] Tes: refresh 3× → nama di lobi TIDAK berubah
- [ ] Tes: buka incognito → nama berbeda dari tab utama
