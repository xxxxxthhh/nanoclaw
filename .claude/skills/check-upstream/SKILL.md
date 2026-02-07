---
name: check-upstream
description: Check for upstream updates from the original NanoClaw repository. Shows detailed changes, new commits, and file modifications. Use when you want to see if there are updates from the upstream project. Can optionally fetch or merge updates.
---

# Check Upstream Updates Skill

Checks for updates from the original NanoClaw repository (upstream) and provides detailed information about changes.

## When to Use This Skill

Invoke this skill when:
- 🔍 You want to check if there are new updates from upstream
- 📊 You want to see what changes have been made
- 🔄 You're considering updating your fork
- 📝 You want to review upstream commits before merging

## What This Skill Does

This skill will:

1. **Check repository status**:
   - Verify git remotes (origin and upstream)
   - Check current branch
   - Verify working directory is clean

2. **Compare with upstream**:
   - Show how many commits ahead/behind you are
   - List new commits from upstream
   - Display detailed file changes

3. **Provide options**:
   - Just check (default)
   - Fetch updates from upstream
   - Merge updates (interactive)

## Workflow

### Step 1: Run the Check Script

Execute the upstream check script:

```bash
~/Documents/nanoclaw/scripts/check-upstream.sh
```

This will display:
- Current repository status
- Remote repository URLs
- Current branch
- Working directory cleanliness
- Comparison with upstream
- Detailed commit information
- File change summary

### Step 2: Analyze the Output

**If up to date:**
```
✅ Up to date with upstream
```
→ Nothing to do, you're current!

**If ahead:**
```
✅ Up to date (you are 18 commits ahead)
```
→ You have local improvements, upstream is current

**If behind:**
```
⚠️ Behind upstream by 3 commit(s)
```
→ There are new upstream updates available

**If diverged:**
```
⚠️ Behind upstream by 3 commit(s)
ℹ️  You are also 5 commit(s) ahead
```
→ Both you and upstream have new commits

### Step 3: Review Changes

The script automatically shows:

**New Commits:**
```
📝 New Commits from Upstream:

   * 80e68dc Add new feature
   * 7a2f3c1 Fix critical bug
   * 5d4e2b8 Update dependencies
```

**Detailed Changes:**
```
📄 Detailed Changes:

Commit: 80e68dc
   Author: gavrielc
   Date:   2 days ago
   Subject: Add new feature

   Files changed:
      M src/index.ts          (Modified)
      A src/new-feature.ts    (Added)
      D src/old-file.ts       (Deleted)
```

**Summary:**
```
📋 Summary of Changes:
   Added:    2 file(s)
   Modified: 5 file(s)
   Deleted:  1 file(s)

New files:
   + src/new-feature.ts
   + docs/NEW-GUIDE.md

Modified files:
   ~ src/index.ts
   ~ src/config.ts
   ~ package.json
```

### Step 4: Decide on Action

Based on the output, you have three options:

**Option 1: Just Check (Default)**
```bash
~/Documents/nanoclaw/scripts/check-upstream.sh
```
- View information only
- No changes made
- Safe to run anytime

**Option 2: Fetch Updates**
```bash
~/Documents/nanoclaw/scripts/check-upstream.sh --fetch
```
- Download upstream commits
- Updates local upstream/main reference
- Does NOT modify your working branch
- Safe operation

**Option 3: Merge Updates**
```bash
~/Documents/nanoclaw/scripts/check-upstream.sh --merge
```
- Fetch updates
- Show detailed changes
- Ask for confirmation
- Merge upstream into current branch
- **Requires clean working directory**

## Usage Examples

### Example 1: Quick Check

**User asks**: "Check for upstream updates"

**I will do**:
```bash
~/Documents/nanoclaw/scripts/check-upstream.sh
```

**Possible responses**:

**Scenario A - Up to date:**
```
✅ Your NanoClaw is up to date with upstream!

Current status: 18 commits ahead
This means you have your own improvements and are current with upstream.
```

**Scenario B - Updates available:**
```
📬 Found 3 new commits from upstream:

1. 80e68dc - Add new feature (2 days ago)
   - Added src/new-feature.ts
   - Modified src/index.ts

2. 7a2f3c1 - Fix critical bug (1 day ago)
   - Fixed bug in container-runner
   - Modified src/container-runner.ts

3. 5d4e2b8 - Update dependencies (today)
   - Updated package.json

Summary: 2 new files, 5 modified files

Would you like to:
1. Fetch these updates (safe, no changes to your code)
2. Merge these updates (will integrate changes)
3. See detailed diff
```

### Example 2: Fetch Updates

**User asks**: "Fetch the upstream updates"

**I will do**:
```bash
~/Documents/nanoclaw/scripts/check-upstream.sh --fetch
```

**Response**:
```
✅ Fetched updates from upstream!

Downloaded 3 new commits:
- Latest upstream commit: 80e68dc
- Your local commit: 67209a0

The updates are now available locally but not yet merged.
You can review the changes and merge when ready.
```

### Example 3: Merge Updates

