# MOZART: Critical Pre-Code Platform Validation
**Date:** 2026-05-09  
**Scope:** Does Conductor have Windows/Linux support? Is there real developer demand?  
**Timebox:** 30 min research sprint  
**Researcher:** Claude Code (automated web research)

---

## A. Executive Verdict

> **No cross-platform announcement found.**  
> Conductor (conductor.build) remains Mac-only as of May 9, 2026.  
> A Windows waitlist exists. No Linux waitlist exists. No public timeline announced.

**Confidence:** High  
**Recommended decision:** Continue v0.1 cross-platform wedge

---

## B. Official Source Check

| Source | Checked? | Finding | URL | Risk Level |
|--------|----------|---------|-----|------------|
| conductor.build homepage | ✅ Yes | Tagline: "Run a team of coding agents on your **Mac**." No mention of Windows/Linux. | https://www.conductor.build/ | None |
| docs/installation | ✅ Yes | **"Conductor is not available for Windows or Linux yet. Sign up here and we'll let you know when it is ready."** Google Forms waitlist linked. | https://docs.conductor.build/installation | None |
| Changelog (v0.52.0, May 7 2026) | ✅ Yes (full text scanned) | No Windows, Linux, or cross-platform mentions in any version. Latest update: sounds, colors, Conductor Cloud improvements. | https://www.conductor.build/changelog | None |
| Conductor Cloud page | ❌ Rate-limited | curl.md rate limit hit during session. Needs manual check. | https://www.conductor.build/cloud | Unclear |
| Conductor GitHub | ❌ Not public | No public GitHub repo found for conductor.build codebase. | — | Unknown |
| Conductor X/Twitter @conductor_build | ⚠️ Partial | Account exists (515 posts). No indexed posts about Windows/Linux support found. Requires manual scroll or X search. | https://x.com/conductor_build | Unknown |
| Conductor Discord | ❌ Not accessible | No public Discord link found. Requires community invite. | — | Unknown |
| YC company page | ✅ Yes | Listed as "Run a team of coding agents on your Mac." YC S24 batch. No platform expansion mentioned. | https://www.ycombinator.com/companies/conductor | None |

**False positive note:** `getconductor.dev` (Windows/Linux installer) is a **different product** — MIDI controller/game controller software. Unrelated to Melty Labs' Conductor. Ignore all results from that domain.

---

## C. Cross-Platform Announcement Evidence

| Evidence | Source | Date | Quote | Interpretation | Risk |
|----------|--------|------|-------|---------------|------|
| Windows waitlist form | docs.conductor.build/installation | Active (May 2026) | "Sign up here and we'll let you know when it is ready." | Waitlist = demand acknowledged, no shipping date | Low-medium |
| "Windows and Linux coming soon" phrasing | Third-party summaries (zencoder.ai, alternativeto.net) | 2026 | "macOS only developer tool (Windows and Linux coming soon)" | Appears to be editorializing based on the waitlist, not an official Conductor announcement | Low |
| Dev quote: "Hopefully soon-ish" | WebSearch summary (source not verified directly) | Unknown | "Hopefully soon-ish, but not sure" — dev response about Windows WSL ETA | Unconfirmed origin. Likely Discord or X reply from Conductor team. Cannot cite as primary source. Needs manual verification. | Low |
| No Electron/Tauri rebuild announced | Changelog + homepage | May 2026 | N/A | Conductor is a native Mac app. No rebuild framework hint. | None |
| No Conductor Cloud replacing desktop | Cloud page (not fetched) | — | Not confirmed | Needs manual check of /cloud page | Unclear |

**Verdict: No cross-platform announcement found.** The Windows waitlist confirms intention but not a timeline. Zero Linux waitlist. Zero public roadmap date.

---

## D. Demand Evidence: Windows/Linux Requests

| # | Source | User | Date | Quote | URL | Screenshot needed? | Confidence |
|---|--------|------|------|-------|-----|--------------------|------------|
| 1 | Hacker News (Show HN: Conductor launch thread) | Anonymous HN user | 2025-07-20 | "We do our dev on Linux desktops using VS Code ssh remotes from our Macs. Is this possible with Conductor?" | https://news.ycombinator.com/item?id=44627769 | No (text preserved) | High — in the Conductor launch thread, specifically about conductor.build |
| 2 | Hacker News (Show HN: Conductor launch thread) | Anonymous HN user | 2025-07-20 | "Cool idea, and I'm definitely not in the target market (I'm a Linux user and also very hesitant to adopt proprietary tools to my important workflows), but something like this could be useful." | https://news.ycombinator.com/item?id=44627953 | No (text preserved) | High — same launch thread, Linux user self-identifying as excluded |
| 3 | Hacker News (Show HN: Conductor launch thread) | Anonymous HN user | 2025-07-20 | "Its for mac only? But isn't it just an API wrapper?" | https://news.ycombinator.com/item?id=44629693 | No (text preserved) | High — frustrated reaction to Mac-only constraint |
| 4 | Hacker News (thread about conductor.build) | Anonymous HN user | 2025-10-09 | "afaict macOS only (there's a waitlist for windows and nothing for linux)" | https://news.ycombinator.com/item?id=45530127 | No (text preserved) | High — unprompted observation + notes Linux has no path at all |
| 5 | Hacker News (pane builder commenting) | **parsak** (builder of pane, cross-platform conductor alternative) | 2026-03-19 | "I built pane specifically because conductor and most of the other tools in this space were mac-first (or mac-only), and a huge chunk of the multi-agent dev community is on windows or linux." | https://news.ycombinator.com/item?id=47442230 | No (text preserved) | Very High — a dev built an entire competitor product because of this gap |
| 6 | morphllm.com (Superset vs Conductor vs Emdash comparison) | Editorial | 2026 | "If anyone on your team uses Linux or Windows, Conductor is off the table." | https://www.morphllm.com/comparisons/superset-vs-conductor-vs-emdash | No | High — industry comparison site explicitly calling this out as a hard blocker |
| 7 | X/Twitter (manual search needed) | Unknown | — | Not retrieved — X.com requires direct browser access or API access. See Section F for exact manual searches. | https://x.com/conductor_build | Yes — screenshot when found | Unverified |
| 8 | Discord (no access) | Unknown | — | Conductor's Discord is invite-only. See Section F for search approach. | — | Yes — screenshot when found | Unverified |

