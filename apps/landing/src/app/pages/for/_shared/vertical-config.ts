export type VerticalSlug =
  | 'sales'
  | 'marketing'
  | 'recruiting'
  | 'small-business';

export type FeatureStatus = 'today' | 'vision';

export interface VerticalPain {
  readonly icon: string;
  readonly title: string;
  readonly body: string;
}

export interface VerticalWorkflow {
  readonly title: string;
  readonly without: string;
  readonly withMozart: string;
  readonly status: FeatureStatus;
}

export interface VerticalFutureSkill {
  readonly title: string;
  readonly description: string;
}

export interface VerticalFaqEntry {
  readonly question: string;
  readonly answer: string;
}

export interface VerticalMock {
  readonly windowTitle: string;
  readonly agentTask: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly { readonly file: string; readonly label: string }[];
}

export interface VerticalConfig {
  readonly slug: VerticalSlug;
  readonly jobTitle: string;
  readonly audience: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly keywords: readonly string[];
  readonly heroEyebrow: string;
  readonly heroHeadline: string;
  readonly heroSubcopy: string;
  readonly mock: VerticalMock;
  readonly pains: readonly VerticalPain[];
  readonly workflows: readonly VerticalWorkflow[];
  readonly futureSkills: readonly VerticalFutureSkill[];
  readonly integrations: readonly string[];
  readonly faq: readonly VerticalFaqEntry[];
}
