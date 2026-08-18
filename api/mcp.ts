/**
 * Endpoint MCP Remote (Streamable HTTP) — Vercel Serverless Function.
 * Hermes connect ke: https://<domain>/api/mcp  (header: x-api-key: <MCP_API_KEY>)
 *
 * Mode STATELESS: tiap request bikin server+transport baru, cocok untuk serverless.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "../src/tools.js";

function setCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-api-key, authorization, mcp-session-id, mcp-protocol-version");
}

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse) {
  setCors(res);
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

  // --- auth via API key (set MCP_API_KEY di Vercel Environment Variables) ---
  const need = process.env.MCP_API_KEY;
  if (need) {
    const got = (req.headers["x-api-key"] as string) ||
      String(req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
    if (got !== need) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "unauthorized — kirim header x-api-key yang benar" }));
      return;
    }
  }

  // health check / info via GET
  if (req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      name: "antarestar-live-mcp", status: "ok",
      tools: ["list_stores", "list_hosts", "overall_performance", "host_performance", "executive_summary"],
      usage: "POST JSON-RPC MCP ke endpoint ini (Streamable HTTP).",
    }));
    return;
  }

  if (req.method !== "POST") { res.statusCode = 405; res.end("Method Not Allowed"); return; }

  const server = new McpServer({ name: "antarestar-live", version: "1.0.0" });
  registerTools(server);

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
  res.on("close", () => { transport.close(); server.close(); });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: String(err) }, id: null }));
    }
  }
}