**User asks**: "Merge the upstream updates"

**I will do**:
```bash
# First check working directory
git status

# If clean, proceed with merge
~/Documents/nanoclaw/scripts/check-upstream.sh --merge
```

**Interactive flow**:
```
Checking for updates...
Found 3 new commits

Files that will be changed:
   + 2 new files
   ~ 5 modified files

⚠️  This will merge upstream changes into your current branch

Do you want to proceed? (y/N)
```

**After user confirms**:
```
✅ Merge successful!

Merged 3 commits from upstream
New HEAD: 9a8b7c6

Next steps:
1. Test the changes: npm run build && npm run dev
2. Push to your fork: git push origin main
```

## Pre-Merge Checks

Before merging, I will always check:

1. **Working directory status**:
   ```bash
   git status
   ```
   - If dirty: warn and suggest committing changes first
   - If clean: proceed with merge

2. **Potential conflicts**:
   - Review changed files
   - Check if any match your local modifications
   - Warn about potential conflicts

3. **Impact assessment**:
   - Identify critical file changes
   - Highlight dependency updates
   - Note breaking changes

## Conflict Resolution

If merge conflicts occur, I will:

1. **Show conflict details**:
   ```
   ❌ Merge conflicts detected in:
      - src/index.ts
      - src/config.ts
   ```

2. **Provide resolution steps**:
   ```
   To resolve:
   1. Open conflicted files
   2. Look for <<<<<<< HEAD markers
   3. Choose which code to keep
   4. Remove conflict markers
   5. git add <resolved-files>
   6. git commit
   ```

3. **Offer to help**:
   - Show the conflicted sections
   - Explain what each side represents
   - Suggest which version to keep

4. **Provide abort option**:
   ```
   To abort the merge:
   git merge --abort
   ```

## Safety Features

This skill includes multiple safety checks:

✅ **Pre-flight checks**:
- Verify git remotes exist
- Check current branch
- Ensure working directory is clean

✅ **Interactive confirmation**:
- Always ask before merging
- Show exactly what will change
- Provide clear yes/no choice

✅ **Detailed logging**:
- All operations logged
- Easy to review what happened
- Helpful for troubleshooting

✅ **Rollback capability**:
- Can abort merge anytime
- Can reset to previous state
- No permanent damage

## Understanding the Output

### Repository URLs

```
origin    https://github.com/xxxxxthhh/nanoclaw.git  (your fork)
upstream  https://github.com/gavrielc/nanoclaw.git   (original)
```

### Commit Status

```
Local:    67209a0  (your current commit)
Upstream: 80e68dc  (latest upstream commit)
```

### Ahead/Behind

- **Ahead**: You have commits that upstream doesn't
  - Your improvements and customizations
  - Normal and expected

- **Behind**: Upstream has commits you don't have
  - New features or bug fixes from original project
  - Consider merging

- **Diverged**: Both have unique commits
  - Most common scenario
  - May need conflict resolution

### File Change Indicators

- **M** (Modified): File was changed
- **A** (Added): New file created
- **D** (Deleted): File was removed
- **R** (Renamed): File was moved/renamed

## Common Scenarios

### Scenario 1: Regular Check

```
User: "Check upstream"
→ Run check script
→ Report status
→ If updates: summarize changes
→ Ask if user wants to fetch/merge
```

### Scenario 2: Found Updates

```
User: "Are there upstream updates?"
→ Run check
→ Found 3 commits
→ Summarize each commit
→ Explain what changed
→ Recommend action
```

### Scenario 3: Merge Request

```
User: "Merge upstream changes"
→ Check working directory
→ Fetch updates
→ Show detailed diff
→ Ask confirmation
→ Merge
→ Report results
```

### Scenario 4: After Merge

```
User: "I merged, now what?"
→ Suggest: npm run build
→ Suggest: test changes
→ Suggest: git push origin main
→ Offer to help with any issues
```

## Best Practices

When using this skill:

1. **Check regularly**: Run weekly to stay current
2. **Review carefully**: Always review changes before merging
3. **Test after merge**: Build and test after merging
4. **Keep commits clean**: Commit your changes before merging
5. **Push updates**: Push to your fork after successful merge

## Integration with Other Skills

This skill works well with:
- `/debug-agent`: Check if merge broke anything
- `/debug`: Troubleshoot post-merge issues
- `/customize`: Adapt to upstream changes

## Quick Reference

```bash
# Just check
/check-upstream

# Or in conversation
"Check for upstream updates"
"Any new commits from upstream?"
"Show me what's new in upstream"

# Fetch updates
"Fetch upstream updates"
"Download upstream changes"

# Merge updates
"Merge upstream changes"
"Update from upstream"
"Integrate upstream updates"
```

## Summary

This skill helps you:
- 🔍 Stay informed about upstream changes
- 📊 See detailed information before merging
- 🔒 Safely merge updates with confirmations
- 🛡️ Protect your work with safety checks
- 📝 Keep detailed logs of all operations

Use it whenever you want to check if the original NanoClaw project has improvements you want to incorporate!
