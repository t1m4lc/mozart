import type { VerticalConfig } from '../vertical-config';

export const MARKETING_VERTICAL: VerticalConfig = {
  slug: 'marketing',
  jobTitle: 'Marketing',
  audience: 'marketing teams',
  metaTitle: 'Mozart for Marketing | AI Agents in Your Files, Not a Chat',
  metaDescription:
    'Mozart runs AI agents that create and edit your marketing files with your brand context at hand, on your computer. No copy-paste between ten tools.',
  keywords: [
    'ai agents for marketing',
    'ai content repurposing tool',
    'ai marketing workflow',
    'local ai writing assistant',
    'ai brief to draft',
    'stop copy pasting from chatgpt',
  ],
  heroEyebrow: 'Mozart for Marketing',
  heroHeadline: 'AI that works in your files, not in a chat tab',
  heroSubcopy:
    "Briefs, drafts, plans, assets: your marketing lives in files, and AI chat tools can't touch them. Mozart is a desktop app where AI agents create, edit, and reorganize that work directly, with your voice guide and templates always in reach. Brief an agent once. Review what it makes. Ship.",
  mock: {
    windowTitle: 'Marketing · Q3 campaign',
    agentTask: 'Drafting campaign assets from your brief...',
    inputs: [
      'campaign/q3-brief.md',
      'brand/voice-guide.md',
      'past/q2-launch-recap.md',
    ],
    outputs: [
      { file: 'drafts/landing-copy.md', label: 'Review →' },
      { file: 'drafts/email-sequence.md', label: 'Review →' },
      { file: 'review/consistency-report.md', label: 'Review →' },
    ],
  },
  pains: [
    {
      icon: 'lucideClipboard',
      title: 'ChatGPT forgets your brand by lunchtime',
      body: 'You paste the style guide, the positioning doc, and three examples into a chat. Then the next day you do it all over again. The context never sticks to your actual content.',
    },
    {
      icon: 'lucideLayers',
      title: "Ten tools, and you're the integration",
      body: 'Docs here, assets there, the calendar in a third place. Every piece of work means ferrying context between tools by hand. The handoffs are where the afternoon goes.',
    },
    {
      icon: 'lucideShield',
      title: "Unreleased campaigns don't belong in a cloud chat",
      body: "Launch plans, embargoed announcements, pricing pages in progress. Feeding them to a chatbot you don't control is a leak waiting to happen.",
    },
    {
      icon: 'lucideFiles',
      title: 'The output is never where the work is',
      body: 'Even when AI writes something good, it lands in a chat window. You still copy it out, reformat it, and file it where it actually belongs. Multiply that by every asset in a campaign.',
    },
  ],
  workflows: [
    {
      title: 'Brief to draft, in your formats',
      without:
        'The brief sits in one doc, the draft starts on a blank page, and the style guide is open in a third tab nobody actually consults. By review round three the draft has drifted from the brief, and someone asks which version is current.',
      withMozart:
        'Give the agent the brief. The draft arrives structured to your template, with claims flagged for sourcing.',
      status: 'today',
    },
    {
      title: 'One piece of work becomes many',
      without:
        'Turning a webinar into a blog post, a newsletter, and ten social snippets means an afternoon of pasting between tools, fixing formatting, and reassembling outputs scattered across docs.',
      withMozart:
        'Ask once. The agent fans the source out into your channel formats as real files.',
      status: 'today',
    },
    {
      title: 'Consistency checks across a whole folder',
      without:
        'Someone proofreads ten assets the night before launch, hunting stale dates, old product names, and claims that quietly changed, all by eye, at eleven pm.',
      withMozart:
        'Point the agent at the folder. It reports every inconsistency before you publish.',
      status: 'today',
    },
  ],
  integrations: ['CMS', 'Google Drive', 'Notion', 'Figma', 'Social schedulers'],
  faq: [
    {
      question: 'How is this different from ChatGPT?',
      answer:
        'Mozart agents work directly on your files in a workspace on your machine, instead of in a chat window you copy-paste from. You see every proposed change as a reviewable diff, and the drafts land in your folders, already in the right format. Your templates stay your templates.',
    },
    {
      question: 'How do agents follow our brand voice?',
      answer:
        'Keep your voice guide, positioning doc, and a few strong examples in the workspace. Agents use them on every task, so the voice lives with your files instead of being re-pasted into a chat each morning.',
    },
    {
      question: 'Can Mozart publish to my CMS?',
      answer:
        'CMS and scheduling integrations are on our roadmap. Today agents produce and edit files locally. Publishing stays a deliberate, human step.',
    },
    {
      question: 'Will it keep our unreleased campaigns private?',
      answer:
        'Your files never leave your machine through Mozart. Agents use the LLM provider credentials you choose, and you control what context they see.',
    },
    {
      question: 'Can I use it today without being technical?',
      answer:
        'Today Mozart is a developer preview that leans technical. A marketer-friendly experience with ready-made skills and templates is what the waitlist is for.',
    },
  ],
};
