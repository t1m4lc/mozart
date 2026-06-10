import type { VerticalConfig } from '../vertical-config';

export const SALES_VERTICAL: VerticalConfig = {
  slug: 'sales',
  jobTitle: 'Sales',
  audience: 'sales teams',
  metaTitle: 'AI Agents for Sales Teams | Mozart: Local, Private AI Workspace',
  metaDescription:
    'Stop losing hours to follow-up and proposal grind. Mozart runs AI agents on your machine, turning call notes into drafted follow-ups, with deal data staying off the cloud.',
  keywords: [
    'ai agents for sales teams',
    'ai sales follow-up',
    'ai account research assistant',
    'private ai for sales',
    'ai proposal writing',
    'ai sales assistant without coding',
  ],
  heroEyebrow: 'Mozart for Sales',
  heroHeadline: 'Stop losing hours to follow-up and proposal grind',
  heroSubcopy:
    'Call notes, account research, proposals. The work between client conversations is where your day disappears. Mozart runs AI agents on your machine to turn that grind into reviewed drafts, with deal data staying off the cloud.',
  mock: {
    windowTitle: 'Sales · Follow-up drafts',
    agentTask: 'Reviewing this week\'s call notes...',
    inputs: [
      'calls/acme-corp-2026-06-09.md',
      'calls/techflow-2026-06-08.md',
      'calls/westbridge-2026-06-07.md',
    ],
    outputs: [
      { file: 'drafts/acme-follow-up.md', label: 'Review →' },
      { file: 'drafts/techflow-follow-up.md', label: 'Review →' },
      { file: 'drafts/westbridge-follow-up.md', label: 'Review →' },
    ],
  },
  pains: [
    {
      icon: 'lucideClipboard',
      title: 'Your follow-ups live in five browser tabs',
      body: 'After every call you bounce between ChatGPT, your notes, the deck, and your inbox, copy-pasting context that the AI forgets the next time you open a tab.',
    },
    {
      icon: 'lucideShield',
      title: 'Pipeline data is too sensitive for random AI tools',
      body: "Pricing, deal terms, customer names. Pasting those into a cloud chat tool feels wrong, and for many teams it's against policy.",
    },
    {
      icon: 'lucideSearch',
      title: 'Account research is a part-time job',
      body: "Building a real picture of a prospect means stitching together old threads, past proposals, and public info by hand. AI could do it, but only if it can see your actual files.",
    },
    {
      icon: 'lucideTerminal',
      title: 'The best AI agents require a terminal',
      body: "The most capable AI agents ship as command-line tools built for engineers. You shouldn't need a terminal to get leverage from them.",
    },
  ],
  workflows: [
    {
      title: 'From call notes to follow-up drafts',
      without:
        'You re-read your notes, dig out the deck, and write each follow-up from scratch. Or paste fragments into a chatbot and rebuild context every single time.',
      withMozart:
        'Point an agent at your call notes folder. It reads every note and drafts personalized follow-ups for each account as files on your machine, ready for your review before anything goes anywhere.',
      status: 'today',
    },
    {
      title: 'Account brief before every call',
      without:
        'Fifteen browser tabs, an old proposal you half-remember, and a frantic skim five minutes before the meeting.',
      withMozart:
        'Drop your past notes, threads, and proposals for an account into a workspace. The agent compiles a one-page brief with context to reference, open items, and gaps to probe, refreshed before each call.',
      status: 'today',
    },
    {
      title: 'Proposals that start 80% done',
      without:
        "Every proposal begins as a copy of the last one, with find-and-replace errors waiting to embarrass you.",
      withMozart:
        'Share your templates and the deal notes. The agent drafts the proposal, flags the sections that need your judgment, and keeps pricing data on your machine rather than in a shared doc or a chat log.',
      status: 'today',
    },
  ],
  futureSkills: [
    {
      title: 'Follow-up writer',
      description:
        'Turns raw call notes into sequenced follow-up drafts matched to your voice.',
    },
    {
      title: 'Deal-brief builder',
      description:
        'Compiles everything you know about an account into a brief you can skim before the call.',
    },
    {
      title: 'Proposal assembler',
      description:
        'Drafts proposals from your templates and deal context, with risky sections highlighted for review.',
    },
  ],
  integrations: ['CRM', 'Gmail', 'Calendar', 'LinkedIn', 'Notion'],
  faq: [
    {
      question: 'What does Mozart actually do for sales today?',
      answer:
        'Mozart runs AI agents (Claude Code and Codex) in isolated workspaces on your machine. You point the agent at your call notes, templates, or deal files. It reads them and produces drafts you review before they go anywhere.',
    },
    {
      question: 'Can Mozart update my CRM?',
      answer:
        'CRM, email, and calendar integrations are on our roadmap. Today agents work with files and projects on your machine: exports, notes, templates.',
    },
    {
      question: 'Is my deal data safe?',
      answer:
        "Mozart runs locally. Your files stay on your machine, and agents only use the LLM credentials you connect. Nothing is uploaded to Mozart's servers.",
    },
    {
      question: 'Do I need to know how to code?',
      answer:
        "Today Mozart is most comfortable for technical users. The experience built for sales: no terminal, just your files and a clean interface, is in development. Join the waitlist to be first in line.",
    },
  ],
};
