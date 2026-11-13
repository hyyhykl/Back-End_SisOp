# KONTEKS APLIKASI: Kernel Clash Arcade

## 1. OVERVIEW APLIKASI

**Kernel Clash Arcade** adalah aplikasi web game multiplayer online bertema Sistem Operasi yang berbentuk **Mini OS Simulator Terpadu (gabungan beberapa modul)**. Aplikasi ini dirancang sebagai sarana pembelajaran interaktif dalam bentuk kompetisi game party multiplayer (maksimal 4 player per room) yang diakses melalui internet.

Aplikasi mengombinasikan berbagai minigame interaktif yang diangkat dari materi kuliah Sistem Operasi. Saat ini, minigame pertama yang sudah selesai dan teruji adalah **Deadlock Dungeon** (modul Deadlock), sementara minigame lainnya akan dikembangkan dari topik-topik materi Sistem Operasi.

### Materi Sistem Operasi yang Dirujuk:
1. **Komponen Sistem Operasi** (`2. Komponen Sistem Operasi.md`)
2. **Penjadwalan Proses / CPU Scheduling** (`3. Manajemen Proses - Penjadwalan Proses.md`) — *Contoh: FCFS, SJF, RR, Priority, MLFQ*
3. **Konkurensi & Sinkronisasi** (`4. Manajemen Proses - Konkurensi.md`, `5. Manajemen Proses - Konkurensi Part II.md`, `6. Manajemen Proses - Sinkronisasi.md`) — *Contoh: Mutex, Semaphore, Race Condition, Deadlock & Penanganannya*
4. **Manajemen Memori** (`7. Manajemen Memori.md`) — *Contoh: Page Replacement (FIFO, LRU, Optimal), Algoritma Alokasi Memori*
5. **Penjadwalan Disk & Alokasi File System** — *Contoh: SSTF, SCAN, C-SCAN*

---

## 2. PERSYARATAN MINIMUM PROYEK

Mengikuti ketentuan Final Project Sistem Operasi (Kategori B — Aplikasi Simulasi Fungsi Sistem Operasi):
- **Minimal 3 algoritma/mekanisme per modul**
- **Visualisasi langkah demi langkah dan input yang dapat diubah pengguna**
- **Perbandingan metrik kinerja antar algoritma**

---

## 3. TARGET PLATFORM & ARSITEKTUR TEKNOLOGI

- **Target Platform**: Web Browser
- **Implementasi**: Client-Server (Multi-file, Frontend & Backend berbasis JavaScript/Node.js)
- **Komunikasi Real-time**: Memungkinkan koneksi antar-pemain via internet untuk mode multiplayer.

---

## 4. GAMBARAN APLIKASI & FLOW ROOM MULTIPLAYER

### A. Halaman Utama & Sistem Room
1. User mengakses halaman utama aplikasi.
2. User membuat room baru atau bergabung ke room yang sudah ada.
3. Setiap room memiliki **Invitation Code** (kode unik room) yang dapat dibagikan ke pemain lain.
4. Kapasitas maksimum room adalah **4 player**.
5. Game dapat mulai dimainkan setidaknya jika sudah terdapat **lebih dari 1 player** (>1 player) di dalam room.

### B. Flow Turnamen 3 Minigame
Permainan berlangsung dalam format turnamen beruntun yang terdiri dari 3 minigame:

1. **Minigame 1**:
   - Para pemain bertanding di Minigame 1 (saat ini: *Deadlock Dungeon*).
   - Setelah Minigame 1 selesai, tampil papan **Ranking Skor Minigame 1** selama 5 detik.
   - Setelah waktu 5 detik habis, seluruh pemain otomatis dipindahkan ke Minigame 2.

2. **Minigame 2**:
   - Para pemain bertanding di Minigame 2.
   - Setelah Minigame 2 selesai, tampil papan **Ranking Skor Minigame 2** selama 5 detik.
   - Setelah waktu 5 detik habis, seluruh pemain otomatis dipindahkan ke Minigame 3.

3. **Minigame 3**:
   - Para pemain bertanding di Minigame 3.
   - Setelah Minigame 3 selesai, tampil papan **Ranking Akumulasi Akhir** (kumpulan total skor dari Minigame 1, Minigame 2, dan Minigame 3) untuk menentukan pemenang utama turnamen.
