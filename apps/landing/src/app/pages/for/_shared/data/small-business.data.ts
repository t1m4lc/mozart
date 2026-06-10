import type { VerticalConfig } from '../vertical-config';

export const SMALL_BUSINESS_VERTICAL: VerticalConfig = {
  slug: 'small-business',
  jobTitle: 'Small Teams',
  audience: 'small business teams',
  metaTitle: 'AI Workspace for Small Teams | Mozart: Private, Local-First',
  metaDescription:
    'Run your operations on AI, not copy-paste into ChatGPT. Mozart runs agents on your business docs and files, locally. No per-seat pricing, no data leaving your machine.',
  keywords: [
    'ai for small business',
    'ai knowledge management',
    'notion alternative ai',
    'ai business docs',
    'private ai for teams',
    'ai workspace small business',
    'local ai for operations',
  ],
  heroEyebrow: 'Mozart for Small Teams',
  heroHeadline: 'Run your operations on AI, not just run them past AI',
  heroSubcopy:
    "Your team's knowledge is in Notion, Google Docs, shared drives, and a dozen chat threads. Mozart runs AI agents on all of it, on your machine, acting on your actual files, without your business data going through someone else's server.",
  mock: {
    windowTitle: 'Ops · Weekly business review',
    agentTask: 'Summarizing this week\'s data and notes...',
    inputs: [
      'ops/weekly-metrics.csv',
      'team/meeting-notes-jun-09.md',
      'docs/q2-goals.md',
    ],
    outputs: [
      { file: 'reports/weekly-summary.md', label: 'Review →' },
      { file: 'ops/action-items.md', label: 'Review →' },
    ],
  },
  pains: [
    {
      icon: 'lucideFiles',
      title: "Your team's knowledge is scattered everywhere",
      body: "Notion, Google Docs, shared drives, old email threads. The information that runs your business is fragmented, and no AI tool can see across all of it.",
    },
    {
      icon: 'lucideDollarSign',
      title: 'AI add-ons charge per seat, then add up fast',
      body: "Notion AI, Copilot for Microsoft 365, ChatGPT Teams. The moment you want AI built into your tools, the bill multiplies by headcount. Your team ends up sharing logins or going without.",
    },
    {
      icon: 'lucideShield',
      title: 'Business data in a cloud AI is a governance problem',
      body: "Financials, client info, internal strategy. Pasting any of that into a third-party AI means it touches a server you don't control. For small teams, that's a real risk with no legal team to catch it.",
    },
    {
      icon: 'lucideClipboard',
      title: "The AI doesn't know your business, so you brief it every time",
      body: "Every new chat session starts from scratch. Your team's context, terminology, and workflows never stick. You spend more time briefing the AI than letting it work.",
    },
  ],
  workflows: [
    {
      title: 'Weekly ops review from actual data, not memory',
      without:
        'Someone spends Friday afternoon pulling numbers from spreadsheets, skimming meeting notes, and assembling a summary by hand that everyone will skim for two minutes.',
      withMozart:
        'Point an agent at your weekly metrics file and meeting notes. It drafts the summary with highlights, blockers, and open items as a file you review and share. Done in minutes.',
      status: 'today',
    },
    {
      title: 'Turn your SOPs into AI-navigable playbooks',
      without:
        "Your SOPs sit in a folder that nobody reads until something goes wrong. New team members ask the same questions repeatedly because the docs are hard to search and harder to trust.",
      withMozart:
        "Run an agent over your SOPs and process docs. It extracts the key procedures, flags gaps and contradictions, and produces a cleaner version: a knowledge base your team can actually use.",
      status: 'today',
    },
    {
      title: 'Reports and analysis from your business files',
      without:
        "Data lives in spreadsheets, notes live in docs, and analysis requires someone to bridge them manually. Usually the person who has the least time.",
      withMozart:
        'Drop your data exports and context docs into a workspace. The agent reads both and produces the analysis as a real document you edit, not a chat transcript you copy from.',
      status: 'today',
    },
  ],
  futureSkills: [
    {
      title: 'Ops review generator',
      description:
        'Compiles weekly metrics, meeting notes, and open items into a structured team review document.',
    },
    {
      title: 'SOP auditor',
      description:
        'Reads your process docs, flags inconsistencies and gaps, and suggests a cleaner structure.',
    },
    {
      title: 'Business analyst',
      description:
        'Synthesizes data exports and context files into reports your team can act on.',
    },
  ],
  integrations: ['Notion', 'Google Drive', 'Slack export', 'Airtable', 'Linear', 'Jira'],
  faq: [
    {
      question: 'Is Mozart a replacement for Notion?',
      answer:
        "Not directly. But for teams that spend more time asking AI about their Notion docs than reading them, Mozart may do more. It runs agents on your actual files and produces editable outputs, rather than answering questions in a chat.",
    },
    {
      question: 'Can multiple people on the team use it?',
      answer:
        "Today Mozart is designed for individual use. Each person on your team can run their own local instance. Shared team workspaces with sync and collaboration are coming in Mozart Cloud.",
    },
    {
      question: "Does it need to connect to our existing tools?",
      answer:
        "Not to start. Mozart works with files on your machine. Export from Notion, Drive, or Airtable and agents can process them immediately. Native integrations are on our roadmap.",
    },
    {
      question: 'Is our business data safe?',
      answer:
        "Mozart runs locally. Your files and business data never leave your machine through Mozart. Agents use the LLM provider you choose, and you control exactly what context they see.",
    },
  ],
};
