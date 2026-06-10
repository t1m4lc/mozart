import type { VerticalConfig } from '../vertical-config';

export const MARKETING_VERTICAL: VerticalConfig = {
  slug: 'marketing',
  jobTitle: 'Marketing',
  audience: 'marketing teams',
  metaTitle: 'AI Agents for Marketing Teams | Mozart: Private AI Workspace',
  metaDescription:
    'Turn one asset into ten without the copy-paste afternoon. Mozart runs AI agents on your content files: drafts, repurposing, and campaign checks, with unreleased work staying off the cloud.',
  keywords: [
    'ai agents for marketing',
    'ai content repurposing tool',
    'ai marketing workflow',
    'local ai writing assistant',
    'ai brief to draft',
    'stop copy pasting from chatgpt',
  ],
  heroEyebrow: 'Mozart for Marketing',
  heroHeadline: 'One asset into ten, without the copy-paste afternoon',
  heroSubcopy:
    "Briefs, drafts, repurposing, launch checklists. Your campaign work lives in files. Mozart runs AI agents on those files so you go from one webinar to a blog post, newsletter, and ten social snippets without spending the afternoon on it.",
  mock: {
    windowTitle: 'Marketing · Webinar repurpose',
    agentTask: 'Repurposing webinar transcript...',
    inputs: [
      'assets/product-launch-webinar.txt',
      'brand/voice-guide.md',
      'templates/blog-template.md',
    ],
    outputs: [
      { file: 'content/blog-post-draft.md', label: 'Review →' },
      { file: 'content/newsletter-draft.md', label: 'Review →' },
      { file: 'content/social-snippets.md', label: 'Review →' },
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
      title: 'Repurposing is a full afternoon of copy-paste',
      body: 'One webinar should become a blog post, a newsletter, and ten social posts. Instead it becomes three hours of copy-paste and reformatting between tools.',
    },
    {
      icon: 'lucideShield',
      title: "Unreleased campaigns don't belong in a cloud chat",
      body: "Launch plans, embargoed announcements, pricing pages in progress. Feeding them to a chatbot you don't control is a leak waiting to happen.",
    },
    {
      icon: 'lucideTerminal',
      title: 'Agent tools that actually work are built for engineers',
      body: 'The AI tools that can really edit and produce files ship as terminal programs. Marketers should get the same leverage without learning the command line.',
    },
  ],
  workflows: [
    {
      title: 'From one asset to a full content batch',
      without:
        'You paste the webinar transcript into a chatbot section by section, then manually reassemble the outputs into drafts scattered across docs.',
      withMozart:
        'Point an agent at the transcript in your content folder, along with your style guide and templates. It produces the blog post, newsletter, and social snippets as real files, each one a reviewable diff.',
      status: 'today',
    },
    {
      title: 'Brief to structured first draft',
      without:
        'The brief sits in one doc, the draft starts from a blank page, and the two drift apart by review round three.',
      withMozart:
        'Give the agent your brief and your template. It produces a structured first draft with claims that need sourcing flagged for review, so you edit rather than fill from scratch.',
      status: 'today',
    },
    {
      title: 'Launch folder consistency check',
      without:
        "Someone proofreads ten assets the night before launch, hunting stale dates, old product names, and broken copy by eye.",
      withMozart:
        'Before anything ships, point an agent at your launch folder. It sweeps every file for inconsistencies: naming, dates, claims that changed, and surfaces a report before you hit publish.',
      status: 'today',
    },
  ],
  futureSkills: [
    {
      title: 'Repurposing pipeline',
      description:
        'Fans one source asset out into your standard channel formats, following your templates.',
    },
    {
      title: 'Brand-voice guardian',
      description:
        'Checks drafts against your style guide and positioning doc, suggesting edits instead of rewriting blindly.',
    },
    {
      title: 'Campaign checklist runner',
      description:
        'Walks a launch folder against your pre-flight checklist and reports what is missing or inconsistent.',
    },
  ],
  integrations: ['CMS', 'Google Drive', 'Notion', 'Figma', 'Social schedulers'],
  faq: [
    {
      question: 'How is this different from ChatGPT?',
      answer:
        'Mozart agents work directly on your files in a workspace on your machine, instead of in a chat window you copy-paste from. You see every proposed change as a reviewable diff. Your templates stay your templates.',
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
        "Today Mozart is a developer preview that leans technical. A marketer-friendly experience with ready-made skills and templates is what the waitlist is for.",
    },
  ],
};
