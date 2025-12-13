/**
 * Review Command - AI-powered code review using MCP tools
 */

import pc from 'picocolors';
import { getPullRequest, getRepoInfo } from '../github.js';
import { runAgenticTask } from '../mcp.js';

const SYSTEM_PROMPT = `You are a senior code reviewer for Strata, a React Three Fiber procedural graphics library.

## Your Tools

### File Tools
- **read_file**: Read full file contents when the diff doesn't show enough context
- **list_files**: Explore project structure
- **search_files**: Find related files

### Documentation Tools (CRITICAL - prevents hallucinations!)
- **resolve-library-id**: Find the Context7 ID for a library
- **get-library-docs**: Get current documentation for a library to verify API usage

### GitHub Tools (USE THESE TO POST YOUR REVIEW!)
- **add_issue_comment**: Post a comment on the PR
  - Parameters: owner (string), repo (string), issue_number (number), body (string)
  - You MUST use the owner and repo provided in the task
  - If your review exceeds 50000 characters, split into multiple comments
  - Call add_issue_comment multiple times if needed - one call per comment

## Review Format

\`\`\`markdown
## 🔍 AI Code Review

### Summary
[1-2 sentences on what this PR does]

### ✅ Strengths
- [Specific positive aspects]

### 🔍 Issues Found

**[🔴|🟠|🟡|🟢] [Category]** in \`filename:line\`
> Description

**Problem:** What's wrong
**Suggestion:** How to fix

### 💡 Suggestions
[Optional improvements]

### Verdict
**[APPROVE | REQUEST_CHANGES | COMMENT]** - [Reason]

---
_Review by @strata/triage_
\`\`\`

## Severity Levels
- 🔴 CRITICAL: Security, data loss, crashes
- 🟠 HIGH: Bugs, incorrect behavior  
- 🟡 MEDIUM: Code quality, missing error handling
- 🟢 LOW: Style, minor improvements

## Rules
1. Use add_issue_comment to post - do NOT just return text
2. If review is long (>50000 chars), post multiple comments
3. Always include owner, repo, issue_number in add_issue_comment calls
4. Verify library APIs with Context7 before flagging as issues`;

export interface ReviewOptions {
    dryRun?: boolean;
    verbose?: boolean;
    maxSteps?: number;
}

export async function review(prNumber: number, options: ReviewOptions = {}): Promise<void> {
    const { dryRun = false, verbose = false, maxSteps = 25 } = options;

    console.log(pc.blue(`🔍 Reviewing PR #${prNumber}...`));

    // Get repo info - needed for GitHub MCP
    const { owner, repo } = getRepoInfo();
    
    // Get PR data
    const pr = getPullRequest(prNumber);

    if (verbose) {
        console.log(pc.dim(`Repo: ${owner}/${repo}`));
        console.log(pc.dim(`Title: ${pr.title}`));
        console.log(pc.dim(`Files: ${pr.files.length}`));
        console.log(pc.dim(`Diff size: ${pr.diff.length} chars`));
    }

    // Truncate diff if too large - AI can use read_file for full contents
    const maxDiffSize = 15000;
    let diffContent = pr.diff;
    let truncated = false;

    if (diffContent.length > maxDiffSize) {
        diffContent = diffContent.slice(0, maxDiffSize);
        truncated = true;
    }

    const userPrompt = `# Code Review Task

## Repository Context
- **Owner:** ${owner}
- **Repo:** ${repo}
- **PR Number:** ${prNumber}

Use these values when calling add_issue_comment:
\`\`\`json
{
  "owner": "${owner}",
  "repo": "${repo}",
  "issue_number": ${prNumber},
  "body": "your review content here"
}
\`\`\`

## Pull Request
**Title:** ${pr.title}
**Files Changed:** ${pr.files.join(', ')}

**Description:**
${pr.body || '_No description provided_'}

## Diff
\`\`\`diff
${diffContent}
\`\`\`
${truncated ? '\n⚠️ Diff truncated. Use read_file to see full file contents.\n' : ''}

## Instructions

1. Analyze the diff
2. Use read_file if you need more context
3. Use Context7 to verify any library API usage you're unsure about
4. Post your review using add_issue_comment with owner="${owner}", repo="${repo}", issue_number=${prNumber}
5. If your review is very long, call add_issue_comment multiple times with different parts

**YOU MUST CALL add_issue_comment TO POST YOUR REVIEW. DO NOT JUST RETURN TEXT.**`;

    if (dryRun) {
        console.log(pc.yellow('\n[Dry run] Would execute AI review'));
        console.log(pc.dim(`Repo: ${owner}/${repo}`));
        console.log(pc.dim(`PR: #${prNumber}`));
        return;
    }

    console.log(pc.blue('Starting AI review...'));

    try {
        const result = await runAgenticTask({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt,
            mcpClients: {
                filesystem: process.cwd(),
                context7: true,
                github: true,
            },
            maxSteps,
            onToolCall: verbose ? (toolName, args) => {
                console.log(pc.dim(`  → ${toolName}(${JSON.stringify(args).slice(0, 100)}...)`));
            } : undefined,
        });

        console.log('\n' + pc.green('═══ Review Complete ═══'));
        
        if (verbose) {
            console.log(pc.dim(`Steps: ${result.steps.length}`));
            console.log(pc.dim(`Tool calls: ${result.toolCallCount}`));
        }

        // Check if comments were posted
        const commentCalls = result.steps.flatMap((step: unknown) => {
            const s = step as { toolCalls?: Array<{ toolName: string }> };
            return s.toolCalls?.filter(tc => tc.toolName === 'add_issue_comment') || [];
        });

        if (commentCalls.length > 0) {
            console.log(pc.green(`✅ Posted ${commentCalls.length} comment(s) via GitHub MCP`));
        } else {
            console.log(pc.yellow('⚠️ AI did not post comments via GitHub MCP'));
            if (result.text) {
                console.log(pc.dim('AI response:'));
                console.log(result.text.slice(0, 500) + (result.text.length > 500 ? '...' : ''));
            }
        }

    } catch (error) {
        console.error(pc.red('\n❌ Review failed:'));
        if (error instanceof Error) {
            console.error(pc.red(error.message));
        }
        throw error;
    }
}
