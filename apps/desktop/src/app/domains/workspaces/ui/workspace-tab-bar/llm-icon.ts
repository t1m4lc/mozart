import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMessageSquare } from '@ng-icons/lucide';

// Maps llmId → icon name. Only `claude` is mapped for now; everything else
// falls back to the neutral chat bubble used for fresh / unidentified chats.
// TODO: extend with real provider icons (OpenAI, Gemini, etc.) once we
// support multiple LLMs.
const LLM_ICON_MAP: Readonly<Record<string, string>> = {
  claude: 'lucideMessageSquare',
};

@Component({
  selector: 'app-llm-icon',
  imports: [NgIcon, HlmIconImports],
  providers: [provideIcons({ lucideMessageSquare })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    <ng-icon hlm [name]="iconName()" size="xs" class="text-muted-foreground" />
  `,
})
export class LlmIcon {
  readonly llmId = input<string | null>(null);

  protected readonly iconName = computed(() => {
    const id = this.llmId();
    return (id && LLM_ICON_MAP[id]) || 'lucideMessageSquare';
  });
}
