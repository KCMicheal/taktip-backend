#!/bin/bash
# TakTip Backend - PR Review Checker
# This script polls for PR reviews and helps address feedback

set -e

REPO="${1:-KCMicheal/taktip-backend}"
PR_NUMBER="${2:-1}"

echo "🔍 Checking PR Reviews for $REPO PR #$PR_NUMBER"
echo "=============================================="
echo ""

# Get PR details
PR_STATE=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json state --jq '.state')
echo "PR State: $PR_STATE"

if [ "$PR_STATE" != "OPEN" ]; then
    echo "PR is not open. Exiting."
    exit 0
fi

# Get all reviews
echo ""
echo "📋 Reviews:"
echo "----------"
gh pr view "$PR_NUMBER" --repo "$REPO" --json reviews --jq '.reviews[] | "- [\(.state)] \(.author.login) (\(.submittedAt | split("T")[0]))"'

# Get review comments
echo ""
echo "💬 Review Comments:"
echo "------------------"
REVIEWS=$(gh api repos/"$REPO"/pulls/"$PR_NUMBER"/reviews --jq '.[] | select(.state == "CHANGES_REQUESTED" or .state == "COMMENTED") | .id')

if [ -z "$REVIEWS" ]; then
    echo "No pending review comments found."
else
    echo "Found reviews with comments. Full review bodies:"
    gh api repos/"$REPO"/pulls/"$PR_NUMBER"/reviews --jq '.[] | if .body and (.body | length) > 10 then "### \(.author.login) (\(.state))\n\(.body)\n" else empty end'
fi

# Get check statuses (CI status)
echo ""
echo "✅ CI Checks Status:"
echo "-------------------"
gh pr checks "$PR_NUMBER" --repo "$REPO" 2>/dev/null || echo "No checks running or check command not available"

# Get the latest commit SHA
COMMIT_SHA=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json headRefOid --jq '.headRefOid')
echo ""
echo "📌 Latest Commit: $COMMIT_SHA"

# Check if PR is mergeable
MERGEABLE=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json mergeable --jq '.mergeable')
echo ""
echo "Mergeable: $MERGEABLE"

# Summary
echo ""
echo "=============================================="
echo "Summary:"
echo "--------"
APPROVED=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json reviews --jq '[.reviews[] | select(.state == "APPROVED")] | length')
CHANGES_REQUESTED=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json reviews --jq '[.reviews[] | select(.state == "CHANGES_REQUESTED")] | length')

echo "- Approved by: $APPROVED reviewer(s)"
echo "- Changes requested by: $CHANGES_REQUESTED reviewer(s)"

if [ "$CHANGES_REQUESTED" -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Changes have been requested. Please address feedback before merging.${NC}"
    echo ""
    echo "To address reviews:"
    echo "1. Read the review comments above"
    echo "2. Make the necessary code changes"
    echo "3. Commit and push: git add . && git commit -m 'fix: address review feedback' && git push"
    echo "4. Re-run this script to check if issues are resolved"
    exit 1
elif [ "$APPROVED" -gt 0 ]; then
    echo ""
    echo -e "${GREEN}✅ PR is approved! Ready to merge.${NC}"
    echo ""
    echo "To merge:"
    echo "  gh pr merge $PR_NUMBER --repo $REPO --squash"
    exit 0
else
    echo ""
    echo -e "${YELLOW}⏳ Awaiting reviews...${NC}"
    exit 0
fi
