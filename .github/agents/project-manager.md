# Project Manager Agent

## Description
Manages GitHub issues, projects, and tracks work progress for Strata.

## Capabilities
- Create and update issues
- Manage project boards
- Track extraction progress
- Link PRs to issues
- Update EPIC progress

## Instructions

### Using GitHub CLI

Always use `GH_TOKEN="$GITHUB_TOKEN"` for authentication:

```bash
export GH_TOKEN="$GITHUB_TOKEN"
gh issue list
gh pr list
```

### Issue Management

#### Create Issue
```bash
gh issue create --title "Title" --body "Description" --label "enhancement"
```

#### Update Issue
```bash
gh issue edit 123 --add-label "in-progress"
gh issue comment 123 --body "Status update..."
```

#### Close Issue
```bash
gh issue close 123 --comment "Completed in PR #456"
```

#### Link PR to Issue
In PR body or commits:
```
Closes #123
Fixes #123
Resolves #123
```

### Project Board Management

#### View Project
```bash
gh project list
gh project view 1
```

#### Update Project Item

First, obtain the required IDs:
```bash
# List projects to get PROJECT_ID
gh project list --owner jbcom

# View project to see items and fields
gh project view <PROJECT_NUMBER>

# List project items to get ITEM_ID
gh project item-list <PROJECT_NUMBER>
```

Then update the item:
```bash
gh project item-edit --project-id PROJECT_ID --id ITEM_ID --field-id FIELD_ID --value "Done"
```

**Note**: Field IDs are visible in the project view output. Common fields include Status, Priority, and Assignee.

### EPIC Tracking

EPICs are issues with the `epic` label that track larger bodies of work.

#### Current EPICs
- **#35** - Main integration EPIC
- **#74** - Archive Triage & Extraction Map

#### Update EPIC Progress
```bash
gh issue comment 74 --body "## Progress Update

### Completed
- [x] Task 1 (PR #XX)
- [x] Task 2 (PR #YY)

### In Progress
- [ ] Task 3

### Blocked
- [ ] Task 4 (waiting on #ZZ)
"
```

### Using GitHub MCP Server

When using the GitHub MCP server:

1. **List issues**:
   ```
   github_list_issues with appropriate filters
   ```

2. **Create issue**:
   ```
   github_create_issue with title, body, labels
   ```

3. **Update issue**:
   ```
   github_update_issue to change status/labels
   ```

4. **Add comment**:
   ```
   github_add_comment for progress updates
   ```

### Extraction PR Tracking

#### Active Extraction PRs
Track PRs with `extract/` branch prefix:

```bash
gh pr list --search "head:extract/"
```

#### Review Status
```bash
gh pr view 123 --json reviews,statusCheckRollup
```

#### Merge Order Priority

1. **Infrastructure** (merge first)
   - CI fixes
   - Documentation

2. **Pure Utilities** (no dependencies)
   - Math utilities
   - Shared utilities
   - Shaders

3. **Core Systems**
   - State management
   - Debug tools
   - ECS, Pathfinding, Physics

4. **Feature Systems**
   - Audio, Animation
   - Rendering, Geometry
   - Interaction

5. **Integration** (merge last)
   - Hooks, Presets
   - Components
   - Index files

### Labels Reference

| Label | Description |
|-------|-------------|
| `bug` | Something isn't working |
| `enhancement` | New feature request |
| `documentation` | Docs improvements |
| `extraction` | Archive extraction work |
| `epic` | Large tracked initiative |
| `good first issue` | Newcomer friendly |
| `priority:high` | Urgent work |
| `priority:low` | Can wait |

### Review Request Automation

Request reviews from all agents (each needs a SEPARATE comment):

```bash
# Request reviews from all agents
gh pr comment <PR_NUMBER> --body "@claude Please review"
gh pr comment <PR_NUMBER> --body "/q review"
gh pr comment <PR_NUMBER> --body "/gemini review"
gh pr comment <PR_NUMBER> --body "@cursor review"

# Batch review multiple PRs
for pr in <PR1> <PR2> <PR3>; do
  gh pr comment $pr --body "@claude Please review"
  gh pr comment $pr --body "/q review"
  gh pr comment $pr --body "/gemini review"
  gh pr comment $pr --body "@cursor review"
done
```
