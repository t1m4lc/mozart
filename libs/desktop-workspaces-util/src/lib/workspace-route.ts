// Pure URL builders for the workspaces routes. Lives in util so dumb
// UI components (e.g. `workspace-row`) can build hrefs without needing
// to inject the data-access lib.

export function workspaceRouteCommands(
  projectId: string,
  workspaceId: string,
): string[] {
  return ['/project', projectId, 'workspace', workspaceId];
}

export function workspaceTabRouteCommands(
  projectId: string,
  workspaceId: string,
  tabId: string,
): string[] {
  return ['/project', projectId, 'workspace', workspaceId, 'tab', tabId];
}
