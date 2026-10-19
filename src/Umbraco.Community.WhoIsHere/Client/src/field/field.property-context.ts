import { WHOISHERE_PRESENCE_WORKSPACE_CONTEXT } from '../presence/presence.workspace-context-token.js';
import type { WhoIsHereFieldEditor } from '../presence/presence.workspace-context.js';
import type { WhoIsHereLocation } from '../types.js';
import { WHOISHERE_FIELD_CONTEXT } from './field.context-token.js';
import type { WhoIsHereFieldIndicatorElement } from './field-indicator.element.js';
import './field-indicator.element.js';
import { UMB_BLOCK_ENTRY_CONTEXT, UMB_BLOCK_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/block';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/document';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { UMB_PROPERTY_CONTEXT, UMB_PROPERTY_DATASET_CONTEXT } from '@umbraco-cms/backoffice/property';

/**
 * Attached to every property (`umb-property`) in the backoffice. In a document, it reports when this user focuses
 * the field and highlights the field when other editors are in it, or working somewhere inside it.
 *
 * Each field provides itself to the fields nested inside it (block properties, inline or in a block modal), which
 * is how a nested field learns its full path and how a block list knows someone is inside one of its blocks.
 */
export class WhoIsHereFieldContext extends UmbContextBase {
	#localize = new UmbLocalizationController(this);
	#hostElement: HTMLElement;

	#parent?: WhoIsHereFieldContext;
	#presence?: typeof WHOISHERE_PRESENCE_WORKSPACE_CONTEXT.TYPE;
	#property?: typeof UMB_PROPERTY_CONTEXT.TYPE;
	#dataset?: typeof UMB_PROPERTY_DATASET_CONTEXT.TYPE;
	#blockEntry?: typeof UMB_BLOCK_ENTRY_CONTEXT.TYPE;
	#blockWorkspace?: typeof UMB_BLOCK_WORKSPACE_CONTEXT.TYPE;
	// getName() on the block workspace returns '' in v18; only the observable carries the title.
	#blockWorkspaceTitle?: string;

	#documentWorkspace?: typeof UMB_DOCUMENT_WORKSPACE_CONTEXT.TYPE;
	// The tab (or, on a document type without tabs, the group) this field sits in. Only used for top-level fields:
	// a field inside a block is placed by the block list that holds it.
	#section?: string;
	#observedFieldId?: string;
	#indicator?: WhoIsHereFieldIndicatorElement;

	constructor(host: UmbControllerHost) {
		super(host, WHOISHERE_FIELD_CONTEXT);
		this.#hostElement = this.getHostElement() as HTMLElement;

		// skipHost: this field provides the same context on the same element, and wants the one above it.
		this.consumeContext(WHOISHERE_FIELD_CONTEXT, (context) => (this.#parent = context)).skipHost();
		this.consumeContext(UMB_PROPERTY_CONTEXT, (context) => {
			this.#property = context;
			// The alias and variant are set on the property after it is created, and both are part of the id.
			this.observe(
				context?.alias,
				() => {
					this.#observeEditors();
					this.#resolveSection();
				},
				'_whoIsHereAlias',
			);
			this.observe(context?.variantId, () => this.#observeEditors(), '_whoIsHereVariantId');
		});
		// For a block's property, the label editors see (e.g. "Blog Articles") comes from the block entry when the
		// block is edited inline, or from the block workspace when it is open in a modal.
		this.consumeContext(UMB_BLOCK_ENTRY_CONTEXT, (context) => (this.#blockEntry = context));
		this.consumeContext(UMB_BLOCK_WORKSPACE_CONTEXT, (context) => {
			this.#blockWorkspace = context;
			this.observe(context?.name, (name) => (this.#blockWorkspaceTitle = name), '_whoIsHereBlockTitle');
		});
		this.consumeContext(UMB_PROPERTY_DATASET_CONTEXT, (context) => {
			this.#dataset = context;
			this.#observeEditors();
		});
		this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, (context) => {
			this.#documentWorkspace = context;
			this.#resolveSection();
		});
		// Only document workspaces have this, so fields elsewhere (media, settings, ...) stay inert.
		this.consumeContext(WHOISHERE_PRESENCE_WORKSPACE_CONTEXT, (context) => {
			this.#presence = context;
			this.#observeEditors();
		});

		this.#hostElement.addEventListener('focusin', this.#onFocusIn);
		this.#hostElement.addEventListener('focusout', this.#onFocusOut);
	}

	/**
	 * Identifies this field the same way on every client: the owning document or block key (globally unique), the
	 * property alias and the variant. Undefined until the property has loaded.
	 */
	getFieldId(): string | undefined {
		const owner = this.#dataset?.getUnique();
		const alias = this.#property?.getAlias();
		if (!owner || !alias) return undefined;
		return `${owner}/${alias}/${this.#property?.getVariantId()?.toString() ?? 'invariant'}`;
	}

	/** This field's id and those of the fields around it, outermost first. */
	getPath(): Array<string> {
		const id = this.getFieldId();
		return [...(this.#parent?.getPath() ?? []), ...(id ? [id] : [])];
	}

	/**
	 * Labels from the tab down to this field, with block names in between where there are any,
	 * e.g. ["Hero", "Title"] or ["Content", "Content Rows", "Blog Articles", "Page Size"].
	 */
	getLabels(): Array<string> {
		if (!this.#parent) return [...(this.#section ? [this.#section] : []), this.#label()];
		const blockName = this.#blockLabel();
		return [...this.#parent.getLabels(), ...(blockName ? [blockName] : []), this.#label()];
	}

	#blockLabel() {
		// Each source is only trusted if it is this field's block, checked by key; failing both, the dataset's name
		// (for a block, its element type's name) still says roughly where the user is.
		const owner = this.#dataset?.getUnique();
		if (owner && this.#blockEntry?.getContentKey() === owner) return this.#blockEntry.getLabel().trim();

		const workspace = this.#blockWorkspace;
		if (owner && workspace && [workspace.content.getUnique(), workspace.settings?.getUnique()].includes(owner)) {
			const label = this.#stripWorkspaceTitlePrefix(this.#blockWorkspaceTitle);
			if (label) return label;
		}
		return this.#dataset?.getName()?.trim();
	}

	// The block workspace's name is its modal title, "#general_edit <label>" or "#general_add <label>". There is no
	// public accessor for the label alone.
	#stripWorkspaceTitlePrefix(title: string | undefined) {
		const localized = this.#localize.string(title ?? '').trim();
		for (const key of ['#general_edit', '#general_add']) {
			const prefix = this.#localize.string(key);
			if (localized.startsWith(`${prefix} `)) return localized.slice(prefix.length).trim();
		}
		return undefined;
	}

	async #resolveSection() {
		const alias = this.#property?.getAlias();
		const structure = this.#documentWorkspace?.structure;
		if (!alias || !structure) return;

		const containerId = (await structure.getPropertyStructureByAlias(alias))?.container?.id;
		const containers = containerId ? structure.getContentTypeOfContainer(containerId)?.containers : undefined;
		const container = containers?.find((c) => c.id === containerId);
		if (!container) {
			this.#section = undefined;
			return;
		}

		// A property sits in a group, which usually sits in a tab; properties can also sit on a tab directly.
		const tab =
			container.type === 'Tab' ? container : containers?.find((c) => c.id === container.parent?.id && c.type === 'Tab');
		this.#section = this.#localize.string((tab ?? container).name) || undefined;
	}

	#label() {
		// Labels can be localization keys such as "#general_name".
		return this.#localize.string(this.#property?.getLabel() ?? this.#property?.getAlias() ?? '');
	}

	#location(): WhoIsHereLocation | undefined {
		const fieldId = this.getFieldId();
		if (!fieldId) return undefined;
		return { fieldId, ancestorIds: this.#parent?.getPath() ?? [], labels: this.getLabels() };
	}

	// Focus events bubble through every field around the focused one; only the innermost should report.
	#isInnermost(event: FocusEvent) {
		const innermost = event.composedPath().find((node) => node instanceof HTMLElement && node.localName === 'umb-property');
		return innermost === this.#hostElement;
	}

	#onFocusIn = (event: FocusEvent) => {
		if (!this.#presence || !this.#isInnermost(event)) return;
		const location = this.#location();
		if (location) this.#presence.enterField(location);
	};

	#onFocusOut = (event: FocusEvent) => {
		if (!this.#presence || !this.#isInnermost(event)) return;
		const fieldId = this.getFieldId();
		if (fieldId) this.#presence.leaveField(fieldId);
	};

	#observeEditors() {
		const fieldId = this.getFieldId();
		if (!this.#presence || !fieldId || fieldId === this.#observedFieldId) return;
		this.#observedFieldId = fieldId;
		this.observe(this.#presence.fieldEditors(fieldId), (editors) => this.#render(editors ?? []), '_whoIsHereFieldEditors');
	}

	// Umbraco has no extension point for decorating a property, so this adds a chip to the property's label
	// column, a plain DOM addition that Umbraco's rendering leaves alone.
	async #render(editors: Array<WhoIsHereFieldEditor>) {
		if (editors.length === 0) {
			this.#indicator?.remove();
			return;
		}

		if (!this.#indicator) {
			this.#indicator = document.createElement('whoishere-field-indicator');
			this.#indicator.slot = 'description';
		}
		this.#indicator.editors = editors;
		this.#indicator.labelDepth = this.getLabels().length;

		if (!this.#indicator.isConnected) {
			await (this.#hostElement as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete;
			// umb-property renders an umb-property-layout whose "description" slot sits under the label.
			this.#hostElement.shadowRoot?.querySelector('umb-property-layout')?.appendChild(this.#indicator);
		}
	}

	override destroy() {
		this.#hostElement.removeEventListener('focusin', this.#onFocusIn);
		this.#hostElement.removeEventListener('focusout', this.#onFocusOut);
		this.#indicator?.remove();
		// Leaving the page while in this field must not leave it highlighted for others.
		const fieldId = this.getFieldId();
		if (fieldId) this.#presence?.leaveField(fieldId);
		super.destroy();
	}
}

export { WhoIsHereFieldContext as api };
