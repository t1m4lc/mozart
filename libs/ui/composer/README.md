# composer

Mozart message composer. Dumb, presentation-only component composed
from `libs/ui` primitives (textarea, button, dropdown-menu,
toggle-group, kbd, tooltip).

Public surface :

```ts
import { HlmComposer, type ChatMode, type EffortLevel, type ComposerSendEvent } from '@mozart/ui/composer';
```

See `libs/ui/composer/src/lib/hlm-composer.ts` for the signal-based
input / output contract.
