import { inject } from '@angular/core';
import {
  Router,
  type CanActivateFn,
  type UrlMatcher,
  type UrlSegment,
} from '@angular/router';
import { WorkspaceTabResolver } from '../data/workspace-tab-resolver.service';
import { workspaceTabRouteCommands } from '../data/workspace-tab-registry';

const TAB_PATH_SEGMENT = 'tab';

/**
 * Matches `tab/:tabId`. Validation of the tabId payload (kind prefix,
 * base64 decode, opaque-id allowlist, traversal guards) lives in
 * `WorkspaceTabRegistry.parse()` and is enforced by
 * `workspaceTabCanActivate` below — keeping all tab-shape knowledge in
 * one place.
 */
export const tabMatcher: UrlMatcher = (segments: UrlSegment[]) => {
  if (segments.length !== 2) return null;
  if (segments[0]?.path !== TAB_PATH_SEGMENT) return null;
  const tabIdSegment = segments[1];
  if (!tabIdSegment?.path) return null;
  return {
    consumed: segments,
    posParams: { tabId: tabIdSegment },
  };
};

export const workspaceTabCanActivate: CanActivateFn = async (route) => {
  const parent = route.parent;
  const projectId = parent?.paramMap.get('projectId');
  const workspaceId = parent?.paramMap.get('workspaceId');
  const tabId = route.paramMap.get('tabId');

  if (!projectId || !workspaceId) {
    return inject(Router).createUrlTree(['/']);
  }

  const resolver = inject(WorkspaceTabResolver);
  const result = await resolver.resolve({
    projectId,
    workspaceId,
    tabId,
  });

  if (result.kind === 'resolved') return true;
  if (result.kind === 'redirect') {
    return inject(Router).createUrlTree(
      workspaceTabRouteCommands(projectId, workspaceId, result.tabId),
    );
  }
  return inject(Router).createUrlTree(['/']);
};
