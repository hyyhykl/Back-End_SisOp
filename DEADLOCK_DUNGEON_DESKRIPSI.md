# Deadlock Dungeon - Dokumentasi Game

---

## 1. Overview Game

**Deadlock Dungeon** adalah game simulasi interaktif untuk mempelajari konsep **Deadlock** dan **Resource Allocation** dalam Sistem Operasi. Game dikemas sebagai kompetisi 4 pemain (1 human + 3 bot) dalam arena dungeon untuk mengumpulkan **10 resource** dan keluar melalui Exit Gate.

---

## 2. Konsep Utama

| Aspek | Detail |
|-------|--------|
| **Nama Game** | Deadlock Dungeon |
| **Genre** | Simulasi Edukatif / Strategy / Competitive |
| **Platform** | Web Browser (HTML5 Canvas + Vanilla JS) |
| **Total Player** | 4 (1 Human + 3 AI Bot) |
| **Durasi Ronde** | 30-60 detik (bisa diatur) |
| **Total Resource** | **10 resource per player** (R1-R12 tersedia di arena) |
| **Topik OS** | Deadlock, Resource Allocation, Synchronization |
| **Single File** | Ya (`deadlock-dungeon.html`) |

---

## 3. Cara Main

### 3.1 Alur Permainan
1. **Menu Utama** → Pilih algoritma deadlock + durasi ronde
2. **Countdown 3-2-1-GO** → Game dimulai
3. **Ronde 45 detik** (default):
   - 4 player muncul di posisi acak
   - 12 resource (R1-R12) tersebar di arena
   - Tiap player punya misi: ambil 3 resource spesifik → ke EXIT GATE
4. **Game Over** → Tampil leaderboard + perbandingan metrik 3 algoritma

### 3.2 Kontrol
| Input | Aksi |
|-------|------|
| **W / ↑** | Gerak ke atas |
| **S / ↓** | Gerak ke bawah |
| **A / ←** | Gerak ke kiri |
| **D / →** | Gerak ke kanan |
| **Auto-pick** | Dekati resource → otomatis diambil (jika valid) |

### 3.3 Misi Player (6 Resource)
- **P1 (Human)**: Butuh R1, R2, R3, R4, R5, R6
- **P2 (Bot Red)**: Butuh R4, R5, R6, R7, R8, R9
- **P3 (Bot Green)**: Butuh R7, R8, R9, R10, R11, R12
- **P4 (Bot Yellow)**: Butuh R10, R11, R12, R1, R2, R3

> Misi: Ambil 6 resource yang dibutuhkan → Lari ke **EXIT GATE** di tengah arena

---

## 4. 3 Algoritma / Mekanisme Deadlock

### 4.1 No Prevention (Naive) — Mode 1
> *"Bebas ambil resource. Jika terjadi deadlock, kedua player stuck 2 detik lalu resource dilepas otomatis (detection & recovery)."*

**Mekanisme:**
- Player bebas mengambil resource mana saja yang dibutuhkan
- Tidak ada aturan urutan atau pencegahan
- **Deadlock Detection**: Sistem deteksi *circular wait* (P1 pegang R1 nunggu R2, P2 pegang R2 nunggu R1)
- **Recovery**: Kedua player stuck 2 detik → resource dilepas otomatis → lanjut main
- Paling realistis tapi paling rawan deadlock

### 4.2 Resource Ordering (Prevention) — Mode 2
> *"Player WAJIB mengambil resource sesuai urutan nomor terkecil dulu (R1 → R2 → R3...). Mencegah circular wait 100%."*

**Mekanisme:**
- Aturan kaku: harus ambil resource nomor terkecil dulu dari yang dibutuhkan
- Contoh: Butuh R2, R4, R1 → Harus ambil **R1** dulu, baru **R2**, lalu **R4**
- Mencegah *circular wait* dengan menghilangkan kondisi *hold and wait* secara bersamaan
- **0% deadlock** tapi fleksibilitas rendah

### 4.3 Banker's Algorithm (Avoidance) — Mode 3
> *"Sistem mengecek Safe State sebelum mengizinkan alokasi. Request yang dapat menyebabkan deadlock akan ditolak sementara."*

**Mekanisme:**
- Sistem mengecek **Safe State** sebelum mengizinkan pengambilan resource
- **Safe State** = masih ada setidaknya 1 player yang bisa selesai dengan resource yang tersedia
- Jika alokasi bikin *unsafe state* → request **ditolak** (resource nggak diambil)
- Lebih fleksibel dari Resource Ordering tapi butuh komputasi runtime

---

## 5. Penyediaan 3 Ketentuan Dosen

### 5.1 Minimal 3 Algoritma/Mekanisme per Modul ✅
| Modul | Algoritma 1 | Algoritma 2 | Algoritma 3 |
|-------|-------------|-------------|-------------|
| Deadlock | No Prevention (Naive) | Resource Ordering | Banker's Algorithm |

✅ **Terepenuhi**: 3 algoritma deadlock berbeda dengan mekanisme berbeda

---

### 5.2 Visualisasi Langkah Demi Langkah & Input User ✅

#### Visualisasi Langkah Demi Langkah:
| Elemen | Visualisasi |
|--------|-------------|
| **Resource Available** | Lingkaran warna cerah, label R1-R12 |
| **Resource Diambil** | Lingkaran abu-abu + label `(P1)` di bawahnya |
| **Player Memegang Resource** | Teks `[R1, R2, R3]` di atas player |
| **Deadlock** | Aura merah + teks `DEADLOCK!` + stuck 2 detik |
| **Recovery** | Resource balik available otomatis setelah 2 detik |
| **Exit Gate** | Lingkaran hijau `EXIT GATE` di tengah |
| **Misi Quest HUD** | Panel kanan: "Butuh R1, R2, R3 → Ke EXIT" |

