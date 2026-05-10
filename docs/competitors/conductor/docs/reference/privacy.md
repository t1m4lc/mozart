---
title: Privacy
description: What we do (and don't do) with your data
url: /docs/reference/privacy
site: www.conductor.build
---

# Privacy



## What data do we use? [#what-data-do-we-use]

We don't look at your chats, and we don't want to. Your chats are between you and your AI.

We do collect analytics data, like what features you use, crash logs, etc. This helps us fix bugs and learn which parts of Conductor to improve.

## Where do you store my chats? [#where-do-you-store-my-chats]

Your chat history is saved locally in the Application Support directory `~/Library/Application Support/com.conductor.app`. None of it is stored on our servers.

## What types of data does Conductor collect? [#what-types-of-data-does-conductor-collect]

Most app data is stored locally on your computer in the Application Support directory.

Here's what we store elsewhere:

In an encrypted Postgres database served by Fly, we store:

* Your account data (such as your email address, and if you integrate with GitHub, installation data)

We store analytics data in [PostHog](https://posthog.com/) when an event occurs in the app, such as

* You create a workspace, select a model, or send a message (including metadata like which model was involved and which app features you’re using)
* A model provider returns an error (including the error message)
* An unexpected error occurs (including the error message and stack trace)

PostHog stores data about your computer, like your OS and IP address.

We don't capture or store any session recordings.

## Where does my network traffic go? [#where-does-my-network-traffic-go]

All network traffic goes straight to your model provider. By default, this is Anthropic, but you can set a custom provider (like Bedrock or Vertex) in `Settings` -> `Providers`.

## What data do the model providers collect? Are my messages used for training? [#what-data-do-the-model-providers-collect-are-my-messages-used-for-training]

You can find the privacy policy of our model providers here:

* [Anthropic](https://www.anthropic.com/legal/privacy)
* [OpenAI](https://openai.com/policies/row-privacy-policy/)

## Is my data encrypted? Who can access my data? [#is-my-data-encrypted-who-can-access-my-data]

Any data we store (like your email) is encrypted in a Fly Postgres database or on PostHog's servers (both SOC 2 compliant). It can be accessed only by Conductor employees.

## Enterprise data privacy [#enterprise-data-privacy]

Disable features requiring external AI providers, such as AI generated chat titles, as well as custom MCP servers.

* **User level** — toggle it in `Settings` -> `Privacy`. This applies to your machine only.
* **Repo level** — set `enterpriseDataPrivacy` to `true` in your [`conductor.json`](/docs/reference/conductor-json) file. This applies to everyone working in the repo.

```json
{
    "enterpriseDataPrivacy": true
}
```

These settings are independent — if either one is enabled, enterprise data
privacy is enabled. You don't need to configure both.

 
