#!/bin/bash
# Check for upstream updates and optionally fetch/merge them
# Usage: ./check-upstream.sh [--fetch] [--merge]

set -euo pipefail

NANOCLAW_ROOT="$HOME/Documents/nanoclaw"
cd "$NANOCLAW_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

FETCH_MODE=false
MERGE_MODE=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --fetch)
      FETCH_MODE=true
      shift
      ;;
    --merge)
      MERGE_MODE=true
      FETCH_MODE=true  # Merge implies fetch
      shift
      ;;
    --help)
      echo "Usage: $0 [--fetch] [--merge]"
      echo ""
      echo "Options:"
      echo "  (none)    Check for updates without fetching"
      echo "  --fetch   Fetch updates from upstream"
      echo "  --merge   Fetch and merge updates (interactive)"
      echo "  --help    Show this help message"
      exit 0
      ;;
  esac
done

echo -e "${BLUE}🔍 NanoClaw Upstream Update Checker${NC}"
echo "======================================"
echo ""

# 1. Check git remotes
echo -e "${BLUE}📡 Remote Repositories:${NC}"
git remote -v | grep -E "origin|upstream" | while read -r line; do
  echo "   $line"
done
echo ""

# 2. Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${BLUE}📌 Current Branch:${NC} $CURRENT_BRANCH"
echo ""

# 3. Check for uncommitted changes
echo -e "${BLUE}🔍 Working Directory Status:${NC}"
if git diff-index --quiet HEAD --; then
  echo -e "   ${GREEN}✅ Clean - no uncommitted changes${NC}"
else
  echo -e "   ${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
  echo ""
  git status --short | while read -r line; do
    echo "      $line"
  done
  echo ""
  if [ "$MERGE_MODE" = true ]; then
    echo -e "${RED}❌ Cannot merge with uncommitted changes!${NC}"
    echo "   Please commit or stash your changes first."
    exit 1
  fi
fi
echo ""

# 4. Fetch upstream if requested
if [ "$FETCH_MODE" = true ]; then
  echo -e "${BLUE}📥 Fetching from upstream...${NC}"
  git fetch upstream
  echo -e "${GREEN}✅ Fetch complete${NC}"
  echo ""
fi

# 5. Get current HEAD and upstream HEAD
LOCAL_COMMIT=$(git rev-parse HEAD)
UPSTREAM_COMMIT=$(git rev-parse upstream/$CURRENT_BRANCH 2>/dev/null || git rev-parse upstream/main 2>/dev/null || echo "")

if [ -z "$UPSTREAM_COMMIT" ]; then
  echo -e "${YELLOW}⚠️  Could not find upstream branch${NC}"
  echo "   Trying 'upstream/main' and 'upstream/$CURRENT_BRANCH'"
  exit 1
fi

echo -e "${BLUE}📊 Commit Comparison:${NC}"
echo "   Local:    $LOCAL_COMMIT"
echo "   Upstream: $UPSTREAM_COMMIT"
echo ""

# 6. Check if we're behind, ahead, or up-to-date
BEHIND=$(git rev-list --count HEAD..upstream/$CURRENT_BRANCH 2>/dev/null || git rev-list --count HEAD..upstream/main)
AHEAD=$(git rev-list --count upstream/$CURRENT_BRANCH..HEAD 2>/dev/null || git rev-list --count upstream/main..HEAD)

echo -e "${BLUE}📈 Status:${NC}"
if [ "$BEHIND" -eq 0 ] && [ "$AHEAD" -eq 0 ]; then
  echo -e "   ${GREEN}✅ Up to date with upstream${NC}"
  exit 0
elif [ "$BEHIND" -eq 0 ]; then
  echo -e "   ${GREEN}✅ Up to date (you are $AHEAD commits ahead)${NC}"
  exit 0
else
  echo -e "   ${YELLOW}⚠️  Behind upstream by $BEHIND commit(s)${NC}"
  if [ "$AHEAD" -gt 0 ]; then
    echo -e "   ${CYAN}ℹ️  You are also $AHEAD commit(s) ahead${NC}"
  fi
fi
echo ""

# 7. Show new commits from upstream
echo -e "${BLUE}📝 New Commits from Upstream:${NC}"
echo ""
git log --oneline --graph --decorate HEAD..upstream/$CURRENT_BRANCH 2>/dev/null || git log --oneline --graph --decorate HEAD..upstream/main | while read -r line; do
  echo "   $line"
done
echo ""

# 8. Show detailed changes
echo -e "${BLUE}📄 Detailed Changes:${NC}"
echo ""

