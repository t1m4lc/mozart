---
title: Configure model providers
description: Connect Conductor to different model providers
url: /docs/guides/providers
site: www.conductor.build
---

# Configure model providers



Conductor runs using your local Claude Code login. You can check your auth status by running `claude /login` in your terminal.

We also support running Claude Code on OpenRouter, AWS Bedrock, Google Vertex AI, Vercel AI Gateway, or any Anthropic API compatible provider, like GLM.

Open `Settings` -> `Providers` in Conductor to configure model providers. Check out the [Claude Code docs](https://code.claude.com/docs/en/third-party-integrations) for a full list of provider environment variables.

When using Anthropic-compatible providers like OpenRouter, Vercel AI
Gateway, or GLM, `ANTHROPIC_API_KEY` must be explicitly set to an empty
string to prevent Claude Code from attempting to authenticate with Anthropic
directly.

```bash
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="your-openrouter-api-key"
export ANTHROPIC_API_KEY=""
```

Docs: [OpenRouter Claude Code integration](https://openrouter.ai/docs/guides/guides/claude-code-integration)

```bash
export ANTHROPIC_BASE_URL="https://ai-gateway.vercel.sh"
export ANTHROPIC_AUTH_TOKEN="your-vercel-ai-gateway-api-key"
export ANTHROPIC_API_KEY=""
```

Docs: [Vercel AI Gateway Anthropic-compatible API](https://vercel.com/docs/ai-gateway/sdks-and-apis/anthropic-compat)

```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1
export ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION=us-west-2
export ANTHROPIC_DEFAULT_OPUS_MODEL='us.anthropic.claude-opus-4-7'
export ANTHROPIC_DEFAULT_SONNET_MODEL='us.anthropic.claude-sonnet-4-6'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='us.anthropic.claude-haiku-4-5-20251001-v1:0'
```

Docs: [AWS Bedrock Claude Code](https://docs.aws.amazon.com/bedrock/latest/userguide/claude-code.html)

```bash
export ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic"
export ANTHROPIC_AUTH_TOKEN="your-zai-api-key"
export ANTHROPIC_API_KEY=""
```

Docs: [GLM Claude integration](https://docs.z.ai/scenario-example/develop-tools/claude)

```bash
# Enable Azure AI Foundry integration
export CLAUDE_CODE_USE_FOUNDRY=1

# Azure resource name (replace {resource} with your resource name)
export ANTHROPIC_FOUNDRY_RESOURCE={resource}
# Or provide the full base URL:
# export ANTHROPIC_FOUNDRY_BASE_URL=https://{resource}.services.ai.azure.com

# Set models to your resource's deployment names
export ANTHROPIC_DEFAULT_SONNET_MODEL='claude-sonnet-4-5'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='claude-haiku-4-5'
export ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-4-5'
```

Docs: [Azure AI Foundry Claude Code](https://learn.microsoft.com/en-us/azure/ai-foundry/model-inference/how-to/use-claude-code)

## See more [#see-more]

See the [Claude Code docs](https://code.claude.com/docs/en/third-party-integrations) for a full list of environment variables.

 
