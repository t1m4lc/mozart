import type { VerticalConfig } from '../vertical-config';

export const SMALL_BUSINESS_VERTICAL: VerticalConfig = {
  slug: 'small-business',
  jobTitle: 'Small Teams',
  audience: 'small business teams',
  metaTitle: 'Mozart for Small Teams | The AI Productivity App',
  metaDescription:
    'Mozart runs AI agents on your computer to create documents, analyze data, and organize your business files. Free for individuals. Your data stays yours.',
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
  heroHeadline: 'The AI productivity app for people who do a bit of everything',
  heroSubcopy:
    'When you run a small business, every job is your job: the documents, the numbers, the follow-ups, the files. Mozart puts AI agents on your computer that handle that work with you. They create, analyze, and organize using your actual files. Free for individuals, and your business data never leaves your machine through Mozart.',
  mock: {
    windowTitle: 'Ops · Weekly business review',
    prompt: 'Write the weekly review from the metrics and meeting notes.',
    agentTask: "Summarizing this week's data and notes...",
    workspace: ['docs/', 'ops/', 'reports/', 'team/'],
    inputs: [
      'ops/weekly-metrics.csv',
      'team/meeting-notes-jun-09.md',
      'docs/q2-goals.md',
    ],
    outputs: [
      { file: 'reports/weekly-summary.md', state: 'new' },
      { file: 'ops/action-items.md', state: 'updated' },
    ],
  },
  scenarios: [
    {
      instruction:
        "Turn this quarter's sales export into a report I can send the bank.",
      files: ['ops/q2-sales-export.csv', 'docs/q2-goals.md'],
      output: 'reports/q2-summary.md',
    },
    {
      instruction: 'Tidy our process docs and flag anything out of date.',
      files: ['docs/processes/'],
      output: 'docs/processes-cleanup.md',
    },
  ],
  pains: [
    {
      icon: 'lucideFiles',
      title: "Your team's knowledge is scattered everywhere",
      body: 'Notion, Google Docs, shared drives, old email threads. The information that runs your business is fragmented, and the AI you ask for help cannot see any of it.',
    },
    {
      icon: 'lucideDollarSign',
      title: 'AI add-ons charge per seat, then add up fast',
      body: 'Notion AI, Copilot for Microsoft 365, ChatGPT Teams. The moment you want AI built into your tools, the bill multiplies by headcount. Your team ends up sharing logins or going without.',
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
      title: 'Reports from your actual data, not memory',
      without:
        'Someone spends Friday afternoon pulling numbers from spreadsheets, skimming meeting notes, and assembling a summary by hand that everyone will skim for two minutes.',
      withMozart:
        'Point the agent at the metrics file and the meeting notes. The summary is drafted with highlights, blockers, and open items. You review and share.',
      status: 'today',
    },
    {
      title: 'Your documents, in order',
      without:
        'Process docs, policies, and how-tos sit in a folder nobody reads until something goes wrong. New team members ask the same questions because the docs are hard to search and harder to trust.',
      withMozart:
        'Run an agent over the folder. It flags gaps and contradictions and produces a cleaner version your team can actually use.',
      status: 'today',
    },
    {
      title: 'Analysis without the spreadsheet wrestling',
      without:
        'Data lives in spreadsheets, notes live in docs, and analysis requires someone to bridge them manually. Usually the person who has the least time.',
      withMozart:
        'Drop the data exports and context docs into a workspace. The analysis comes back as a real document you edit.',
      status: 'today',
    },
  ],
  integrations: [
    'Notion',
    'Google Drive',
    'Slack export',
    'Airtable',
    'Linear',
    'Jira',
  ],
  faq: [
    {
      question: 'Is Mozart a replacement for Notion?',
      answer:
        'Not directly. But for teams that spend more time asking AI about their Notion docs than reading them, Mozart may do more. It runs agents on your actual files and produces editable outputs, rather than answering questions in a chat.',
    },
    {
      question: 'Can multiple people on the team use it?',
      answer:
        'Today Mozart is designed for individual use. Each person on your team can run their own local instance. Shared team workspaces with sync and collaboration are coming in Mozart Cloud.',
    },
    {
      question: 'Does it need to connect to our existing tools?',
      answer:
        'Not to start. Mozart works with files on your machine. Export from Notion, Drive, or Airtable and agents can process them immediately. Native integrations are on our roadmap.',
    },
    {
      question: 'Is our business data safe?',
      answer:
        'Mozart runs locally. Your files and business data never leave your machine through Mozart. Agents use the LLM provider you choose, and you control exactly what context they see.',
    },
  ],
};
