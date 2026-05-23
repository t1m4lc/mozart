// Remaining surface of the in-app `repositories` shim. The bulk of
// the domain now lives in `@mozart/desktop-repositories-{util,
// data-access,ui,feature}` libs; only the Tauri-coupled Create PR
// dialog stays here until the workspaces lib carries its own bridge.

export {
  FeatureCreatePrDialog,
  type CreatePrDialogContext,
} from './feature-create-pr-dialog';
