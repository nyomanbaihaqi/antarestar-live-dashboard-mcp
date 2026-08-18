# Antarestar Live — MCP Server (buat Hermes)

MCP **read-only** yang ngasih Hermes (AI agent) akses ke data **Antarestar Live Dashboard**.
Narik dari **Google Sheet yang sama** dengan dashboard, pakai mapping kolom yang identik — jadi
angka yang dibaca Hermes = angka yang tampil di dashboard.

## Tools yang tersedia
| Tool | Fungsi |
|---|---|
| `list_stores` | Daftar store/akun (Shopee & TikTok) |
| `list_hosts` | Daftar host |
| `overall_performance` | GMV/order/CVR/AOV/views/live-hours per store per hari (+ total, + per platform). Filter: `from`, `to`, `platform`, `store` |
| `host_performance` | Leaderboard host + detail sesi. Filter: `from`, `to`, `host` |
| `executive_summary` | Ringkasan periode: total, kontribusi platform, top store, top host. Param: `period` (YYYY-MM) atau `from`/`to` |

Semua tanggal format **YYYY-MM-DD**. Read-only — Hermes nggak bisa ngubah data.

---

## 1. Setup lokal & tes
```bash
npm install
npm run smoke      # tes lapisan data ke sheet live (harus keluar angka)
npm run typecheck  # cek TypeScript
```

Tes sebagai MCP stdio (buat Hermes lokal / MCP Inspector):
```bash
npx @modelcontextprotocol/inspector npx tsx src/stdio.ts
```

## 2. Deploy ke Vercel (remote HTTP — buat Hermes cloud)
```bash
npm i -g vercel      # kalau belum
vercel               # deploy (ikutin promptnya)
vercel --prod        # deploy production
```
Lalu di **Vercel → Project → Settings → Environment Variables**, set:
- `MCP_API_KEY` = kunci rahasia panjang (Hermes wajib kirim ini)
- (opsional) `SHEET_ID` kalau mau override spreadsheet

Endpoint MCP-nya:
```
https://<project>.vercel.app/api/mcp      (atau /mcp)
```

## 3. Sambungin Hermes
Hermes (klien MCP) connect via **Streamable HTTP** ke URL di atas, dengan header:
```
x-api-key: <MCP_API_KEY>
```

Contoh config MCP (format umum klien MCP):
```json
{
  "mcpServers": {
    "antarestar-live": {
      "url": "https://<project>.vercel.app/api/mcp",
      "headers": { "x-api-key": "<MCP_API_KEY>" }
    }
  }
}
```

Cek cepat endpoint hidup (GET):
```bash
curl -H "x-api-key: <MCP_API_KEY>" https://<project>.vercel.app/api/mcp
```

---

## Arsitektur
```
Hermes (AI) ──MCP/HTTP──► api/mcp.ts ──► src/tools.ts ──► src/sheet.ts ──CSV──► Google Sheet
                          (Vercel)        (5 tools)      (parse + calcO)        (RAW Shopee/Tiktok, Data)
```
- `src/csv.ts` — parser & konversi angka/tanggal (diport dari dashboard).
- `src/sheet.ts` — fetch + parse + agregasi (cache 60 detik per-instance).
- `src/tools.ts` — definisi 5 tool MCP.
- `api/mcp.ts` — endpoint Streamable HTTP + auth API key (Vercel).
- `src/stdio.ts` — mode lokal (stdio).

## Catatan
- **Read-only**: nggak ada tool tulis. Aman.
- Data ikut sheet — begitu dashboard/importer nambah data, MCP otomatis ikut fresh (cache 60s).
- Mau nambah tool (mis. `checkpoint_daily_live`, `daily_report_host`)? Tinggal tambah di `src/tools.ts` + parser tab-nya di `src/sheet.ts`.
