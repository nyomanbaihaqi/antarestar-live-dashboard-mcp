/**
 * Smoke test lapisan data (tanpa MCP) — mastiin fetch+parse+agregasi dari sheet live jalan.
 * Jalanin: npm run smoke
 */
import { getOverall, getHostSessions } from "../src/sheet.js";

const d = await getOverall();
const dates = d.map((r) => r.tanggal).sort();
const stores = [...new Set(d.map((r) => r.akun))];
const lastMonth = (dates[dates.length - 1] || "").slice(0, 7);
const mrows = d.filter((r) => r.tanggal.startsWith(lastMonth));
const gmv = mrows.reduce((a, r) => a + r.gmv, 0);
const ord = mrows.reduce((a, r) => a + r.orders, 0);
const vw = mrows.reduce((a, r) => a + r.views, 0);

const hosts = await getHostSessions();
const hostNames = [...new Set(hosts.map((h) => h.host))];

console.log("OVERALL rows :", d.length, "| range", dates[0], "→", dates[dates.length - 1]);
console.log("Stores       :", stores.join(" | "));
console.log(`Agregat ${lastMonth}: GMV=Rp${gmv.toLocaleString("id-ID")} · Order=${ord.toLocaleString("id-ID")} · CVR=${(ord / vw * 100).toFixed(2)}% · AOV=Rp${Math.round(gmv / ord).toLocaleString("id-ID")}`);
console.log("Host sessions:", hosts.length, "| hosts:", hostNames.length, "→", hostNames.slice(0, 8).join(", "));
console.log("\n✅ Data layer OK");
