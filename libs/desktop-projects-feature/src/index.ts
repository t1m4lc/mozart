// Public surface of `desktop-projects-feature`. Smart dialogs and
// filter widgets that inject `ProjectsFacade` / `DIALOG_ADAPTER`.

export {
  CreateProjectDialog,
  type CreateProjectContext,
} from './lib/ui-create-project-dialog';
export {
  CloneRepoDialog,
  type CloneRepoContext,
} from './lib/ui-clone-repo-dialog';
export { GroupByFilter } from './lib/ui-group-by-filter';
