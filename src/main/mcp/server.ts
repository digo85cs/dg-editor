// Servidor MCP do DG Editor (stdio).
// Transporte + gate; a implementacao das tools vive em ./dispatch
// (compartilhada com o servidor HTTP — src/main/mcp/http-server.ts).

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { TOOLS, executarToolCall } from './dispatch'

const server = new Server(
  { name: 'dg-editor-vault', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
  return executarToolCall(req.params.name, req.params.arguments, extra?.signal)
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[mcp-dg-editor] servidor ativo no stdio')
}

main().catch((e) => {
  console.error('[mcp-dg-editor] falhou:', e)
  process.exit(1)
})
