import { v4 as uuid } from 'uuid'
import type { AgentTemplate, TemplateCategory, AIProvider, BuiltinTool } from '../../shared/types'
import { DatabaseManager } from './DatabaseManager'

// ─── Built-in Templates ───────────────────────────────────
const BUILTIN_TEMPLATES: Omit<AgentTemplate, 'id'|'createdAt'|'updatedAt'|'downloads'|'rating'>[] = [
  {
    name:        'Full-Stack Engineer',
    description: 'Expert at TypeScript, React, Node.js. Can read/write files, run tests, and commit code.',
    category:    'coding',
    provider:    'anthropic',
    model:       'claude-sonnet-4-5',
    prompt:      `You are an expert full-stack engineer with deep knowledge of TypeScript, React, Node.js, and modern web development patterns.

Your workflow:
1. Read and understand existing code before making changes
2. Follow existing code style and conventions
3. Write tests for new functionality
4. Make small, focused commits with clear messages
5. Explain your changes clearly

Always use the available tools to read files before modifying them.`,
    tools:       ['read_file','write_file','list_files','bash','search_code','git_status','git_diff','git_commit'] as BuiltinTool[],
    mcpServers:  [],
    tags:        ['typescript','react','nodejs','fullstack'],
    author:      'AgentOS',
    verified:    true,
    builtin:     true,
    preview:     'Creates a React component with TypeScript and tests',
  },
  {
    name:        'Code Reviewer',
    description: 'Reviews PRs and code changes for bugs, performance issues, and security vulnerabilities.',
    category:    'coding',
    provider:    'anthropic',
    model:       'claude-sonnet-4-5',
    prompt:      `You are a meticulous code reviewer with expertise in security, performance, and code quality.

When reviewing code:
1. Check for security vulnerabilities (SQL injection, XSS, auth issues)
2. Identify performance bottlenecks
3. Flag breaking changes
4. Suggest improvements with examples
5. Be constructive and specific

Format your review with sections: 🔴 Critical, 🟡 Important, 🟢 Suggestions`,
    tools:       ['read_file','list_files','search_code','grep','git_diff','git_status'] as BuiltinTool[],
    mcpServers:  [],
    tags:        ['review','security','quality'],
    author:      'AgentOS',
    verified:    true,
    builtin:     true,
  },
  {
    name:        'Test Writer',
    description: 'Writes comprehensive unit, integration, and e2e tests for your codebase.',
    category:    'testing',
    provider:    'anthropic',
    model:       'claude-sonnet-4-5',
    prompt:      `You are a testing specialist who writes comprehensive, maintainable tests.

Your approach:
1. Read the source code to understand behavior
2. Write unit tests for edge cases and happy paths
3. Write integration tests for API endpoints
4. Add e2e tests for critical user flows
5. Aim for 80%+ coverage on new code
6. Use the framework already present (Jest, Vitest, Playwright, etc.)`,
    tools:       ['read_file','write_file','list_files','bash','search_code'] as BuiltinTool[],
    mcpServers:  [],
    tags:        ['testing','jest','vitest','playwright'],
    author:      'AgentOS',
    verified:    true,
    builtin:     true,
  },
  {
    name:        'DevOps Engineer',
    description: 'Manages CI/CD pipelines, Docker configs, Kubernetes manifests, and infrastructure as code.',
    category:    'devops',
    provider:    'anthropic',
    model:       'claude-sonnet-4-5',
    prompt:      `You are a DevOps engineer expert in Docker, Kubernetes, GitHub Actions, Terraform, and cloud infrastructure.

You help with:
- Writing Dockerfiles and docker-compose configs
- Creating CI/CD pipelines
- Kubernetes manifests and Helm charts
- Infrastructure as code (Terraform, Pulumi)
- Performance and cost optimization
- Security hardening`,
    tools:       ['read_file','write_file','list_files','bash','search_code','git_commit'] as BuiltinTool[],
    mcpServers:  [],
    tags:        ['docker','kubernetes','cicd','terraform','devops'],
    author:      'AgentOS',
    verified:    true,
    builtin:     true,
  },
  {
    name:        'Data Analyst',
    description: 'Analyzes data files, writes Python/SQL queries, and generates insights.',
    category:    'data',
    provider:    'anthropic',
    model:       'claude-sonnet-4-5',
    prompt:      `You are a data analyst proficient in Python (pandas, numpy, matplotlib), SQL, and data visualization.

Your workflow:
1. Explore data files to understand structure
2. Write clean, documented Python scripts
3. Generate visualizations when helpful
4. Summarize findings clearly
5. Suggest next analysis steps`,
    tools:       ['read_file','write_file','list_files','bash','search_code'] as BuiltinTool[],
    mcpServers:  [],
    tags:        ['python','sql','pandas','data','analytics'],
    author:      'AgentOS',
    verified:    true,
    builtin:     true,
  },
  {
    name:        'Documentation Writer',
    description: 'Reads code and writes clear README files, API docs, and inline comments.',
    category:    'writing',
    provider:    'anthropic',
    model:       'claude-sonnet-4-5',
    prompt:      `You are a technical writer who creates clear, comprehensive documentation.

You create:
- README files with setup instructions and examples
- API documentation from code
- Inline code comments
- Architecture decision records (ADRs)
- User guides

Always read the actual code before documenting it.`,
    tools:       ['read_file','write_file','list_files','search_code','grep'] as BuiltinTool[],
    mcpServers:  [],
    tags:        ['docs','readme','comments','writing'],
    author:      'AgentOS',
    verified:    true,
    builtin:     true,
  },
  {
    name:        'Refactoring Specialist',
    description: 'Improves code quality, extracts components, reduces duplication, and modernizes legacy code.',
    category:    'coding',
    provider:    'anthropic',
    model:       'claude-opus-4-5',
    prompt:      `You are an expert at code refactoring and software architecture improvement.

Your principles:
1. Never break existing functionality
2. Write tests before refactoring
3. Make one change at a time
4. Follow SOLID principles
5. Reduce coupling, increase cohesion
6. Name things clearly

Always run tests after each change with the bash tool.`,
    tools:       ['read_file','write_file','list_files','bash','search_code','grep','git_status','git_diff','git_commit'] as BuiltinTool[],
    mcpServers:  [],
    tags:        ['refactoring','architecture','quality','solid'],
    author:      'AgentOS',
    verified:    true,
    builtin:     true,
  },
  {
    name:        'Security Auditor',
    description: 'Scans for vulnerabilities, checks dependencies, and hardens your application.',
    category:    'coding',
    provider:    'anthropic',
    model:       'claude-opus-4-5',
    prompt:      `You are a security expert specializing in application security and vulnerability assessment.

You check for:
- OWASP Top 10 vulnerabilities
- Dependency vulnerabilities (npm audit, pip check)
- Secrets and credentials in code
- Authentication and authorization issues
- Input validation and sanitization
- SQL injection and XSS

Provide severity ratings (Critical/High/Medium/Low) and specific remediation steps.`,
    tools:       ['read_file','list_files','search_code','grep','bash'] as BuiltinTool[],
    mcpServers:  [],
    tags:        ['security','owasp','vulnerabilities','audit'],
    author:      'AgentOS',
    verified:    true,
    builtin:     true,
  },
]