#### Input yang Dapat Diubah User:
| Input | Cara Ubah | Efek |
|-------|-----------|------|
| **Algoritma** | Dropdown di menu | Ubah mekanisme deadlock |
| **Durasi Ronde** | Slider 30-60 detik | Panjang waktu main |
| **Spawn Point** | Otomatis random tiap ronde | Posisi awal beda tiap ronde |
| **Resource Requirement** | Fixed per player | Bedanya di kode, bisa dikembangkan |

---

### 5.3 Perbandingan Metrik Kinerja Antar Algoritma ✅

#### Di End Screen (Setelah Game Selesai):
Tabel perbandingan **3 algoritma sekaligus**:

| Kolom | Keterangan |
|-------|------------|
| **Algoritma** | Nama algoritma |
| **Total Deadlock** | Jumlah kejadian deadlock (x) |
| **Tingkat Keberhasilan** | % player yang selesai misi |
| **Rata-rata Waktu** | Waktu rata-rata selesai misi |

#### Data yang Ditampilkan:
| Algoritma | Deadlock | Keberhasilan | Waktu |
|-----------|----------|--------------|-------|
| No Prevention | Real (dihitung saat main) | % aktual | Waktu aktual |
| Resource Ordering | 0x (Estimasi) | 100% | Estimasi cepat |
| Banker's Avoidance | 0x (Estimasi) | 100% | Estimasi sedang |

> Catatan: Resource Ordering & Banker's menggunakan estimasi jika belum pernah dimainkan, data real dikumpulkan saat dimainkan.

---

## 6. Sistem Skor (Individual)

### Rumus Skor:
```
Base Score: 100 (partisipasi)
+ 50 per resource yang dipegang
+ 200 jika selesai ke Exit Gate
- 15 per deadlock
+ 100 bonus jika 0 deadlock
+ Speed Bonus: #1=100, #2=75, #3=50, #4=25
Minimum skor: 0 (tidak negatif)
```

### Contoh:
| Player | Resource | Finish | Deadlock | Skor |
|--------|----------|--------|----------|------|
| P1 | 6/6 | Ya | 0x | 100+300+200+100 = 700 |
| P2 | 4/6 | Tidak | 2x | 100+200-30 = 270 |
| P3 | 3/6 | Tidak | 3x | 100+150-45 = 205 |

---

## 7. Fitur Tambahan

### Random Spawn Point
- Tiap ronde, 4 player spawn di posisi random di arena
- Biar nggak monoton, butuh adaptasi tiap ronde

### 12 Resource (R1-R12) - 6 Resource per Player
- Resource tersebar di grid 3x4 di arena (R1-R12)
- Warna berbeda tiap resource
- **6 resource per player** dengan overlap seimbang (circular wait jelas)
- Tiap player butuh 6 resource berbeda tapi overlapping

### Countdown 3-2-1-GO
- Visual countdown besar di tengah layar sebelum mulai

### 4 Player (1 Human + 3 Bot)
- **P1**: Human (WASD/Arrow)
- **P2-P4**: Bot AI dengan strategi berbeda
  - Bot Red: Agresif
  - Bot Green: Medium
  - Bot Yellow: Defensive

---

## 8. File & Struktur

```
deadlock-dungeon.html  (Single file: HTML + CSS + JS)
├── HTML: Structure (Menu, HUD, Canvas, Result)
├── CSS: Styling (Dark theme, Neon accent, Responsive)
└── JS:
    ├── State Management (menu/countdown/playing/over)
    ├── Input Handler (WASD/Arrow)
    ├── Game Loop (60 FPS)
    ├── Deadlock Detection (No Prevention)
    ├── Resource Ordering Enforcement
    ├── Banker's Safe State Check
    ├── Bot AI (3 strategi)
    ├── Scoring System
    └── Metrics Collection & Comparison
```

---

## 9. Cara Menjalankan

1. Buka file `deadlock-dungeon.html` di browser modern (Chrome/Edge/Firefox)
2. Klik **"Mulai Game"**
3. Pilih algoritma dari dropdown
4. Atur durasi ronde (opsional)
5. Mainkan dengan **WASD / Arrow Keys**

---

## 10. Kompatibilitas Ketentuan Dosen

| Ketentuan | Status | Bukti |
|-----------|--------|-------|
| Minimal 3 algoritma per modul | ✅ | 3 algoritma deadlock |
| Visualisasi langkah demi langkah | ✅ | Resource status, deadlock aura, quest HUD |
| Input user dapat diubah | ✅ | Dropdown algoritma + slider durasi + random spawn |
| Perbandingan metrik kinerja | ✅ | Tabel 3 algoritma di end screen |
| Total 4 player | ✅ | 1 Human + 3 Bot |
| Single file HTML | ✅ | `deadlock-dungeon.html` |

---

## 11. Pengembangan Selanjutnya (Roadmap)

| Game | Topik | Status |
|------|-------|--------|
| **Game 1: Deadlock Dungeon** | Deadlock | ✅ Selesai |
| **Game 2: Sync Arena** | Synchronization (Mutex/Semaphore) | 🔄 Berikutnya |
| **Game 3: Memory/Disk Manager** | Memory Management / Disk Scheduling | 📋 Rencana |

---

*Dokumentasi ini untuk Final Project Mata Kuliah Sistem Operasi - Kategori B: Aplikasi Simulasi Fungsi Sistem Operasi*