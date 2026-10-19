import type { WhoIsHerePresenceWorkspaceContext } from './presence.workspace-context.js';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

export const WHOISHERE_PRESENCE_WORKSPACE_CONTEXT = new UmbContextToken<WhoIsHerePresenceWorkspaceContext>(
	'WhoIsHere.WorkspaceContext.Presence',
);
