# Blog: Building a Software Factory — 3 Commands, Custom Agents, and the Harness

**Source:** https://runpane.com/blog/building-a-software-factory  
**Author:** Parsa (Dcouple Inc) · ~2026-03 (follow-up to AI-Native Workflow post)

---

## The Core Workflow Has Collapsed to 3 Commands

```
/discussion → /plan → /implement
```

From 10+ commands to 3. Every time a model improves, commands merge. The consolidation reflects Claude's improving capabilities — research, review, and PR creation now happen inline.

---

## What a "Software Factory" Is

> "The automated pipeline that takes a natural language description of a problem and produces a PR."

---

## Harness Engineering

Building and maintaining the scaffolding that enables agent productivity:
- Slash commands
- Monorepo structure
- CI/CD
- Environment configuration

**The author spends more than 50% of their time on harness engineering and review.** This is not overhead — it's the investment that makes everything else work.

---

## Voice-First Development

The most significant practical shift: voice notes instead of typed structured prompts.

> "When you talk, you ramble, you go on tangents, you think of edge cases mid-sentence. The agents handle the rambling fine, and the tangents often contain exactly the context they need."

Voice descriptions → GitHub issues → agents address with PRs ready for review.

---

## Token Maximizing

Shift from cost-consciousness to time-optimization. Use AI extensively rather than attempting tasks manually. The bottleneck is your time, not token cost.

---

## Infrastructure Patterns

- Multi-agent parallel execution across isolated git worktrees
- Automatic run script generation with port isolation per worktree
- Secrets management: `.env` auto-copied across worktrees
- Session cycling: `Ctrl+Up/Down` to navigate between agent sessions
- Mandatory monorepo architecture for cross-service agent reasoning
- Adversarial review: separate Codex agents review Claude's output (cross-model validation)

---

## Agent Management Philosophy

Managing agents mirrors managing a human team:
- Unblock obstacles
- Question questionable approaches before they go too far
- Provide context agents can't find themselves
- Rotate attention between parallel work streams
- Don't let one agent block all progress

---

## What Stays Manual

- Human ship/no-ship decision on every PR
- Adversarial Codex review loop (kicked off manually)
- Scoping and decomposition of tasks (human judgment on what's "agent-sized")
- Code review with single-responsibility lens
