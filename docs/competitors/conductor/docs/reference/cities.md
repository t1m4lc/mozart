---
title: Cities
description: How Conductor names workspaces after cities
url: /docs/reference/cities
site: www.conductor.build
---

# Cities



Every Conductor workspace gets a city name.

Cities make workspace names memorable and distinct. They also give each workspace a stable directory base, so agents, shells, editors, and other tools can keep finding the same files on disk.

Conductor still uses the branch name or pull request title as the main way to identify active work. In the sidebar, the work item is primary; the city name is the place where that work lives.

## Why cities exist [#why-cities-exist]

Conductor creates isolated workspaces so you can run agents in parallel without making them fight over one checkout. Each workspace gets its own branch, working tree, files, running processes, and `.context` folder.

The city name is the friendly, durable part of that workspace location. For example, a workspace might live in a directory like `san-antonio-v3` while the branch explains what the workspace is doing.

For the underlying workspace model, see [Isolated workspaces](/docs/concepts/workspaces-and-branches).

## Passport [#passport]

You can see the cities you have visited in Passport. Open it from Command + K and search for `Passport`.

Passport is mostly for fun. It turns your workspace history into a little travel log, including the rare cities you have found along the way.

## Finding every city [#finding-every-city]

Conductor currently has 295 cities.

If you keep every spawned workspace active, Conductor avoids city bases that are already active. In that case, finding all cities is deterministic: it is impossible before 295 active workspaces and guaranteed at 295 active workspaces.

The probabilities below describe a different situation: visiting cities over time, where archived or deleted workspaces no longer prevent repeats. In that model, repeats are possible, and the last few cities take much longer to find.




## Chance of seeing all cities [#chance-of-seeing-all-cities]

Approximate likelihood of having seen all 295 cities after `n` workspace spawns:

| Workspaces spawned | Chance all cities seen |
| --- | --- |
| 5,000 | 0.29% |
| 6,000 | 1.68% |
| 7,000 | 5.34% |
| 8,000 | 11.81% |
| 9,000 | 20.69% |
| 10,000 | 30.99% |
| 11,000 | 41.65% |
| 12,000 | 51.83% |
| 13,000 | 60.98% |
| 14,000 | 68.87% |
| 15,000 | 75.47% |
| 16,000 | 80.84% |
| 18,000 | 88.55% |
| 20,000 | 93.27% |
| 22,000 | 96.08% |
| 24,000 | 97.74% |
| 26,000 | 98.70% |
| 28,000 | 99.25% |
| 30,000 | 99.57% |

## Confidence milestones [#confidence-milestones]

| Confidence | Workspaces needed |
| --- | --- |
| 50% | \~11,815 |
| 75% | \~14,923 |
| 90% | \~18,516 |
| 95% | \~21,101 |
| 99% | \~26,964 |

 
