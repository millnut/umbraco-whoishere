import { UMB_DOCUMENT_WORKSPACE_ALIAS } from '@umbraco-cms/backoffice/document';
import { UMB_WORKSPACE_CONDITION_ALIAS } from '@umbraco-cms/backoffice/workspace';

const documentWorkspace: UmbExtensionConditionConfig = {
	alias: UMB_WORKSPACE_CONDITION_ALIAS,
	match: UMB_DOCUMENT_WORKSPACE_ALIAS,
};

export const manifests: Array<UmbExtensionManifest> = [
	{
		type: 'globalContext',
		alias: 'WhoIsHere.GlobalContext.Connection',
		name: 'WhoIsHere Connection Global Context',
		api: () => import('./connection/connection.context.js'),
	},
	{
		type: 'workspaceContext',
		alias: 'WhoIsHere.WorkspaceContext.Presence',
		name: 'WhoIsHere Presence Workspace Context',
		api: () => import('./presence/presence.workspace-context.js'),
		conditions: [documentWorkspace],
	},
	{
		type: 'workspaceContext',
		alias: 'WhoIsHere.WorkspaceContext.SaveConflict',
		name: 'WhoIsHere Save Conflict Workspace Context',
		api: () => import('./save-conflict/save-conflict.workspace-context.js'),
		conditions: [documentWorkspace],
	},
	{
		type: 'workspaceFooterApp',
		alias: 'WhoIsHere.WorkspaceFooterApp.Presence',
		name: 'WhoIsHere Presence Workspace Footer App',
		element: () => import('./presence/presence-indicator.element.js'),
		// After the breadcrumb, so the indicator sits next to where the editor already looks for context.
		weight: -100,
		conditions: [documentWorkspace],
	},
	{
		type: 'backofficeEntryPoint',
		alias: 'WhoIsHere.EntryPoint.Fields',
		name: 'WhoIsHere Fields Entry Point',
		js: () => import('./field/field.entry-point.js'),
	},
	{
		type: 'localization',
		alias: 'WhoIsHere.Localization.En',
		name: 'WhoIsHere English',
		meta: { culture: 'en' },
		js: () => import('./lang/en.js'),
	},
];
