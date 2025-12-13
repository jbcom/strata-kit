# @strata/triage

> AI-powered autonomous development automation for Strata

The triage CLI is the central orchestrator for Strata's development lifecycle - from issue triage to release. It replaces multiple external tools (Claude, Aider, semantic-release) with a unified, AI-driven automation system.

## Installation

```bash
# From workspace root
pnpm install
pnpm run build

# CLI is available at
node internal/triage/dist/cli.js --help
```

## Quick Start

```bash
# Assess an issue with AI
triage assess 123

# Generate tests for a file
triage generate src/core/math/noise.ts --type unit

# Review a PR
triage review 144

# Run a full sprint planning cycle
triage sprint
```

## Commands

### Issue & PR Management

| Command | Description |
|---------|-------------|
| `assess <issue>` | AI analyzes issue and adds labels, estimates |
| `label <issue>` | Auto-label based on content |
| `plan <issue>` | Create implementation plan with sub-tasks |
| `develop <issue>` | AI implements the issue (creates PR) |
| `review <pr>` | AI code review with suggestions |
| `feedback <pr>` | Process review comments, resolve threads |
| `verify <pr>` | Run tests and validate PR |
| `automerge <pr> <action>` | Manage auto-merge (enable/disable/wait) |

### Testing & Quality

| Command | Description |
|---------|-------------|
| `test <issue>` | Generate and run tests for an issue |
| `generate <file>` | Generate unit/integration/e2e tests |
| `diagnose <report>` | Analyze test failures, create bug issues |
| `coverage <report>` | Find coverage gaps, create issues |
| `scan` | Run custom security scanner |
| `security` | Analyze CodeQL/Dependabot alerts |

### Planning & Automation

| Command | Description |
|---------|-------------|
| `sprint` | Weekly sprint planning with AI |
| `roadmap` | Generate quarterly roadmap |
| `cascade` | Run full automation cycle |
| `harness` | Execute test harness scenarios |
| `configure` | Configure repo settings for triage |

### Release

| Command | Description |
|---------|-------------|
| `release` | Full release cycle (changelog, tag, npm, GitHub) |

## Environment Variables

```bash
# Required
GH_TOKEN=ghp_xxx              # GitHub PAT with repo, workflow, security scopes
OLLAMA_API_KEY=xxx            # Ollama Cloud API key

# Optional
OLLAMA_HOST=https://ollama.com  # Ollama API endpoint (default: cloud)
OLLAMA_MODEL=glm-4.6:cloud      # Model to use (default: glm-4.6:cloud)
```

## Architecture

```
internal/triage/
├── src/
│   ├── cli.ts              # CLI entry point (commander.js)
│   ├── ai.ts               # Vercel AI SDK + Ollama integration
│   ├── octokit.ts          # GitHub API (REST + GraphQL)
│   ├── github.ts           # gh CLI helpers
│   ├── mcp.ts              # MCP filesystem integration
│   ├── playwright.ts       # Playwright MCP for E2E
│   │
│   ├── commands/           # CLI command implementations
│   │   ├── assess.ts       # Issue assessment
│   │   ├── develop.ts      # AI development
│   │   ├── review.ts       # Code review
│   │   ├── release.ts      # Release management
│   │   ├── security.ts     # Security analysis
│   │   ├── scan.ts         # Custom scanner
│   │   └── ...
│   │
│   ├── planning/           # Sprint/roadmap logic
│   │   ├── weights.ts      # Issue prioritization
│   │   ├── balance.ts      # Sprint balancing
│   │   ├── sprint.ts       # Sprint planning
│   │   ├── roadmap.ts      # Roadmap generation
│   │   └── cascade.ts      # Automation cascade
│   │
│   ├── execution/          # Structured execution
│   │   ├── plan.ts         # Execution plan types
│   │   ├── executor.ts     # Plan executor
│   │   ├── tokenizer.ts    # Token estimation
│   │   ├── recorder.ts     # VCR-style recording
│   │   ├── sandbox.ts      # Isolated filesystem
│   │   ├── fixtures.ts     # Test fixtures
│   │   └── mock-mcp.ts     # Mock MCP provider
│   │
│   └── reporters/          # Test reporters
│       ├── vitest.ts       # Custom Vitest reporter
│       └── playwright.ts   # Custom Playwright reporter
```

## Workflow Integration

The triage CLI is designed to run within the unified `triage.yml` workflow:

```yaml
# .github/workflows/triage.yml handles:
# - Build/Test/E2E
# - CodeQL + Custom Scanner
# - AI Issue Triage
# - AI PR Review
# - Sprint Planning
# - Releases
# - Docs Deployment
```

### Triggering Commands

**Via workflow_dispatch:**
```bash
gh workflow run triage.yml -f command=assess -f number=123
```

**Via issue/PR events:**
- New issue → `auto-label` → `assess`
- PR opened → `review`
- PR review submitted → `feedback`
- Tests fail → `diagnose`

**Via schedule:**
- Daily: stale issue check
- Weekly: sprint planning
- Monthly: roadmap review

## Security

### SARIF Output

Commands can output SARIF for GitHub Code Scanning:

```bash
triage security --sarif security.sarif
triage scan --sarif scan.sarif
```

These are automatically uploaded in the workflow.

### Shell Injection Prevention

All shell commands use `execFileSync`/`spawnSync` with array arguments to prevent injection:

```typescript
// ✅ Safe
execFileSync('git', ['commit', '-m', message]);

// ❌ Avoided
execSync(`git commit -m "${message}"`);
```

## Custom Scanner

The `scan` command checks for Strata-specific security patterns:

- `strata/exec-sync-shell` - Unsafe execSync usage
- `strata/eval-usage` - eval() usage
- `strata/dangerously-set-html` - XSS risks
- `strata/shader-injection` - Shader interpolation
- `strata/hardcoded-secret` - Hardcoded credentials
- `strata/insecure-random` - Math.random in security contexts

## AI Integration

Uses Vercel AI SDK with Ollama Cloud:

```typescript
import { generate, generateWithTools } from './ai.js';

// Simple generation
const analysis = await generate(prompt, { systemPrompt });

// With MCP tools
const result = await generateWithTools(prompt, {
  systemPrompt,
  tools: await getFilesystemTools(client),
});
```

## Release Flow

The `release` command handles the complete cycle:

1. **Analyze commits** - Parse conventional commits since last tag
2. **Determine version** - major/minor/patch from commit types
3. **Generate changelog** - AI-powered, user-friendly
4. **Update files** - package.json, CHANGELOG.md
5. **Commit & tag** - `chore(release): vX.Y.Z`
6. **Push** - commits + tags
7. **GitHub Release** - with full notes
8. **npm Publish** - with correct dist-tag

```bash
# Preview
triage release --dry-run

# Full release
triage release

# Prerelease
triage release --prerelease beta
```

## Development

```bash
# Build
cd internal/triage && pnpm run build

# Watch mode (from workspace root)
pnpm run build --watch

# Test the CLI
node internal/triage/dist/cli.js --help
```

## License

MIT - Part of the Strata project.
