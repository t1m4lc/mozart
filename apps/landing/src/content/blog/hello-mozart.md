---
title: "Hello, Mozart"
description: "Why we are building a manager for AI coding agents."
date: 2026-05-16
authors:
  - name: Timothy Alcaide
    role: Co-founder
    avatar: /authors/timothy.svg
---

Mozart is a new desktop app for working with AI coding agents. The team has been building it quietly for a few months and today we are starting to share what we have in mind.

## The problem

Coding agents are getting good. The leaderboards keep moving. But the way we run them has not caught up — most of us still talk to a single agent in a single terminal, watching it grind through one Task at a time.

Two things go wrong with that setup:

1. **Agents step on each other.** Run two of them against the same repo and they fight over files. So you serialize.
2. **You cannot compare attempts.** When the agent gets something wrong, you have no easy way to try a different approach without throwing away the first.

## What Mozart does

Mozart gives every Task its own Workspace — an isolated copy of your repo with its own Agent Run and its own reviewable diff. You can run three Workspaces against the same Task in parallel, then pick the one you like.

It is a desktop app. Your code stays on your machine. You bring your own model provider (Claude today, more soon).

## Where we are

We are in private preview with a small group of users. If you want in, ping us on Discord — the link is in the footer.

There is a lot left to build. We will share more here as it lands.
