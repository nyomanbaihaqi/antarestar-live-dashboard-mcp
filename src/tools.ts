/**
 * Tool MCP read-only untuk Hermes (AI) — semua narik dari Google Sheet live.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOverall, getHostSessions, inRange, sum, OverallRow } from "./sheet.js";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

/** Ringkas satu kumpulan OverallRow jadi total metrik. */
function totals(rows: OverallRow[]) {
  const gmv = sum(rows.map((r) => r.gmv));
  const orders = sum(rows.map((r) => r.orders));
  const views = sum(rows.map((r) => r.views));
  const items = sum(rows.map((r) => r.items));
  const durasi = sum(rows.map((r) => r.durasi));
  return {
    gmv, orders, items, views,
    liveHours: Math.round(durasi * 10) / 10,
    aov: orders ? Math.round(gmv / orders) : 0,
    cvr: views ? Math.round((orders / views) * 10000) / 100 : 0,
    gmvPerHour: durasi ? Math.round(gmv / durasi) : 0,
  };
}

export function registerTools(server: McpServer) {
  // ---- daftar filter ----
  server.registerTool("list_stores", {
    title: "Daftar Store",
    description: "Daftar semua store/akun yang ada datanya (Shopee & TikTok), untuk dipakai sebagai filter.",
    inputSchema: {},
  }, async () => {
    const d = await getOverall();
    const stores = [...new Set(d.map((r) => r.akun))].filter(Boolean).sort();
    const byPlatform = {
      Shopee: [...new Set(d.filter((r) => r.platform === "Shopee").map((r) => r.akun))],
      Tiktok: [...new Set(d.filter((r) => r.platform === "Tiktok").map((r) => r.akun))],
    };
    return ok({ stores, byPlatform });
  });

  server.registerTool("list_hosts", {
    title: "Daftar Host",
    description: "Daftar semua host yang pernah live (dari tab Data), untuk dipakai sebagai filter.",
    inputSchema: {},
  }, async () => {
    const d = await getHostSessions();
    const hosts = [...new Set(d.map((r) => r.host))].filter(Boolean).sort();
    return ok({ hosts, totalSessions: d.length });
  });

  // ---- performa overall ----
  server.registerTool("overall_performance", {
    title: "Overall Performance",
    description:
      "Performa live level store per hari (GMV, order, CVR, AOV, views, live hours). " +
      "Filter opsional: rentang tanggal, platform (Shopee/Tiktok), store. " +
      "Balikin total agregat + breakdown per hari + per platform.",
    inputSchema: {
      from: z.string().optional().describe("Tanggal mulai YYYY-MM-DD (opsional)"),
      to: z.string().optional().describe("Tanggal akhir YYYY-MM-DD (opsional)"),
      platform: z.enum(["Shopee", "Tiktok"]).optional().describe("Filter platform (opsional)"),
      store: z.string().optional().describe("Nama store/akun persis (opsional)"),
    },
  }, async ({ from, to, platform, store }) => {
    let rows = await getOverall();
    rows = rows.filter((r) =>
      inRange(r.tanggal, from, to) &&
      (!platform || r.platform === platform) &&
      (!store || r.akun === store));
    // per hari
    const byDay: Record<string, OverallRow[]> = {};
    rows.forEach((r) => { (byDay[r.tanggal] ||= []).push(r); });
    const daily = Object.keys(byDay).sort().map((d) => ({ tanggal: d, ...totals(byDay[d]) }));
    // per platform
    const perPlatform = (["Shopee", "Tiktok"] as const).map((p) => ({
      platform: p, ...totals(rows.filter((r) => r.platform === p)),
    })).filter((x) => x.gmv > 0 || x.orders > 0);
    return ok({
      filter: { from: from || null, to: to || null, platform: platform || "all", store: store || "all" },
      totals: totals(rows),
      perPlatform,
      daily,
      rowCount: rows.length,
    });
  });

  // ---- performa host ----
  server.registerTool("host_performance", {
    title: "Host Performance",
    description:
      "Agregat performa per host (GMV, order, CVR, AOV, jumlah sesi, jam live) + leaderboard. " +
      "Filter opsional: rentang tanggal, host tertentu.",
    inputSchema: {
      from: z.string().optional().describe("Tanggal mulai YYYY-MM-DD (opsional)"),
      to: z.string().optional().describe("Tanggal akhir YYYY-MM-DD (opsional)"),
      host: z.string().optional().describe("Nama host persis (opsional)"),
    },
  }, async ({ from, to, host }) => {
    let rows = await getHostSessions();
    rows = rows.filter((r) => inRange(r.tanggal, from, to) && (!host || r.host === host));
    const map: Record<string, any> = {};
    rows.forEach((r) => {
      const m = (map[r.host] ||= { host: r.host, sessions: 0, gmv: 0, orders: 0, views: 0, durasi: 0 });
      m.sessions++; m.gmv += r.gmv; m.orders += r.orders; m.views += r.views; m.durasi += r.durasi;
    });
    const leaderboard = Object.values(map).map((m: any) => ({
      host: m.host, sessions: m.sessions,
      gmv: Math.round(m.gmv), orders: m.orders,
      liveHours: Math.round(m.durasi * 10) / 10,
      aov: m.orders ? Math.round(m.gmv / m.orders) : 0,
      cvr: m.views ? Math.round((m.orders / m.views) * 10000) / 100 : 0,
    })).sort((a, b) => b.gmv - a.gmv);
    return ok({
      filter: { from: from || null, to: to || null, host: host || "all" },
      hostCount: leaderboard.length, sessionCount: rows.length,
      leaderboard,
      sessions: host ? rows.map((r) => ({ tanggal: r.tanggal, shift: r.shift, akun: r.akun, gmv: Math.round(r.gmv), orders: r.orders, cvr: Math.round((r.cvr || 0) * 100) / 100 })) : undefined,
    });
  });

  // ---- executive summary ----
  server.registerTool("executive_summary", {
    title: "Executive Summary",
    description:
      "Ringkasan eksekutif periode tertentu: total GMV/order/AOV/CVR/live-hours, kontribusi per platform, " +
      "top store, dan top host. Kasih 'period' (YYYY-MM) ATAU from/to. Default: bulan terakhir yang ada datanya.",
    inputSchema: {
      period: z.string().optional().describe("Bulan YYYY-MM (mis. 2026-08). Kalau diisi, override from/to."),
      from: z.string().optional().describe("Tanggal mulai YYYY-MM-DD (opsional)"),
      to: z.string().optional().describe("Tanggal akhir YYYY-MM-DD (opsional)"),
    },
  }, async ({ period, from, to }) => {
    const all = await getOverall();
    if (period) { from = period + "-01"; to = period + "-31"; }
    if (!from && !to) {
      const months = [...new Set(all.map((r) => r.tanggal.slice(0, 7)))].sort();
      const last = months[months.length - 1]; from = last + "-01"; to = last + "-31";
    }
    const rows = all.filter((r) => inRange(r.tanggal, from, to));
    const perPlatform = (["Shopee", "Tiktok"] as const).map((p) => {
      const t = totals(rows.filter((r) => r.platform === p));
      return { platform: p, gmv: t.gmv, orders: t.orders, aov: t.aov, cvr: t.cvr };
    }).filter((x) => x.gmv > 0);
    // top store
    const storeMap: Record<string, number> = {};
    rows.forEach((r) => { storeMap[r.akun] = (storeMap[r.akun] || 0) + r.gmv; });
    const topStores = Object.entries(storeMap).map(([akun, gmv]) => ({ akun, gmv: Math.round(gmv) }))
      .sort((a, b) => b.gmv - a.gmv).slice(0, 5);
    // top host (dari sesi host di periode yg sama)
    const host = await getHostSessions();
    const hrows = host.filter((r) => inRange(r.tanggal, from, to));
    const hmap: Record<string, { gmv: number; sesi: number }> = {};
    hrows.forEach((r) => { const m = (hmap[r.host] ||= { gmv: 0, sesi: 0 }); m.gmv += r.gmv; m.sesi++; });
    const topHosts = Object.entries(hmap).map(([h, m]) => ({ host: h, gmv: Math.round(m.gmv), sessions: m.sesi }))
      .sort((a, b) => b.gmv - a.gmv).slice(0, 5);
    return ok({
      period: period || `${from} s/d ${to}`,
      totals: totals(rows),
      perPlatform, topStores, topHosts,
    });
  });
}
