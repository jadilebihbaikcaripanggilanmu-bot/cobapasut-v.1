# Web Pemodelan Pasut

Website statis untuk membaca data pasut dari file CSV/XLSX, memilih sensor, memilih rentang waktu, memilih resolusi analisis (1 menit, 15 menit, 30 menit, 1 jam), lalu menampilkan plot observasi, model harmonik, residual, dan mengekspor report TXT.

## Struktur file

```text
pasut-web/
├── index.html
├── README.md
└── assets/
    ├── css/
    │   └── style.css
    └── js/
        ├── app.js
        ├── parser.js
        └── tide.js
```

## Format data yang didukung

Baris 1: nama stasiun  
Baris 2: header kolom  
Baris 3 dan seterusnya: data

Contoh:

```text
Tide gauge at Sabang
Time (UTC), bat(V), prs(m), ra2(m), rad(m), ras(m)
3/1/2026 0:00, 123, 3.16, 8.122, 8.099,
3/1/2026 0:01, 123, 3.162, 8.125, 8.102,
...
```

## Cara menjalankan lokal

### Opsi paling cepat
1. Extract folder `pasut-web`.
2. Buka `index.html` langsung di browser.
3. Upload file data CSV/XLSX.
4. Pilih sensor, start date, end date, resolusi, lalu klik **Proses Data**.
5. Klik tombol download untuk mengambil `report.txt` dan `observasi_vs_model.txt`.

### Opsi yang lebih rapi
Kalau mau pakai local server:

```bash
python -m http.server 8000
```

Lalu buka `http://localhost:8000`

## Cara upload ke GitHub dan hosting di GitHub Pages

### 1. Buat repository baru
Contoh nama repo: `pasut-web`

### 2. Upload isi folder
Upload semua isi folder ini ke branch `main`.

### 3. Aktifkan GitHub Pages
- Masuk ke **Settings** repo
- Buka menu **Pages**
- Pada **Build and deployment** pilih:
  - **Source**: `Deploy from a branch`
  - **Branch**: `main`
  - **Folder**: `/root`
- Klik **Save**

### 4. Tunggu deploy selesai
Biasanya 1–3 menit. Setelah itu GitHub akan memberi URL seperti:

```text
https://username.github.io/pasut-web/
```

## Cara update website
Kalau nanti mau ganti script atau tampilan:
1. Edit file HTML/CSS/JS.
2. Commit dan push lagi ke branch `main`.
3. GitHub Pages akan update otomatis.

## Catatan teknis
- Semua proses berjalan di browser.
- File pengguna tidak dikirim ke server.
- Sensor dibaca otomatis dari header, selain kolom waktu dan baterai.
- Komponen harmonik default: `M2, S2, K1, O1, N2, K2, P1, Q1`.
- Interpolasi gap pendek dilakukan sebelum resampling.
- Resampling saat ini memakai grid reguler sesuai resolusi yang dipilih.

## Pengembangan berikutnya yang gampang ditambah
- Pilihan ekspor PNG plot
- Tombol pilih semua / hapus semua komponen
- Multi-station dalam satu file workbook
- Opsi metode resampling: exact, nearest, average, linear
- Validasi kualitas data yang lebih detail