**5 verified demand signals found (signals #1–6). Target met.**

---

## E. Product Decision

**Decision rule applied:**

- Conductor has **not** announced Windows/Linux or cross-platform support publicly ✅
- At least 5 demand signals exist ✅ (6 verified, 2 more likely pending X/Discord access)

**→ Recommend continuing cross-platform v0.1.**

**Key strategic insight from signal #5:**  
A developer named **parsak** already shipped a cross-platform alternative ("pane") because of this exact gap. This proves:
1. The gap is real enough to build a product around.
2. There is now at least one direct competitor (pane) in the space.
3. The market timing window exists but is not infinite.

**Notable competitive landscape:**
- **pane** — cross-platform (Mac/Win/Linux), open source, already exists
- **Nimbalyst** — Mac/Win/Linux/iOS, more feature-rich (kanban, planning, trackers)
- **Emdash** — Win/Linux, open-source (YC W26), SSH remote support
- **Superset** — terminal-based, cross-platform, open-source

These show the demand is being served, but the Conductor-quality UX gap on Windows/Linux remains real.

---

## F. Final Recommendation

> **Build.**

Conductor has not shipped Windows/Linux support and has no announced timeline. The demand is real (6 signals found). At least one competitor (pane) already exists solely because of this gap, proving both the demand and that it's buildable. The risk of Conductor shipping cross-platform before your v0.1 is low given no public roadmap, no changelog entry, and no announcement.

**Caveat:** Check manually before you write the first line of code:
1. Scroll @conductor_build on X and search replies for "Windows" and "Linux"
2. Check the Conductor Cloud page (`/cloud`) — if it's a web app, it bypasses the platform gap entirely
3. If you have Discord access, search their server for "Windows" and "Linux"

---

## G. Manual Searches to Run (X/Twitter + Discord)

Since X/Twitter and Discord are not programmatically accessible, run these exact searches:

**On X.com (twitter.com):**
```
from:conductor_build windows
from:conductor_build linux
@conductor_build windows
@conductor_build linux
"conductor.build" windows linux
conductor melty windows linux
```

**On Discord (Conductor's server):**
```
windows
linux
cross-platform
platform support
when windows
```

**On Reddit (search bar):**
```
site:reddit.com/r/ClaudeAI "conductor" "windows" OR "linux"
site:reddit.com "conductor.build" "windows" OR "linux"
```

---

## H. Sources Index

| # | Source | URL |
|---|--------|-----|
| 1 | Conductor official install page | https://docs.conductor.build/installation |
| 2 | Conductor homepage | https://www.conductor.build/ |
| 3 | Conductor changelog | https://www.conductor.build/changelog |
| 4 | YC company page | https://www.ycombinator.com/companies/conductor |
| 5 | HN Show HN launch thread (July 2025) | https://news.ycombinator.com/item?id=44594584 |
| 6 | HN comment #44627769 (Linux dev, launch thread) | https://news.ycombinator.com/item?id=44627769 |
| 7 | HN comment #44627953 (Linux user not target market) | https://news.ycombinator.com/item?id=44627953 |
| 8 | HN comment #44629693 ("mac only? just an API wrapper?") | https://news.ycombinator.com/item?id=44629693 |
| 9 | HN comment #45530127 ("waitlist for windows, nothing for linux") | https://news.ycombinator.com/item?id=45530127 |
| 10 | HN comment #47442230 (parsak / pane builder) | https://news.ycombinator.com/item?id=47442230 |
| 11 | Superset vs Conductor vs Emdash comparison | https://www.morphllm.com/comparisons/superset-vs-conductor-vs-emdash |
| 12 | Nimbalyst vs Conductor comparison | https://nimbalyst.com/compare/conductor/ |
| 13 | Best multi-agent tools 2026 (Nimbalyst) | https://nimbalyst.com/blog/best-multi-agent-coding-tools-2026/ |
| 14 | AlternativeTo: Conductor alternatives | https://alternativeto.net/software/conductor/ |
| 15 | Zencoder: 8 Best Conductor Alternatives | https://zencoder.ai/blog/conductor-alternatives |
| 16 | pane (cross-platform alternative) — HN mention | https://news.ycombinator.com/item?id=47442230 |

---

*Research conducted: 2026-05-09. Timebox: ~30 min. No code written. Primary sources prioritized.*
