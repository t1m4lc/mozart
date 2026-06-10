import type { VerticalConfig } from '../vertical-config';

export const RECRUITING_VERTICAL: VerticalConfig = {
  slug: 'recruiting',
  jobTitle: 'Recruiting',
  audience: 'recruiting teams',
  metaTitle: 'Mozart for Recruiting | AI Agents, Your Files, Your Judgment',
  metaDescription:
    'Mozart is a desktop app where AI agents read, draft, and organize recruiting work on your computer. Candidate data stays local; decisions stay yours.',
  keywords: [
    'ai agents for recruiters',
    'private ai recruiting assistant',
    'ai recruiting workflow',
    'recruiting ai without uploading data',
    'ai assistant for recruiters',
    'ai interview prep',
  ],
  heroEyebrow: 'Mozart for Recruiting',
  heroHeadline: 'AI agents for everything in recruiting, except the judgment',
  heroSubcopy:
    'Recruiting means reading, writing, comparing, and coordinating all day. Mozart is a desktop app where AI agents take on that load: they work with the files on your computer, draft and summarize for your review, and keep your roles organized. People decisions stay with you, and candidate data stays on your machine.',
  mock: {
    windowTitle: 'Recruiting · Weekly review',
    agentTask: 'Summarizing this week across your open roles...',
    inputs: [
      'pipeline/export-jun-08.csv',
      'notes/hiring-manager-syncs.md',
      'roles/open-roles.md',
    ],
    outputs: [
      { file: 'reports/weekly-hiring-update.md', label: 'Review →' },
      { file: 'drafts/hm-update-email.md', label: 'Review →' },
    ],
  },
  pains: [
    {
      icon: 'lucideFiles',
      title: 'Your day is a hundred documents deep',
      body: 'Profiles, notes, briefs, threads, feedback forms. Recruiting is reading and writing at a volume nobody staffed you for, and it multiplies every time a new role opens.',
    },
    {
      icon: 'lucideShield',
      title: "People data doesn't belong in random AI tools",
      body: 'Candidate files are personal data. Under GDPR and most privacy frameworks, uploading them to whatever AI service is currently popular is a legal and reputational risk. Your candidates trusted you with their story, not the internet.',
    },
    {
      icon: 'lucideClipboard',
      title: 'Every AI chat needs the whole story again',
      body: 'The role, the team, the company, what the hiring manager actually wants. You re-brief the AI every session because it cannot see your files. Ten minutes of setup for two minutes of help.',
    },
    {
      icon: 'lucideMail',
      title: "Writing that sounds human takes time you don't have",
      body: 'Outreach, hiring-manager updates, candidate summaries, interview feedback. Templates are fast but sound like templates, and doing it properly eats the day.',
    },
  ],
  workflows: [
    {
      title: 'Reading at volume, without losing the thread',
      without:
        'You open the documents one at a time, keep a mental tally, and hope your fourth-coffee judgment matches your first-of-morning one. By the end of the day, the early ones blur together.',
      withMozart:
        'Point the agent at the folder. It returns structured summaries and comparisons with its reasoning shown. You judge.',
      status: 'today',
    },
    {
      title: 'Writing that sounds like you',
      without:
        'Copy the template, swap the name, hope nobody notices the {company} placeholder you missed. Reply rates tell you how well that works.',
      withMozart:
        'Give the agent your context and your voice. Drafts come back specific, ready for your edit.',
      status: 'today',
    },
    {
      title: 'Prepared for every conversation',
      without:
        'The role brief, the candidate background, and the scorecard sit in three windows while the other person is already on the call. You improvise the questions, again.',
      withMozart:
        'Drop the files in a workspace. One prep sheet, mapped to your criteria, ready before you join.',
      status: 'today',
    },
  ],
  integrations: ['ATS', 'LinkedIn', 'Email', 'Calendar'],
  faq: [
    {
      question: 'What does Mozart do for recruiting today?',
      answer:
        'Mozart runs AI agents on your local files: exports, role documents, notes, templates. Agents read them, produce structured summaries and drafts, and you review everything before it goes anywhere. It covers the document side of recruiting: the reading, the writing, and the keeping things tidy.',
    },
    {
      question: 'Which recruiting files work best?',
      answer:
        'Pipeline exports as CSV, role descriptions, intake notes, scorecards, and notes from hiring-manager syncs. Agents read whatever you put in the workspace and turn it into summaries, comparisons, drafts, and reports. No special format needed: folders of plain files are enough for an agent to work with.',
    },
    {
      question: 'Does Mozart connect to my ATS?',
      answer:
        'ATS, email, and calendar integrations are on our roadmap. Today agents work with files you export from those tools: pipeline exports, role docs, notes, templates.',
    },
    {
      question: 'Is this GDPR-friendly?',
      answer:
        "Mozart's local-first design means candidate files stay on your device and are processed with the LLM credentials you choose. You keep control of what any model sees, which is a much stronger starting point than uploading candidate data to a third-party service.",
    },
    {
      question: 'Will AI decide who gets hired?',
      answer:
        'No. Mozart is built around human review. Agents draft, compare, and summarize, and you see every output before it goes anywhere. Hiring judgment stays with you.',
    },
  ],
};
