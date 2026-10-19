import type { WhoIsHereFieldEditor } from '../presence/presence.workspace-context.js';
import { css, customElement, html, nothing, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * The chip under a property's label naming the other editors in that field, or working inside it.
 */
@customElement('whoishere-field-indicator')
export class WhoIsHereFieldIndicatorElement extends UmbLitElement {
	@property({ attribute: false })
	editors: Array<WhoIsHereFieldEditor> = [];

	/** How many labels lead to this field; the rest of an inside editor's labels say where inside it they are. */
	@property({ attribute: false })
	labelDepth = 0;

	override render() {
		if (this.editors.length === 0) return nothing;
		return html`<ul aria-label=${this.localize.term('whoIsHere_fieldEditorsLabel')}>
			${repeat(
				this.editors,
				(editor) => editor.user.userKey,
				(editor) => this.#renderEditor(editor),
			)}
		</ul>`;
	}

	#renderEditor({ user, inside }: WhoIsHereFieldEditor) {
		// For someone inside a block, name where: the labels after this field's own, e.g. "Hero › Heading".
		const where = inside ? (user.location?.labels ?? []).slice(this.labelDepth).join(' › ') : '';
		const text = where
			? this.localize.term('whoIsHere_editingInside', user.name, where)
			: this.localize.term('whoIsHere_editingHere', user.name);

		return html`<li style="--whoishere-color: ${user.color}" class=${inside ? 'inside' : ''} title=${text}>
			<uui-avatar name=${user.name} img-src=${user.avatarUrl ?? ''} aria-hidden="true"></uui-avatar>
			<span>${text}</span>
		</li>`;
	}

	static override styles = [
		css`
			:host {
				display: block;
				margin-top: var(--uui-size-space-2);
			}

			ul {
				list-style: none;
				margin: 0;
				padding: 0;
				display: flex;
				flex-direction: column;
				gap: var(--uui-size-space-1);
			}

			li {
				display: inline-flex;
				align-items: center;
				gap: var(--uui-size-space-2);
				max-width: 100%;
				padding: 2px var(--uui-size-space-3) 2px 2px;
				border-radius: calc(var(--uui-border-radius) * 4);
				background-color: var(--whoishere-color);
				color: #fff;
				font-size: var(--uui-type-small-size);
				line-height: 1.4;
				width: fit-content;
			}

			li.inside {
				background-color: transparent;
				color: var(--uui-color-text);
				box-shadow: inset 0 0 0 1.5px var(--whoishere-color);
			}

			/* The label column is narrow; wrap rather than cut off where in a block the user is. */
			li span {
				overflow-wrap: anywhere;
			}

			uui-avatar {
				font-size: 0.6rem;
				background-color: var(--whoishere-color);
				color: #fff;
				flex: none;
			}
		`,
	];
}

declare global {
	interface HTMLElementTagNameMap {
		'whoishere-field-indicator': WhoIsHereFieldIndicatorElement;
	}
}
