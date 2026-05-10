# Compound Engineering Plugin — Multi-Agent Reference

**Source:** https://github.com/EveryInc/compound-engineering-plugin  
**Author:** EveryInc (MIT License)  
**Install:** `/plugin marketplace add EveryInc/compound-engineering-plugin` then `/plugin install compound-engineering`  
**Scale:** 37 skills + 51 agents

---

## Philosophy

> "Each unit of engineering work should make subsequent units easier — not harder."

Traditional dev: features accumulate complexity. Compound engineering inverts this.  
**80% planning and review, 20% execution.**

Every cycle compounds:
- Brainstorms sharpen plans
- Plans inform future plans  
- Reviews catch more issues
- Patterns get documented so the next agent doesn't relearn the same lesson

---

## The Full Skill Set

| Skill | Purpose |
|-------|---------|
| `/ce-strategy` | Creates/maintains `STRATEGY.md` — target problem, approach, persona, metrics, tracks. Read as grounding by ideate, brainstorm, and plan. |
| `/ce-ideate` | Optional big-picture ideation before brainstorm — generate and critically evaluate ideas, rank them, route strongest into brainstorming |
| `/ce-brainstorm` | Interactive Q&A to think through a feature or problem → writes a right-sized requirements doc |
| `/ce-plan` | Turns feature ideas / requirements docs into detailed implementation plans |
| `/ce-work` | Executes plans with worktrees and task tracking |
| `/ce-debug` | Systematically reproduce failures, trace root cause, implement fixes |
| `/ce-code-review` | Multi-agent code review before merging |
| `/ce-doc-review` | Documentation review |
| `/ce-compound` | Document learnings to make future work easier (the "compound" step) |
| `/ce-product-pulse` | Time-windowed pulse report on usage, performance, errors → saves to `docs/pulse-reports/` |

---

## The Core Loop

```
/ce-brainstorm "feature or problem"
/ce-plan docs/brainstorms/<output-requirements-doc>.md
/ce-work
/ce-code-review
/ce-compound
```

For bugs:
```
/ce-debug "the checkout webhook sometimes creates duplicate invoices"
/ce-code-review
/ce-compound
```

---

## Key Concepts

### /ce-strategy (Upstream Anchor)
- Captures `STRATEGY.md` at project root
- Contains: target problem, approach, persona, key metrics, tracks
- All other skills read it as grounding when present
- Prevents strategy drift across agent sessions

### /ce-compound (The Differentiator)
- After every meaningful change: document what was learned
- Patterns, gotchas, decisions, non-obvious constraints
- Stored so future agents (and humans) don't re-derive the same context
- This is what makes each unit of work easier than the last

### /ce-product-pulse (Feedback Loop)
- Time-windowed report: 24h, 7d, etc.
- Covers: usage, performance, errors, followups
- Saved to `docs/pulse-reports/` → browseable timeline of user outcomes
- Next strategy + brainstorm anchors to real signal, not assumptions

### /ce-ideate (Optional, Pre-Brainstorm)
- Generates AND critically evaluates bigger ideas
- Produces ranked ideation artifact (not requirements or code)
- Use when you want the agent to challenge your premise before committing to a direction

---

## Why Useful for MOZART Multi-Agent Scenarios

- `/ce-work` uses worktrees + task tracking — same pattern as Pane's /implement
- `/ce-code-review` is multi-agent (parallel review agents) — same pattern as Pane's 11-agent review
- `/ce-compound` is the critical missing piece most agent workflows skip — encoding learning
- `/ce-strategy` provides the stable grounding that prevents each new agent session from starting from scratch
- `/ce-product-pulse` closes the feedback loop from production back to planning

---

## Install Notes

```bash
# Claude Code
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering

# Local dev (alias for active development)
alias cce='claude --plugin-dir ~/Code/compound-engineering-plugin/plugins/compound-engineering'
```

Does not accept outside contributions — author reviews via Claude/Codex and decides independently.
