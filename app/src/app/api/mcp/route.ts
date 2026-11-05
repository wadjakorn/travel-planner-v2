// /api/mcp — MCP server v1 (TP-0035): Streamable HTTP, stateless, JSON
// responses. Auth = personal access token (Authorization: Bearer tp_…), the
// same per-token rate limit as /api/v1 (one HTTP request = one call: batching
// is rejected). Only POST is exported, so GET/DELETE are 405.

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { withApiContext } from '@/lib/api/http';
import { buildMcpServer } from '@/lib/mcp/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export function POST(req: Request) {
  return withApiContext(req, async ({ userId, scope }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
    }
    if (Array.isArray(body)) {
      return Response.json(
        { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batching is not supported; send one JSON-RPC message per request' } },
        { status: 400 },
      );
    }
    const server = buildMcpServer({ userId, scope });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(req, { parsedBody: body });
  });
}
