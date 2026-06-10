import type { VerticalConfig } from '../vertical-config';

export const RECRUITING_VERTICAL: VerticalConfig = {
  slug: 'recruiting',
  jobTitle: 'Recruiting',
  audience: 'recruiting teams',
  metaTitle: 'AI Agents for Recruiting Teams | Mozart: Screen and Source Privately',
  metaDescription:
    "Screen a hundred CVs in the time it takes to read ten. Mozart runs AI agents on your candidate files: shortlists, outreach drafts, interview packs, with candidate data never leaving your machine.",
  keywords: [
    'ai candidate screening',
    'ai resume screening tool',
    'private ai recruiting assistant',
    'ai sourcing outreach',
    'recruiting ai without uploading data',
    'ai interview prep',
  ],
  heroEyebrow: 'Mozart for Recruiting',
  heroHeadline: 'Screen a hundred CVs in the time it takes to read ten',
  heroSubcopy:
    "Recruiting is reading and writing at scale, and most of it is manual. Mozart runs AI agents on your candidate files and role docs so you get consistent shortlists and personalized outreach drafts, without uploading a single CV to a third-party tool.",
  mock: {
    windowTitle: 'Recruiting · Senior PM shortlist',
    agentTask: 'Applying role criteria to 12 applications...',
    inputs: [
      'applications/cv-sarah-chen.pdf',
      'applications/cv-marcus-reid.pdf',
      'role/senior-pm-criteria.md',
    ],
    outputs: [
      { file: 'shortlist/ranked-candidates.md', label: 'Review →' },
      { file: 'outreach/sarah-chen-draft.md', label: 'Review →' },
      { file: 'outreach/marcus-reid-draft.md', label: 'Review →' },
    ],
  },
  pains: [
    {
      icon: 'lucideInbox',
      title: "A hundred CVs, four hours, and you're still not done",
      body: 'Skimming resumes honestly takes days. Rushing it means missing good people or advancing the wrong ones, and you know it.',
    },
    {
      icon: 'lucideShield',
      title: "Candidate data is the last thing to upload to a trendy AI tool",
      body: "CVs are personal data. Under GDPR and most privacy frameworks, uploading them to whatever AI service is currently popular is a legal and reputational risk.",
    },
    {
      icon: 'lucideMail',
      title: 'Outreach that sounds like a template gets deleted immediately',
      body: 'Personalizing every message takes time you never have, so templates win by default, and reply rates show it.',
    },
    {
      icon: 'lucideClock',
      title: "Interview prep always happens in the ten minutes before the call",
      body: 'The brief, the CV, the role scorecard. Pulling them into a coherent interview plan is supposed to happen in advance. It never does.',
    },
  ],
  workflows: [
    {
      title: 'From a folder of CVs to a ranked shortlist',
      without:
        'You open resumes one by one, keep a mental tally, and hope your fourth-coffee judgment is as good as your first-of-morning one.',
      withMozart:
        'Point an agent at your applications folder and the role criteria. It produces a structured comparison with a rationale for each candidate. Files never leave your machine, and you review before any decision is made.',
      status: 'today',
    },
    {
      title: 'Outreach that actually references the candidate',
      without:
        "Copy the template, swap the name, hope nobody notices the {company} placeholder you missed.",
      withMozart:
        "Give the agent a candidate's CV and your role pitch. It drafts a personalized message for your review, not a template with a first name bolted on.",
      status: 'today',
    },
    {
      title: 'Interview packs assembled before every call',
      without:
        'You juggle the CV, the job description, and the scorecard in three windows while the candidate is already waiting.',
      withMozart:
        'Drop the CV, job description, and scorecard into a workspace. The agent produces a focused prep sheet with suggested questions mapped to your criteria, ready before the call.',
      status: 'today',
    },
  ],
  futureSkills: [
    {
      title: 'Screening rubric',
      description:
        'Applies your role criteria consistently across every CV and explains each assessment so you can challenge it.',
    },
    {
      title: 'Outreach personalizer',
      description:
        'Drafts candidate-specific messages from your pitch and their background, in your voice.',
    },
    {
      title: 'Interview-pack builder',
      description:
        'Turns CV + job description + scorecard into a focused prep sheet for each interviewer.',
    },
  ],
  integrations: ['ATS', 'LinkedIn', 'Email', 'Calendar'],
  faq: [
    {
      question: 'What does Mozart do for recruiting today?',
      answer:
        'Mozart runs AI agents on your local files: CV exports, role documents, outreach templates. Agents read them, produce structured outputs, and you review everything before it goes anywhere.',
    },
    {
      question: 'Does Mozart connect to my ATS?',
      answer:
        'ATS, email, and calendar integrations are on our roadmap. Today agents work with files you export: CVs, notes, role docs.',
    },
    {
      question: 'Is this GDPR-friendly?',
      answer:
        "Mozart's local-first design means candidate files stay on your device and are processed with the LLM credentials you choose. You keep control of what any model sees, which is a much stronger starting point than uploading CVs to a third-party service.",
    },
    {
      question: 'Will AI decide who gets hired?',
      answer:
        'No. Mozart is built around human review. Agents draft, compare, and summarize, and you see every output before it goes anywhere. Hiring judgment stays with you.',
    },
  ],
};
