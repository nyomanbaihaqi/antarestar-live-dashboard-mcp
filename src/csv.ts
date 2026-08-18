/**
 * Parsing & konversi angka/tanggal — DIPORT dari dashboard (index.html) supaya
 * angka yang dibaca MCP konsisten 100% dengan yang tampil di dashboard.
 */

/** CSV parser quote-aware (menangani koma & newline di dalam sel). */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/** Angka format Indonesia ("Rp1.234.567,89", "12,5%") → number. */
export function num(s: unknown): number {
  if (s == null) return 0;
  let t = String(s).replace(/[%\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

/** Tanggal Shopee "DD-MM-YYYY" → "YYYY-MM-DD". */
export function parseDateSP(s: string): string {
  const m = (s || "").trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

/** Tanggal TikTok — kolom B "M/D/YYYY" atau ISO, fallback ke Start Time (kolom E). */
export function parseDateTT(c: string[]): string {
  let m = String(c[1] || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = String(c[1] || "").match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = String(c[4] || "").match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}

/** Durasi ("18j58m16d" / "0:12:30" / "42d" / angka detik) → detik. */
export function durToSec(s: string): number {
  s = (s || "").trim();
  if (!s) return 0;
  if (s.indexOf(":") >= 0) {
    const p = s.split(":").map(Number);
    if (p.length === 3) return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    if (p.length === 2) return (p[0] || 0) * 60 + (p[1] || 0);
  }
  if (/[jmd]/i.test(s)) {
    const j = (s.match(/(\d+)\s*j/i) || [])[1];
    const mm = (s.match(/(\d+)\s*m/i) || [])[1];
    const dd = (s.match(/(\d+)\s*d/i) || [])[1];
    return (+j || 0) * 3600 + (+mm || 0) * 60 + (+dd || 0);
  }
  return num(s);
}
export const durToHours = (s: string): number => durToSec(s) / 3600;

/** Durasi TikTok = End − Start (jam), tahan lewat tengah malam. */
export function ttDurHours(startStr: string, endStr: string): number {
  const dt = (s: string): number => {
    const m = String(s).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6] || 0) : NaN;
  };
  const a = dt(startStr), b = dt(endStr);
  if (isNaN(a) || isNaN(b)) return 0;
  let h = (b - a) / 3600000;
  if (h < 0) h += 24;
  return h >= 0 && h < 24 ? h : 0;
}
