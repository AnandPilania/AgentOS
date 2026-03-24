import fs from 'fs/promises'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
const execFileAsync = promisify(execFile)
import fg from 'fast-glob'
import type { ToolResult, BuiltinTool } from '../../shared/types'
import { logger } from '../utils/logger'

export interface ToolExecutionContext {
    workspacePath: string
    agentId: string
    onProgress?: (msg: string) => void
}

// ─── Tool Definitions (for AI context) ────────────────────
export const BUILTIN_TOOL_DEFINITIONS = [
    {
        name: 'read_file',
        description: 'Read the contents of a file in the workspace',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Relative path to file from workspace root' },
            },
            required: ['path'],
        },
    },
    {
        name: 'write_file',
        description: 'Write content to a file in the workspace (creates directories as needed)',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Relative path to file' },
                content: { type: 'string', description: 'File content to write' },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'list_files',
        description: 'List files in a directory of the workspace using glob patterns',
        input_schema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Glob pattern, e.g. "src/**/*.ts"' },
                cwd: { type: 'string', description: 'Subdirectory to list from (optional)' },
            },
            required: ['pattern'],
        },
    },
    {
        name: 'bash',
        description: 'Execute a bash command in the workspace directory',
        input_schema: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'Shell command to execute' },
                timeout: { type: 'number', description: 'Timeout in milliseconds (default 30000)' },
            },
            required: ['command'],
        },
    },
    {
        name: 'search_code',
        description: 'Search for a pattern across all files in the workspace',
        input_schema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Text or regex to search for' },
                glob: { type: 'string', description: 'File glob to limit search, e.g. "**/*.ts"' },
                max_results: { type: 'number', description: 'Maximum results to return (default 50)' },
            },
            required: ['pattern'],
        },
    },
    {
        name: 'grep',
        description: 'Grep for a pattern in a specific file',
        input_schema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Pattern to grep for' },
                path: { type: 'string', description: 'File to search in' },
            },
            required: ['pattern', 'path'],
        },
    },
    {
        name: 'git_status',
        description: 'Get git status of the workspace (changed files, staged changes)',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'git_diff',
        description: 'Get git diff of the workspace or a specific file',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Optional specific file path' },
                staged: { type: 'boolean', description: 'Show staged diff (default false)' },
            },
        },
    },
    {
        name: 'git_commit',
        description: 'Stage all changes and create a git commit',
        input_schema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Commit message' },
            },
            required: ['message'],
        },
    },
] as const

// ─── ToolEngine ────────────────────────────────────────────
export class ToolEngine {
    async execute(
        tool: BuiltinTool,
        input: Record<string, unknown>,
        ctx: ToolExecutionContext,
    ): Promise<ToolResult> {
        const start = Date.now()
        const callId = `tool-${Date.now()}`

        logger.debug(`Tool: ${tool} input=${JSON.stringify(input).slice(0, 200)}`)

        try {
            let output: string

            switch (tool) {
                case 'read_file': output = await this.readFile(input, ctx); break
                case 'write_file': output = await this.writeFile(input, ctx); break
                case 'list_files': output = await this.listFiles(input, ctx); break
                case 'bash': output = await this.bash(input, ctx); break
                case 'search_code': output = await this.searchCode(input, ctx); break
                case 'grep': output = await this.grep(input, ctx); break
                case 'git_status': output = await this.gitStatus(ctx); break
                case 'git_diff': output = await this.gitDiff(input, ctx); break
                case 'git_commit': output = await this.gitCommit(input, ctx); break
                default: output = `Unknown tool: ${tool}`
            }

            return { toolCallId: callId, output, isError: false, duration: Date.now() - start }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            logger.warn(`Tool ${tool} error: ${msg}`)
            return { toolCallId: callId, output: `Error: ${msg}`, isError: true, duration: Date.now() - start }
        }
    }

    private safeJoin(base: string, rel: string): string {
        const resolved = path.resolve(base, rel)
        if (!resolved.startsWith(path.resolve(base))) throw new Error(`Path traversal blocked: ${rel}`)
        return resolved
    }

    private async readFile(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
        const filePath = this.safeJoin(ctx.workspacePath, String(input.path))
        const content = await fs.readFile(filePath, 'utf-8')
        const lines = content.split('\n')
        if (lines.length > 500) {
            return lines.slice(0, 500).join('\n') + `\n\n... (truncated, ${lines.length} total lines)`
        }
        return content
    }