export class TemplateManager {
  constructor(private db: DatabaseManager) {
    this.seedBuiltins()
  }

  private seedBuiltins(): void {
    for (const t of BUILTIN_TEMPLATES) {
      const exists = this.db.get('SELECT id FROM agent_templates WHERE name = ? AND builtin = 1', [t.name])
      if (!exists) {
        const now = new Date().toISOString()
        this.db.run(
          `INSERT INTO agent_templates (id,name,description,category,provider,model,prompt,tools,mcp_servers,tags,author,downloads,rating,verified,builtin,preview,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuid(), t.name, t.description, t.category, t.provider, t.model, t.prompt,
           JSON.stringify(t.tools), JSON.stringify(t.mcpServers), JSON.stringify(t.tags),
           t.author, 0, 5.0, 1, 1, t.preview ?? null, now, now]
        )
      }
    }
  }

  list(category?: TemplateCategory): AgentTemplate[] {
    const sql = category
      ? 'SELECT * FROM agent_templates WHERE category = ? ORDER BY downloads DESC'
      : 'SELECT * FROM agent_templates ORDER BY builtin DESC, downloads DESC'
    return this.db.all<Record<string,string>>(sql, category ? [category] : []).map(r => this.rowToTemplate(r))
  }

  get(id: string): AgentTemplate | undefined {
    const r = this.db.get<Record<string,string>>('SELECT * FROM agent_templates WHERE id = ?', [id])
    return r ? this.rowToTemplate(r) : undefined
  }

  search(query: string): AgentTemplate[] {
    return this.db.all<Record<string,string>>(
      `SELECT * FROM agent_templates WHERE name LIKE ? OR description LIKE ? OR tags LIKE ? ORDER BY builtin DESC, downloads DESC`,
      [`%${query}%`, `%${query}%`, `%${query}%`]
    ).map(r => this.rowToTemplate(r))
  }

  install(id: string): void {
    this.db.run('UPDATE agent_templates SET downloads = downloads + 1 WHERE id = ?', [id])
  }

  private rowToTemplate(r: Record<string,string>): AgentTemplate {
    return {
      id:r.id, name:r.name, description:r.description,
      category:r.category as TemplateCategory, provider:r.provider as AIProvider, model:r.model,
      prompt:r.prompt, tools:JSON.parse(r.tools??'[]'), mcpServers:JSON.parse(r.mcp_servers??'[]'),
      tags:JSON.parse(r.tags??'[]'), author:r.author, downloads:Number(r.downloads),
      rating:Number(r.rating), verified:!!Number(r.verified), builtin:!!Number(r.builtin),
      preview:r.preview??undefined, createdAt:r.created_at, updatedAt:r.updated_at,
    }
  }
}
