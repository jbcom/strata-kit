/**
 * MCP Client Manager
 *
 * Connects to all configured MCP servers and provides unified tool access:
 * - GitHub MCP: Issues, PRs, repos, commits
 * - Playwright MCP: Browser automation, screenshots, testing
 * - Filesystem MCP: Read/write files in the workspace
 * - Context7 MCP: Documentation and context lookup
 */

import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';

export type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;
export type MCPTools = Awaited<ReturnType<MCPClient['tools']>>;

/**
 * Get filesystem tools from an MCP client
 */
export async function getFilesystemTools(client: MCPClient): Promise<MCPTools> {
    return client.tools();
}

export interface MCPClients {
    github?: MCPClient;
    playwright?: MCPClient;
    filesystem?: MCPClient;
}

/**
 * Create GitHub MCP client for repo operations
 */
export async function createGitHubClient(): Promise<MCPClient> {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN or GH_TOKEN required for GitHub MCP');
    }

    const transport = new StdioMCPTransport({
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {
            ...process.env,
            GITHUB_PERSONAL_ACCESS_TOKEN: token,
        },
    });

    return createMCPClient({
        transport,
        name: 'strata-triage-github',
        version: '1.0.0',
    });
}

/**
 * Create Playwright MCP client for browser automation
 */
export async function createPlaywrightClient(): Promise<MCPClient> {
    const transport = new StdioMCPTransport({
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
    });

    return createMCPClient({
        transport,
        name: 'strata-triage-playwright',
        version: '1.0.0',
    });
}

/**
 * Create Filesystem MCP client for file operations (external server)
 */
export async function createFilesystemClient(workingDirectory: string): Promise<MCPClient> {
    const transport = new StdioMCPTransport({
        command: 'npx',
        args: ['-y', '@anthropic/filesystem-mcp-server', workingDirectory],
        cwd: workingDirectory,
    });

    return createMCPClient({
        transport,
        name: 'strata-triage-filesystem',
        version: '1.0.0',
    });
}

/**
 * Create an inline MCP server for filesystem operations
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
        name: 'strata-triage-inline-fs',
        version: '1.0.0',
    });

    return client;
}

/**
 * Initialize all MCP clients
 *
 * @param options - Which clients to initialize
 */
export async function initializeMCPClients(options: {
    github?: boolean;
    playwright?: boolean;
    filesystem?: boolean | string;
}): Promise<MCPClients> {
    const clients: MCPClients = {};

    const initPromises: Promise<void>[] = [];

    if (options.github) {
        initPromises.push(
            createGitHubClient()
                .then(client => { clients.github = client; })
                .catch(err => console.warn('GitHub MCP unavailable:', err.message))
        );
    }

    if (options.playwright) {
        initPromises.push(
            createPlaywrightClient()
                .then(client => { clients.playwright = client; })
                .catch(err => console.warn('Playwright MCP unavailable:', err.message))
        );
    }

    if (options.filesystem) {
        const dir = typeof options.filesystem === 'string' ? options.filesystem : process.cwd();
        initPromises.push(
            createFilesystemClient(dir)
                .then(client => { clients.filesystem = client; })
                .catch(err => console.warn('Filesystem MCP unavailable:', err.message))
        );
    }

    await Promise.all(initPromises);

    return clients;
}

/**
 * Get combined tools from all active MCP clients
 */
export async function getAllTools(clients: MCPClients): Promise<MCPTools> {
    const allTools: MCPTools = {};

    for (const [name, client] of Object.entries(clients)) {
        if (client) {
            try {
                const tools = await client.tools();
                // Prefix tools with client name to avoid collisions
                for (const [toolName, tool] of Object.entries(tools)) {
                    allTools[`${name}_${toolName}`] = tool;
                }
            } catch (err) {
                console.warn(`Failed to get tools from ${name} MCP:`, err);
            }
        }
    }

    return allTools;
}

/**
 * Close all MCP clients
 */
export async function closeMCPClients(clients: MCPClients): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const client of Object.values(clients)) {
        if (client) {
            closePromises.push(
                client.close().catch(() => { /* ignore cleanup errors */ })
            );
        }
    }

    await Promise.all(closePromises);
}

/**
 * Run an agentic task with MCP tools
 *
 * This is the main entry point for running AI tasks that need to take action.
 * It initializes the appropriate MCP clients, runs the AI with tools, and cleans up.
 */
export async function runAgenticTask(options: {
    systemPrompt: string;
    userPrompt: string;
    mcpClients?: {
        github?: boolean;
        playwright?: boolean;
        filesystem?: boolean | string;
    };
    maxSteps?: number;
    onToolCall?: (toolName: string, args: unknown) => void;
}): Promise<{ text: string; toolCallCount: number }> {
    const {
        systemPrompt,
        userPrompt,
        mcpClients: clientOptions = { github: true, filesystem: true },
        maxSteps = 15,
        onToolCall,
    } = options;

    // Initialize MCP clients
    const clients = await initializeMCPClients(clientOptions);

    try {
        // Get all tools from all clients
        const tools = await getAllTools(clients);

        if (Object.keys(tools).length === 0) {
            throw new Error('No MCP tools available');
        }

        // Import AI SDK
        const { generateText } = await import('ai');
        const { getProvider, getModel } = await import('./ai.js');

        const provider = getProvider();
        const modelId = getModel();

        // Run the AI with tools
        const result = await generateText({
            model: provider(modelId),
            system: systemPrompt,
            prompt: userPrompt,
            tools,
            maxSteps,
            onStepFinish: ({ toolCalls }) => {
                if (toolCalls && onToolCall) {
                    for (const call of toolCalls) {
                        onToolCall(call.toolName, call.args);
                    }
                }
            },
        });

        const toolCallCount = result.steps?.reduce(
            (acc, s) => acc + (s.toolCalls?.length || 0),
            0
        ) || 0;

        return { text: result.text, toolCallCount };

    } finally {
        // Always clean up
        await closeMCPClients(clients);
    }
}
