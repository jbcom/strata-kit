/**
 * MCP Filesystem Client
 *
 * Uses @ai-sdk/mcp to connect to filesystem-mcp-server for file operations.
 * This enables the AI to read, write, and modify files in the repository.
 */

import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';

export type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;

/**
 * Create an MCP client connected to the filesystem server
 *
 * @param workingDirectory - The directory to use as the base for file operations
 */
export async function createFilesystemClient(
    workingDirectory: string
): Promise<MCPClient> {
    // Use npx to run filesystem-mcp-server if not installed globally
    const transport = new StdioMCPTransport({
        command: 'npx',
        args: ['-y', '@anthropic/filesystem-mcp-server', workingDirectory],
        cwd: workingDirectory,
    });

    const client = await createMCPClient({
        transport,
        name: 'strata-triage',
        version: '1.0.0',
    });

    return client;
}

/**
 * Get filesystem tools from the MCP client
 */
export async function getFilesystemTools(client: MCPClient): Promise<Awaited<ReturnType<MCPClient['tools']>>> {
    return client.tools();
}

/**
 * Create a simple inline MCP server for filesystem operations
 * This avoids external dependencies by implementing basic file ops directly
 */
export async function createInlineFilesystemClient(
    workingDirectory: string
): Promise<MCPClient> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');

    // Create a minimal MCP server script
    const serverCode = `
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const BASE_DIR = ${JSON.stringify(workingDirectory)};

function resolvePath(relativePath) {
    const resolved = path.resolve(BASE_DIR, relativePath);
    if (!resolved.startsWith(BASE_DIR)) {
        throw new Error('Path traversal not allowed');
    }
    return resolved;
}

const tools = {
    read_file: {
        name: 'read_file',
        description: 'Read the contents of a file',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file (relative to workspace)' }
            },
            required: ['path']
        }
    },
    write_file: {
        name: 'write_file',
        description: 'Write content to a file (creates parent directories if needed)',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file (relative to workspace)' },
                content: { type: 'string', description: 'Content to write' }
            },
            required: ['path', 'content']
        }
    },
    list_files: {
        name: 'list_files',
        description: 'List files and directories in a path',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to list (relative to workspace)', default: '.' }
            }
        }
    },
    search_files: {
        name: 'search_files',
        description: 'Search for files matching a pattern',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Glob pattern to match' },
                path: { type: 'string', description: 'Directory to search in', default: '.' }
            },
            required: ['pattern']
        }
    }
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.on('line', async (input) => {
    try {
        const request = JSON.parse(input);

        if (request.method === 'initialize') {
            console.log(JSON.stringify({
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'inline-filesystem', version: '1.0.0' }
                }
            }));
            return;
        }

        if (request.method === 'notifications/initialized') return;

        if (request.method === 'tools/list') {
            console.log(JSON.stringify({
                jsonrpc: '2.0',
                id: request.id,
                result: { tools: Object.values(tools) }
            }));
            return;
        }

        if (request.method === 'tools/call') {
            const { name, arguments: args } = request.params;
            let result;

            try {
                switch (name) {
                    case 'read_file': {
                        const filePath = resolvePath(args.path);
                        const content = await fs.readFile(filePath, 'utf-8');
                        result = { content };
                        break;
                    }
                    case 'write_file': {
                        const filePath = resolvePath(args.path);
                        await fs.mkdir(path.dirname(filePath), { recursive: true });
                        await fs.writeFile(filePath, args.content, 'utf-8');
                        result = { success: true, path: args.path };
                        break;
                    }
                    case 'list_files': {
                        const dirPath = resolvePath(args.path || '.');
                        const entries = await fs.readdir(dirPath, { withFileTypes: true });
                        result = {
                            files: entries.map(e => ({
                                name: e.name,
                                type: e.isDirectory() ? 'directory' : 'file'
                            }))
                        };
                        break;
                    }
                    case 'search_files': {
                        // Simple glob-like search
                        const searchDir = resolvePath(args.path || '.');
                        const pattern = args.pattern.replace(/\\*/g, '.*');
                        const regex = new RegExp(pattern);
                        const matches = [];

                        async function walk(dir) {
                            const entries = await fs.readdir(dir, { withFileTypes: true });
                            for (const entry of entries) {
                                const fullPath = path.join(dir, entry.name);
                                const relativePath = path.relative(BASE_DIR, fullPath);
                                if (entry.isDirectory()) {
                                    if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                                        await walk(fullPath);
                                    }
                                } else if (regex.test(relativePath)) {
                                    matches.push(relativePath);
                                }
                            }
                        }
                        await walk(searchDir);
                        result = { matches: matches.slice(0, 100) };
                        break;
                    }
                    default:
                        result = { error: 'Unknown tool: ' + name };
                }
            } catch (err) {
                result = { error: err.message };
            }

            console.log(JSON.stringify({
                jsonrpc: '2.0',
                id: request.id,
                result: { content: [{ type: 'text', text: JSON.stringify(result) }] }
            }));
        }
    } catch (err) {
        console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -1, message: err.message }
        }));
    }
});
`;

    // Write server to temp file
    const serverPath = path.join(os.tmpdir(), 'strata-fs-mcp-server.js');
    await fs.writeFile(serverPath, serverCode);

    const transport = new StdioMCPTransport({
        command: 'node',
        args: [serverPath],
        cwd: workingDirectory,
    });

    const client = await createMCPClient({
        transport,
        name: 'strata-triage',
        version: '1.0.0',
    });

    return client;
}
