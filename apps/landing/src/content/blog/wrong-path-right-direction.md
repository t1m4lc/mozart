---
title: 'The wrong path, not the wrong direction'
description: 'Same vision, new path: opening AI agents to the people who do not have a developer license.'
date: 2026-06-10
authors:
  - name: Timothy Alcaide
    role: Founder
    avatar: /assets/landing/authors/timothy.webp
---

A few weeks ago, I opened Mozart up in [private beta](https://mozart.build/changelog/v0-1-0-beta-1/). No public launch, no big announcement, just a handful of invites handed to developers, beta testers, and people curious about the project.

Since then, I've mostly done one thing: listen.

I talked with people who had installed the app, others watching from a distance, and others still who asked me questions I didn't have good answers for. Those conversations taught me far more than weeks of coding alone.

This post is my honest takeaway. There's good news and less good news.

**The less good: I think I took the wrong path. The good: I don't think I got the direction wrong.**

Let me try to explain the difference.

## The vision was already there

When I wrote my very first post, [Hello, World](https://mozart.build/blog/hello-world/), Mozart already rested on a few clear pillars: local-first, LLM-agnostic, multi-agent, extensible.

My deep conviction, the one that doesn't move, is that artificial intelligence is going to transform the work we do behind a computer. Not just code: every task where you handle files, documents, data, processes, emails, CRMs.

**The goal, from day one, has always been to open AI agents up to people who aren't insiders.** That destination has never moved.

What moves is the route I chose to get there.

## Why I started with developers

**Reaching developers was never the destination. It was a strategy:** the fastest path to my first users.

And the logic held up. Developers already live in repositories and git worktrees, switch branches without thinking, and treat the command line as home. They know what an agent is and aren't scared of a terminal. Since I'm a developer myself, I was building for me and for people like me.

There was also a more technical reason. Mozart is built on Git, with its repositories, branches, and worktrees, and targeting developers meant I didn't have to hide that machinery. I could leave it visible, stay transparent, and spare myself a heavy abstraction job.

Or so I believed.

Because talking with those early users, I realized something uncomfortable. Developers are already heavily exposed to these tools. They test a lot, compare everything, have settled habits, and are, rightly, very critical.

A new tool around agents, code, and orchestration ships almost every week; you see things like OpenCode, Conductor, Claude Cowork or Antigravity. Capturing a developer's attention means stepping into an already crowded market, where everyone has their setup and a very high bar.

It's not impossible. But I started asking myself: is that really where the sharpest need is? **I'm not so sure anymore.**

## The real need is elsewhere

Because right next door, there's another world.

Plenty of people aren't developers and are barely initiated into AI, yet already feel the power of ChatGPT. They use it every day, but stay stuck in a copy-paste loop.

They work with files, documents, emails, CRMs, tenders, and internal processes, whether they're in [sales](https://mozart.build/for/sales/) or running a [small business](https://mozart.build/for/small-business/). And they have no simple interface to put an agent to work on their real context, their real documents. **They sense something powerful is within reach, but the bridge doesn't exist.**

In many companies there's a confidentiality issue too: you can't just paste everything into an external cloud tool. Contracts, internal documents, sensitive data, none of that can go just anywhere.

That's exactly why two things aren't moving: **the local-first and privacy-first approach.** Mozart has to let you use agents on your real working environment, without needlessly shipping all your data to the cloud.

For now the priority is crystal clear, almost obsessive: produce something genuinely useful for one user, on their machine, with their files, their tools, their context. A single user, but real value.

The rest comes later. Longer term, there will probably be a cloud or collaborative dimension to Mozart, but it isn't set in stone, and I won't pretend to have all the answers.

It doesn't have to mean every user's files end up in the cloud. I could run Mozart on the client's own servers, keep files local and sync only certain changes or metadata, let several people share a knowledge base without centralizing everything, or offer open-source models in the cloud later for those without a powerful enough machine. Those questions are real, and I own them, but they shouldn't dictate the coming weeks. They can wait until the first brick stands on its own.

## The cockpit, and the pivot ahead

Here's how I see it today. LLMs produce a form of intelligence. That's the oil, the fuel. It's precious, it's powerful. But fuel alone isn't enough. To get from point A to point B, you need a car. A cockpit. An interface.

> To really pilot that intelligence today, you almost always need a pilot's license. In other words, a developer's license.

You have to know how to handle files, commands, configurations. **Mozart's ambition is to build that cockpit for everyone who works behind a computer, not just for developers.**

The name is no accident. Mozart isn't just "launch an agent." It's to compose. To orchestrate. To turn files, tools, models, and skills into workflows that are actually useful.

But there's a tricky balance to strike. A tool that's too generic loses the user: it can do anything, so they don't know where to start. A tool that's too specialized traps them: it does one thing, and nothing else.

So the idea is a fairly generic base, a bit like Notion can be, with guided, opinionated paths: skills, templates, business workflows, itineraries. Enough that the user doesn't get lost in the desert of organizing it all themselves.

Concretely, this means a real pivot, and a big refactor. I'll have to:

- drastically simplify the product language;
- remove or hide the overly technical notions like Git, branches, clones, workspaces;
- reduce the visible dependencies;
- stop framing the experience solely around code;
- make the tool genuinely usable by non-developers;
- keep all the power of the agents, but make piloting them much simpler.

And this is where my opening bet turns against me. I wanted to stay transparent about Git to save myself work. But pushed far enough, that abstraction could take me all the way: no longer exposing Git at all, maybe not even relying on it under the hood. Honestly, I don't yet know how far it'll go, and it's a little dizzying, because Git is Mozart's current foundation.

I won't lie: it's not comfortable. Pivoting means going back on things I built, sometimes throwing them away, accepting that I took a detour. It costs time, energy, and money.

**But I'd rather take the wrong path and correct it than dig into the wrong direction out of sheer comfort.**

## A first testing ground, and the week ahead

And then there's good news. I've been lucky enough to find a company that believes in the project and is ready to test Mozart in a real professional setting, with, perhaps, real clients later, once the product is mature enough.

This company works in software, with clients in construction and construction ERP. And that's where the loop closes in a funny way: before Mozart, I'd already had the idea of building a platform to help companies respond to tenders.

This case could become a great through-line. I can already picture a dedicated business template: agents, specific scripts, connections to platforms, and partial automation of responding to tenders or managing construction projects. A space I'm comfortable in, since I have a degree in civil engineering. A real trade, a real need, genuinely real documents, and a pain everyone knows.

So the coming week will go into designing this pivot, and the heavy refactor needed to simplify Mozart, lift the current limitations, and move toward an experience more accessible to non-developers.

I've already started communicating the new direction through vertical landing pages: the idea is to work on SEO, funnel the people interested in a specific use case, and capture the first leads through a waitlist. It's also a way to stay true to the build-in-public spirit: put hypotheses out there, see what resonates, and adjust.

## Conclusion: to be continued

I don't have all the answers. I won't pretend everything is already in place, or that this pivot will be simple. There are open questions, work ahead of me, and a share of the unknown that I accept. But I sincerely believe it's the right direction.

I thought the best path to make AI agents accessible to everyone was to start with developers. **I'm realizing today that the real point may be precisely to help those who don't have that pilot's license.**

To be continued.

---

_This is the English version of an article originally written in French._
