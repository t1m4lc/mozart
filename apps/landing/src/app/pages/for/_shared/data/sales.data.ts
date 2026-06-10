import type { VerticalConfig } from '../vertical-config';

export const SALES_VERTICAL: VerticalConfig = {
  slug: 'sales',
  jobTitle: 'Sales',
  audience: 'sales teams',
  metaTitle: 'Mozart for Sales | AI Agents That Work With Your Files',
  metaDescription:
    'Mozart is a desktop app where AI agents draft, research, and prepare your sales work, using your own files, on your own computer. Deal data stays local.',
  keywords: [
    'ai agents for sales teams',
    'ai sales follow-up',
    'ai account research assistant',
    'private ai for sales',
    'ai proposal writing',
    'ai sales assistant without coding',
  ],
  heroEyebrow: 'Mozart for Sales',
  heroHeadline: 'Hand the busywork to AI agents. Keep selling.',
  heroSubcopy:
    "Most of a sales day isn't selling. It's writing, searching, preparing, and updating. Mozart is a desktop app where AI agents do that work with you: they read your files, draft what you need, and get you ready for the next conversation. Everything stays on your machine until you decide otherwise.",
  mock: {
    windowTitle: 'Sales · Monday prep',
    prompt: 'Prep my week: brief me on Acme and draft the follow-up.',
    agentTask: 'Preparing your week from notes and files...',
    workspace: ['accounts/', 'calls/', 'drafts/', 'prep/', 'proposals/'],
    inputs: [
      'calls/last-week-notes.md',
      'accounts/acme/proposal-v3.md',
      'accounts/acme/email-thread.txt',
    ],
    outputs: [
      { file: 'prep/acme-brief.md', state: 'new' },
      { file: 'drafts/acme-follow-up.md', state: 'new' },
      { file: 'prep/week-priorities.md', state: 'updated' },
    ],
  },
  scenarios: [
    {
      instruction: 'Where does the Acme deal stand? Draft the next email.',
      files: ['calls/acme-jun-02.md', 'proposals/acme-v3.md'],
      output: 'drafts/acme-next-step.md',
    },
    {
      instruction: "Build one-page briefs for tomorrow's three meetings.",
      files: ['calls/', 'accounts/', 'inbox-export.txt'],
      output: 'prep/tuesday-briefs.md',
    },
  ],
  pains: [
    {
      icon: 'lucideLayers',
      title: 'Your context lives in ten tabs',
      body: 'CRM, inbox, notes, the deck, and a chatbot that forgets you between sessions. You spend half the day moving information between windows. The selling happens in whatever gaps remain.',
    },
    {
      icon: 'lucideClipboard',
      title: "The AI doesn't know your deals",
      body: 'Every chat starts from zero. You re-explain the account, paste the history, and get generic advice back, because the AI cannot see your actual files: the deck, the thread, the pricing sheet.',
    },
    {
      icon: 'lucideShield',
      title: 'Deal data is too sensitive for random AI tools',
      body: "Pricing, deal terms, customer names. Pasting those into a cloud chat tool feels wrong, and for many teams it's against policy.",
    },
    {
      icon: 'lucideFiles',
      title: 'AI gives you answers. You still do the work',
      body: "A chatbot can tell you what to write. It can't open your notes, produce the document, and have it ready for review. That assembly is still your job.",
    },
  ],
  workflows: [
    {
      title: 'From your notes to finished drafts',
      without:
        'You re-read your call notes, dig out the latest deck, paste fragments into a chatbot, and stitch the answer back into an email by hand. Then the next account needs the same treatment, and the one after that.',
      withMozart:
        'Tell an agent what you need. It reads the notes in your workspace, and the drafts are ready for your review.',
      status: 'today',
    },
    {
      title: 'Briefed before every conversation',
      without:
        'Fifteen browser tabs, a proposal you half-remember, an email thread you scroll at the last second, and a frantic skim while the meeting link is already open.',
      withMozart:
        'Point the agent at the account folder. One page: context, open items, and what to probe.',
      status: 'today',
    },
    {
      title: 'Files that stay in order',
      without:
        'Proposals named final, final-v2, and final-FINAL scattered across folders. Pricing that changed two weeks ago still living in last month\'s deck. A find-and-replace error waiting to embarrass you in front of a customer.',
      withMozart:
        'Ask the agent to clean up, update, or restructure, then review the changes before accepting.',
      status: 'today',
    },
  ],
  integrations: ['CRM', 'Gmail', 'Calendar', 'LinkedIn', 'Notion'],
  faq: [
    {
      question: 'What does Mozart actually do for sales today?',
      answer:
        'Mozart runs AI agents (Claude Code and Codex) in isolated workspaces on your machine. Point them at notes, templates, exports, or whole folders: they read, draft, analyze, and organize, and you review every output before it goes anywhere.',
    },
    {
      question: 'Which files can agents work with?',
      answer:
        'Anything you can save to a folder: call notes in any format, CRM exports as CSV, decks, proposals, transcripts, saved email threads. Agents read what is in the workspace and produce drafts or analysis from it.',
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
        'Today Mozart is most comfortable for technical users. The experience built for sales: no terminal, just your files and a clean interface, is in development. Join the waitlist to be first in line.',
    },
  ],
};
