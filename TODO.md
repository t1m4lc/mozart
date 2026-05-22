# TODO

## Signals cleanup

- [ ] Restructure `OnboardingFacade` and `WorkspaceDetailStore` to expose
      reactive "bind-from-signal" APIs so the 3 remaining mirror `effect()`s
      can be removed. Sites:
      - `apps/desktop/src/app/domains/onboarding/feature-onboarding-step-github.ts` (markStep mirror)
      - `apps/desktop/src/app/domains/onboarding/feature-onboarding-step-provider.ts` (markStep mirror)
      - `apps/desktop/src/app/domains/workspaces/feature-detail/workspace-detail.page.ts` (setCurrentBranch + seedTargetBranch mirror)

      Blocked by: `markStep` / `setCurrentBranch` / `seedTargetBranch` also have
      imperative callers (skip buttons, branch pickers), so the refactor needs
      to add a parallel `bindStepSource(step, Signal<Status>)` /
      `bindWorkspace(Signal<Workspace>)` API on each store before the effects
      can go.