# Get list of new commits with full details
UPSTREAM_BRANCH=$(git rev-parse --abbrev-ref upstream/HEAD 2>/dev/null | cut -d'/' -f2 || echo "main")
if ! git rev-parse upstream/$CURRENT_BRANCH >/dev/null 2>&1; then
  UPSTREAM_BRANCH="main"
else
  UPSTREAM_BRANCH="$CURRENT_BRANCH"
fi

git log HEAD..upstream/$UPSTREAM_BRANCH --pretty=format:"%h|%an|%ar|%s" | while IFS='|' read -r hash author date subject; do
  echo -e "${CYAN}Commit: $hash${NC}"
  echo "   Author: $author"
  echo "   Date:   $date"
  echo "   Subject: $subject"
  echo ""

  # Show files changed in this commit
  echo "   Files changed:"
  git show --name-status --pretty="" $hash | while read -r status file; do
    case $status in
      M)
        echo -e "      ${YELLOW}M${NC} $file"
        ;;
      A)
        echo -e "      ${GREEN}A${NC} $file"
        ;;
      D)
        echo -e "      ${RED}D${NC} $file"
        ;;
      *)
        echo "      $status $file"
        ;;
    esac
  done
  echo ""
done

# 9. Show summary of changed files
echo -e "${BLUE}📋 Summary of Changes:${NC}"
echo ""

ADDED=$(git diff --name-status HEAD..upstream/$UPSTREAM_BRANCH | grep "^A" | wc -l | tr -d ' ')
MODIFIED=$(git diff --name-status HEAD..upstream/$UPSTREAM_BRANCH | grep "^M" | wc -l | tr -d ' ')
DELETED=$(git diff --name-status HEAD..upstream/$UPSTREAM_BRANCH | grep "^D" | wc -l | tr -d ' ')

echo "   ${GREEN}Added:${NC}    $ADDED file(s)"
echo "   ${YELLOW}Modified:${NC} $MODIFIED file(s)"
echo "   ${RED}Deleted:${NC}  $DELETED file(s)"
echo ""

# Show the actual files
if [ "$ADDED" -gt 0 ]; then
  echo -e "${GREEN}New files:${NC}"
  git diff --name-status HEAD..upstream/$UPSTREAM_BRANCH | grep "^A" | cut -f2 | while read -r file; do
    echo "   + $file"
  done
  echo ""
fi

if [ "$MODIFIED" -gt 0 ]; then
  echo -e "${YELLOW}Modified files:${NC}"
  git diff --name-status HEAD..upstream/$UPSTREAM_BRANCH | grep "^M" | cut -f2 | while read -r file; do
    echo "   ~ $file"
  done
  echo ""
fi

if [ "$DELETED" -gt 0 ]; then
  echo -e "${RED}Deleted files:${NC}"
  git diff --name-status HEAD..upstream/$UPSTREAM_BRANCH | grep "^D" | cut -f2 | while read -r file; do
    echo "   - $file"
  done
  echo ""
fi

# 10. Merge mode
if [ "$MERGE_MODE" = true ]; then
  echo "======================================"
  echo -e "${BLUE}🔀 Merge Mode${NC}"
  echo ""
  echo -e "${YELLOW}⚠️  This will merge upstream changes into your current branch${NC}"
  echo ""
  read -p "Do you want to proceed? (y/N) " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${BLUE}Merging upstream/$UPSTREAM_BRANCH into $CURRENT_BRANCH...${NC}"

    if git merge upstream/$UPSTREAM_BRANCH --no-edit; then
      echo -e "${GREEN}✅ Merge successful!${NC}"
      echo ""
      echo "New HEAD: $(git rev-parse HEAD)"
      echo ""
      echo -e "${CYAN}ℹ️  Don't forget to:${NC}"
      echo "   1. Test the changes"
      echo "   2. Push to your fork: git push origin $CURRENT_BRANCH"
    else
      echo -e "${RED}❌ Merge failed - conflicts detected${NC}"
      echo ""
      echo "To resolve conflicts:"
      echo "   1. Fix conflicts in the listed files"
      echo "   2. git add <resolved-files>"
      echo "   3. git commit"
      echo ""
      echo "To abort the merge:"
      echo "   git merge --abort"
    fi
  else
    echo ""
    echo "Merge cancelled."
  fi
else
  # Show merge instructions
  echo "======================================"
  echo -e "${BLUE}💡 Next Steps:${NC}"
  echo ""
  echo "To fetch updates:"
  echo "   $0 --fetch"
  echo ""
  echo "To fetch and merge:"
  echo "   $0 --merge"
  echo ""
  echo "Or manually:"
  echo "   git fetch upstream"
  echo "   git merge upstream/$UPSTREAM_BRANCH"
  echo ""
fi