    private async writeFile(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
        const filePath = this.safeJoin(ctx.workspacePath, String(input.path))
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, String(input.content), 'utf-8')
        ctx.onProgress?.(`Wrote ${String(input.path)}`)
        return `Successfully wrote ${String(input.path)}`
    }

    private async listFiles(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
        const cwd = input.cwd ? this.safeJoin(ctx.workspacePath, String(input.cwd)) : ctx.workspacePath
        const pattern = String(input.pattern ?? '**/*')
        const files = await fg(pattern, {
            cwd,
            ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.next/**', '**/build/**'],
            onlyFiles: true,
            dot: false,
        })
        return files.slice(0, 200).join('\n') || 'No files found'
    }

    private async bash(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
        const cmd = String(input.command)
        const timeout = Number(input.timeout ?? 30_000)

        // Block dangerous commands
        const blocked = ['rm -rf /', 'dd if=', 'mkfs', ':(){:|:&};:', 'fork bomb']
        if (blocked.some(b => cmd.includes(b))) throw new Error('Blocked dangerous command')

        ctx.onProgress?.(`$ ${cmd}`)

        let stdout = '', stderr = '', exitCode = 0
        try {
            const result = await execFileAsync('bash', ['-c', cmd], {
                cwd: ctx.workspacePath,
                timeout,
                env: { ...process.env, TERM: 'dumb' },
                maxBuffer: 10 * 1024 * 1024,
            })
            stdout = result.stdout ?? ''
            stderr = result.stderr ?? ''
        } catch (err: unknown) {
            const e = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean }
            stdout = e.stdout ?? ''
            stderr = e.stderr ?? ''
            exitCode = typeof e.code === 'number' ? e.code : 1
            if (e.killed) stderr += '\n(Process timed out)'
        }
        const out = [stdout, stderr].filter(Boolean).join('\n').trim()
        return (out || '(no output)') + (exitCode !== 0 ? `\n\nExit code: ${exitCode}` : '')
    }

    private async searchCode(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
        const pattern = String(input.pattern)
        const glob = String(input.glob ?? '**/*')
        const maxResults = Number(input.max_results ?? 50)

        const files = await fg(glob, {
            cwd: ctx.workspacePath,
            ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
            onlyFiles: true,
        })

        const results: string[] = []
        const regex = new RegExp(pattern, 'gi')

        for (const file of files) {
            if (results.length >= maxResults) break
            try {
                const content = await fs.readFile(path.join(ctx.workspacePath, file), 'utf-8')
                const lines = content.split('\n')
                lines.forEach((line, i) => {
                    if (results.length >= maxResults) return
                    if (regex.test(line)) {
                        results.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`)
                    }
                    regex.lastIndex = 0
                })
            } catch {
                //
            }
        }

        return results.length > 0 ? results.join('\n') : 'No matches found'
    }

    private async grep(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
        const filePath = this.safeJoin(ctx.workspacePath, String(input.path))
        const pattern = String(input.pattern)
        const content = await fs.readFile(filePath, 'utf-8')
        const regex = new RegExp(pattern, 'gi')
        const matches = content.split('\n')
            .map((l, i) => ({ line: l, num: i + 1 }))
            .filter(({ line }) => regex.test(line))
            .map(({ line, num }) => `${num}: ${line}`)
        return matches.join('\n') || 'No matches'
    }

    private async gitStatus(ctx: ToolExecutionContext): Promise<string> {
        try {
            const result = await execFileAsync('git', ['status', '--short'], {
                cwd: ctx.workspacePath, maxBuffer: 1024 * 1024,
            })
            return result.stdout?.trim() || 'Nothing to commit, working tree clean'
        } catch (err: unknown) {
            const e = err as { stdout?: string; stderr?: string }
            return e.stdout?.trim() || e.stderr?.trim() || 'Nothing to commit, working tree clean'
        }
    }

    private async gitDiff(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
        const args = ['diff', '--stat']
        if (input.staged) args.splice(1, 0, '--cached')
        if (input.path) args.push('--', String(input.path))
        try {
            const result = await execFileAsync('git', args, { cwd: ctx.workspacePath, maxBuffer: 5 * 1024 * 1024 })
            return result.stdout?.trim() || 'No changes'
        } catch (err: unknown) {
            const e = err as { stdout?: string }
            return e.stdout?.trim() || 'No changes'
        }
    }

    private async gitCommit(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
        await execFileAsync('git', ['add', '.'], { cwd: ctx.workspacePath })
        try {
            const result = await execFileAsync('git', ['commit', '-m', String(input.message)], { cwd: ctx.workspacePath })
            return result.stdout?.trim() || 'Committed'
        } catch (err: unknown) {
            const e = err as { stdout?: string; stderr?: string }
            return (e.stdout || e.stderr || 'Commit failed').trim()
        }
    }
}
