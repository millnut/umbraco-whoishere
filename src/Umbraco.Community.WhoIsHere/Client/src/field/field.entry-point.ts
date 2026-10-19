import { debounceTime, distinctUntilChanged, map, type Subscription } from '@umbraco-cms/backoffice/external/rxjs';
import type { UmbEntryPointOnInit, UmbEntryPointOnUnload } from '@umbraco-cms/backoffice/extension-api';

const FIELD_CONTEXT_ALIAS = 'WhoIsHere.PropertyContext.Field';

let subscription: Subscription | undefined;

/**
 * Registers the field highlighter for every property editor.
 *
 * A propertyContext manifest only applies to the property editor UIs it lists by alias; there is no wildcard.
 * So this follows the registry and re-registers whenever the set of property editors changes, which covers
 * editors from other packages too.
 */
export const onInit: UmbEntryPointOnInit = (_host, extensionRegistry) => {
	subscription?.unsubscribe();
	subscription = extensionRegistry
		.byType('propertyEditorUi')
		.pipe(
			map((manifests) => manifests.map((manifest) => manifest.alias).sort()),
			distinctUntilChanged((a, b) => a.join() === b.join()),
			// Editors register in bursts at startup; re-registering after each one would rebuild every field's controller.
			debounceTime(50),
		)
		.subscribe((aliases) => {
			if (extensionRegistry.isRegistered(FIELD_CONTEXT_ALIAS)) extensionRegistry.unregister(FIELD_CONTEXT_ALIAS);
			const manifest: UmbExtensionManifest = {
				type: 'propertyContext',
				alias: FIELD_CONTEXT_ALIAS,
				name: 'WhoIsHere Field Property Context',
				forPropertyEditorUis: aliases,
				api: () => import('./field.property-context.js'),
				meta: {},
			};
			extensionRegistry.register(manifest);
		});
};

export const onUnload: UmbEntryPointOnUnload = (_host, extensionRegistry) => {
	subscription?.unsubscribe();
	subscription = undefined;
	if (extensionRegistry.isRegistered(FIELD_CONTEXT_ALIAS)) extensionRegistry.unregister(FIELD_CONTEXT_ALIAS);
};
