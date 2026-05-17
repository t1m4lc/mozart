---
title: 'Hello, World'
description: 'How an exhausted freelance dev ended up building a manager for AI coding agents.'
date: 2026-05-17
authors:
  - name: Timothy Alcaide
    role: Founder
    avatar: /assets/landing/authors/timothy.webp
---

# Hello World

> _"I'm sick of working for other people's dreams."_

That's the sentence that started it all. Not a rational decision, not a business plan, not a flash of genius — just exhaustion turning into clarity. One evening, in Montpellier, after weeks of chasing freelance gigs and hitting walls.

A few days later, I started building Mozart. This blog tells what comes next.

But first, let me rewind a bit.

I'm a self-taught developer. I discovered code at 14, and I learned everything on my own — through documentation, failed projects, and YouTube tutorials until 5 in the morning. For the last two years, I've done a few freelance gigs for small companies while travelling: Vietnam, Turkey, Portugal, Morocco, Thailand. Between stopovers, I tried to launch my own apps. None of them took off. I ended up dropping code for a while — I have this annoying tendency to overdose on what I love. But the passion always comes back.

When I picked code back up after a few months without a computer, it hit me hard. LLMs had made a massive leap.

I realised that the way we code was changing at a deep level. The craft of code is mutating: developers aren't just the ones writing each line anymore — they're becoming the ones who orchestrate, direct, and arbitrate.

A code manager.

Arthur Mensch, co-founder of Mistral, made the point recently [in front of the French National Assembly](https://youtu.be/kKWOkWv6pJM): the bottleneck is no longer code production. It has shifted toward design and coordination. The more agents you stack, the more productivity you gain — but that productivity plateaus quickly if you don't know how to pilot them.

That's exactly the problem I want to solve.

## The dormant dream

Around 2014, I discovered Y Combinator. At the time, I wasn't a developer yet. I had a civil engineering technician degree and worked in a lab, mostly on the road inspecting sports facilities. In the car, I listened to podcasts by Oussama Ammar (co-founder of The Family). A controversial figure — you love him or you don't — but he infused YC culture into France and inspired my generation. In parallel, I was reading Paul Graham's essays. All of that shaped how I saw startups, but only as a spectator. Watching from the sidelines, not daring to get my hands dirty.

Later, when I got seriously into code, the urge to start my own company never left me. But I always had an excellent excuse to put it off: _"I'm self-taught"_, _"I lack experience"_, _"I still need to earn my stripes"_, _"It's not the right time"_.

In hindsight, I know what was happening. **There's never a right time.** The real blocker wasn't my level. It was that I hadn't yet found the idea. The one that makes you say: _this is it, this is now, I'm not letting it pass._

## Crossing the desert

Finding your path is a chaotic process. At least it was for me. I regularly cross deserts — long stretches where nothing sticks, where doubt sets in. And then, every so often, I stumble onto an oasis. That's enough to get me moving again.

Before Mozart, I launched several projects. Not all of them finished, not all of them I'd own up to:

- A Chrome extension to automate social-media replies via LLM. Not a bad idea, mediocre execution, zero distribution.
- A sports platform built around events in France. Around 200 visitors a day, but zero paying customers so far. Alive, but small.

The lesson fits in one word: **distribution.**

In _The Hitchhiker's Guide to the Galaxy_, Douglas Adams tells the story of a civilisation that has a brilliant idea: ship off everyone deemed "useless" — salespeople, marketers, consultants, hairdressers… At first, everything's great. Fewer meetings. Less posturing. The planet feels better.

Then comes the boring detail: without those people, civilisation collapses. Moral of the story: never underestimate distribution… or hairdressers lol.

You can build without distributing for a while. But not forever.

## The genesis: memory first

The first serious intuition wasn't actually about Mozart. It was a thought about memory.

I was sick of having to repeat the same context over and over.

From one prompt to the next, memory is very limited. From one LLM to another, it disappears entirely. You explain your project to ChatGPT, then you start over with Claude, then with a third tool.

Even when memory exists, it tends to stay opaque, frustrating, and hard to control.

The starting idea: build a universal memory layer, pluggable into any model. A space that belongs to you, that stores your notes, your code, your projects, and exposes itself to the LLMs of your choice.

I quickly realised the topic was far more complex than it looked: embeddings, entity graphs, retrieval… every path opened up new problems. And if people much more advanced than me are already working on it without a clear solution emerging, it's probably because it isn't that simple.

The idea didn't disappear: it became the first pillar of Mozart.

Then one evening, the second click. **If multiple LLMs can share a common context, why stick to a single agent?**

Every AI giant is pushing its own closed interface. ChatGPT has one, Claude has one. But none of them is designed to make several agents work together — from different models, on interconnected tasks, in parallel.

Mozart was born out of that void. A cockpit: you launch your agents, they each move forward on their own work, and you keep your hand on the whole thing.

First step: look at the competition. It exists, it's well-funded, further along. The first instinct is to get discouraged. But an empty market would be far more worrying.

Competitors prove one thing: the problem is real. Serious teams believe in it, investors too. But no one seems to have definitively cracked it yet.

The window is probably still open.

## What is Mozart?

Here are the three founding pillars:

- **For developers (at first)** — Mozart is designed for technical profiles who work with files and code, and who like to configure their own tools.
- **Local-first & Markdown** — your files live on your machine, readable by you, ideal for LLMs, easily synced via GitHub. Ultra-low latency and more privacy.
- **Multi-agent & extensible** — orchestration will be the heart of the product. Coordinating agents, distributing tasks, aggregating results without depending on a single AI vendor. This logic will eventually extend beyond code (admin, ops, business).

## Where things stand

Mozart isn't public yet. I'm building the MVP. Or rather an _"MVP++"_, because I have this annoying tendency to over-polish — a real flaw when you know how important _"talk to users"_ is. I'm working on it.

The next step is a beta with a few peers and early adopters, before opening up publicly ASAP.

I already know where my pain point will be: distribution. Knowing how to build, that's fine. Getting it known, that's another story.

Hello, world.

---

_This is the English version of an article originally written in French._
