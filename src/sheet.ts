/**
 * Data-access layer — baca Google Sheet yang sama dengan dashboard Antarestar Live.
 * Mapping kolom mengikuti _loadOverallDataImpl / loadHostData di index.html
 * supaya angka yang dilihat Hermes = angka yang tampil di dashboard.
 */
import { parseCSV, num, parseDateSP, parseDateTT, durToSec, durToHours, ttDurHours } from "./csv.js";

export const SHEET_ID = process.env.SHEET_ID || "1sFBf5cPc7NDjOsP-1AT0bfMlOwlPNPvNKLzoCcocp7s";
export const SHOPEE_GID = 1545970298;
export const TIKTOK_GID = 607171572;
export const HOST_GID = 697341730; // tab "Data"

const exportUrl = (gid: number) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
const gvizUrl = (gid: number) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;

const isHtml = (t: string) => !t || /^\s*<(?:!doctype|html)/i.test(t.slice(0, 60));

/** Ambil CSV dari export (fresh) dulu; fallback gviz kalau ke-block. */
async function fetchCsv(gid: number): Promise<string[][]> {
  const bust = "&_=" + Date.now();
  try {
    const t = await fetch(exportUrl(gid) + bust, { redirect: "follow" }).then((r) => r.text());
    if (!isHtml(t)) return parseCSV(t);
  } catch { /* fallthrough */ }
  const t2 = await fetch(gvizUrl(gid) + bust, { redirect: "follow" }).then((r) => r.text());
  return parseCSV(t2);
}

// ---- tipe data ----
export interface OverallRow {
  platform: "Shopee" | "Tiktok";
  akun: string; tanggal: string;
  gmv: number; orders: number; items: number; views: number;
  durasi: number; totalViewers?: number; engaged?: number; pcu?: number;
  awd: number; ctr: number; ctor: number; atc?: number; gpm?: number;
  like?: number; share?: number; comment?: number; followers?: number;
  // turunan (calcO)
  gmvh?: number; aov?: number; cvr?: number;
}
export interface HostRow {
  tanggal: string; shift: string; host: string; cohost: string;
  platform: string; akun: string; mulai: string; selesai: string;
  durasi: number; gmv: number; orders: number; buyers: number; items: number;
  views: number; pcu: number; ccu: number; comments: number; atc: number;
  awd: number; ctr: number; ctor: number; ket: string;
  gmvh?: number; aov?: number; cvr?: number;
}

/** Tambah metrik turunan (sama seperti calcO di dashboard). */
export function calcO<T extends { gmv: number; orders: number; views: number; durasi: number }>(r: T) {
  return {
    ...r,
    gmvh: r.durasi ? r.gmv / r.durasi : 0,
    aov: r.orders ? r.gmv / r.orders : 0,
    cvr: r.views ? (r.orders / r.views) * 100 : 0,
  };
}

// ---- cache TTL ringan (per-instance) ----
const CACHE_MS = 60_000;
const cache: Record<string, { t: number; v: any }> = {};
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const c = cache[key];
  if (c && Date.now() - c.t < CACHE_MS) return c.v as T;
  const v = await fn();
  cache[key] = { t: Date.now(), v };
  return v;
}

/** OVERALL_DATA — RAW Shopee + RAW Tiktok Per Day, digabung. */
export async function getOverall(): Promise<OverallRow[]> {
  return cached("overall", async () => {
    const [S, T] = await Promise.all([fetchCsv(SHOPEE_GID), fetchCsv(TIKTOK_GID)]);
    const out: OverallRow[] = [];
    for (let i = 1; i < S.length; i++) {
      const c = S[i]; if (!c || !c[0]) continue;
      const tgl = parseDateSP(c[1]); if (!tgl) continue;
      out.push({
        platform: "Shopee", akun: (c[0] || "").trim(), tanggal: tgl,
        gmv: num(c[4]), orders: num(c[10]), items: num(c[12]),
        durasi: durToHours(c[19]), totalViewers: num(c[21]), engaged: num(c[22]),
        views: num(c[23]), pcu: num(c[24]), awd: durToSec(c[25]),
        ctr: num(c[38]), ctor: num(c[42]), atc: num(c[43]), gpm: num(c[45]),
        like: num(c[54]), share: num(c[55]), comment: num(c[56]), followers: num(c[57]),
      });
    }
    for (let i = 1; i < T.length; i++) {
      const c = T[i]; if (!c || !c[0]) continue;
      const tgl = parseDateTT(c); if (!tgl) continue;
      const gmv = num(c[6]), orders = num(c[8]), views = num(c[12]);
      const ctr = num(c[21]), ctor = num(c[25]), awd = durToSec(c[19]);
      const like = num(c[34]), comment = num(c[30]), followers = num(c[28]);
      if (!gmv && !orders && !views && !ctr && !ctor && !awd && !like && !comment && !followers) continue;
      const dur = ttDurHours(c[4], c[5]);
      out.push({
        platform: "Tiktok", akun: (c[0] || "").trim(), tanggal: tgl,
        gmv, orders, items: num(c[7]), views, durasi: dur, awd, ctr, ctor,
        gpm: num(c[15]), like, share: num(c[32]), comment, followers,
      });
    }
    // dedupe Shopee by akun|tanggal (ambil terakhir); Tiktok dibiarkan (multi-sesi)
    const seen = new Map<string, OverallRow>(); const tk: OverallRow[] = [];
    for (const r of out) {
      if (r.platform !== "Shopee") { tk.push(r); continue; }
      seen.set(r.akun + "|" + r.tanggal, r);
    }
    return [...seen.values(), ...tk].map(calcO);
  });
}

/** Host sessions — tab "Data". */
export async function getHostSessions(): Promise<HostRow[]> {
  return cached("host", async () => {
    const rows = await fetchCsv(HOST_GID);
    const out: HostRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const c = rows[i]; if (!c || c.length < 7) continue;
      const tgl = parseDateSP(c[1]) || isoLoose(c[1]); const host = (c[3] || "").trim();
      if (!tgl || !host) continue;
      out.push(calcO({
        tanggal: tgl, shift: (c[2] || "").trim(), host, cohost: (c[4] || "").trim(),
        platform: normPlat(c[5]), akun: (c[6] || "").trim(), mulai: (c[7] || "").trim(), selesai: (c[8] || "").trim(),
        durasi: num(c[9]), gmv: num(c[10]), orders: num(c[11]), buyers: num(c[12]), items: num(c[13]),
        views: num(c[14]), pcu: num(c[15]), ccu: num(c[16]), comments: num(c[17]), atc: num(c[18]),
        awd: num(c[19]), ctr: num(c[20]), ctor: num(c[21]), ket: (c[22] || "").trim(),
      }) as HostRow);
    }
    return out;
  });
}

const normPlat = (p: string) => { p = (p || "").toLowerCase(); return /tiktok/.test(p) ? "Tiktok" : /shopee/.test(p) ? "Shopee" : (p || "-"); };
function isoLoose(s: string): string {
  const m = String(s || "").match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}

// ---- util filter & agregasi ----
export function inRange(tanggal: string, from?: string, to?: string): boolean {
  if (from && tanggal < from) return false;
  if (to && tanggal > to) return false;
  return true;
}
export function sum(arr: number[]): number { return arr.reduce((a, b) => a + (b || 0), 0); }
