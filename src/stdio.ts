/**
 * Entry LOKAL (stdio) — buat testing cepat / Hermes yang jalan lokal.
 * Jalanin: npx tsx src/stdio.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const server = new McpServer({ name: "antarestar-live", version: "1.0.0" });
registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("antarestar-live-mcp (stdio) siap.");
