import type { WhoIsHerePresenceUser } from '../types.js';
import { WHOISHERE_PRESENCE_WORKSPACE_CONTEXT } from './presence.workspace-context-token.js';
import { css, customElement, html, nothing, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

// Past this many the avatars start crowding the breadcrumb out of the footer; the rest show as "+N".
const VISIBLE_AVATARS = 3;
const POPOVER_ID = 'whoishere-editors';

/**
 * Shows, in the document workspace footer, who else has this document open.
 */
@customElement('whoishere-presence-indicator')
export class WhoIsHerePresenceIndicatorElement extends UmbLitElement {
	@state()
	private _editors: Array<WhoIsHerePresenceUser> = [];

	constructor() {
		super();
		this.consumeContext(WHOISHERE_PRESENCE_WORKSPACE_CONTEXT, (context) => {
			this.observe(context?.editors, (editors) => (this._editors = editors ?? []), '_observeEditors');
		});
	}

	override render() {
		if (this._editors.length === 0) return nothing;

		// Names only: the footer is shared with the breadcrumb, so where each person is goes in the popover.
		const summary = this.localize.term('whoIsHere_alsoEditing', this.localize.list(this._editors.map((e) => e.name)));

		// One button rather than a focus stop per avatar: a single tab stop opens the full list, and screen readers
		// get the whole summary in its label.
		return html`
			<uui-button compact look="placeholder" label=${summary} popovertarget=${POPOVER_ID}>
				<uui-avatar-group limit=${VISIBLE_AVATARS} aria-hidden="true">
					${repeat(
						this._editors,
						(editor) => editor.userKey,
						(editor) => this.#renderAvatar(editor),
					)}
				</uui-avatar-group>
				<span id="summary" aria-hidden="true">${summary}</span>
			</uui-button>
			<uui-popover-container id=${POPOVER_ID} popover placement="top-start">
				<umb-popover-layout>
					<ul aria-label=${this.localize.term('whoIsHere_editorsListLabel')}>
						${repeat(
							this._editors,
							(editor) => editor.userKey,
							(editor) => this.#renderListItem(editor),
						)}
					</ul>
				</umb-popover-layout>
			</uui-popover-container>
		`;
	}

	#renderListItem(editor: WhoIsHerePresenceUser) {
		const field = editor.location?.labels.join(' › ');
		return html`<li>
			${this.#renderAvatar(editor)}
			<div>
				<div class="name">${editor.name}</div>
				${field ? html`<div class="field">${field}</div>` : nothing}
			</div>
		</li>`;
	}

	#renderAvatar(editor: WhoIsHerePresenceUser) {
		// The colour rings photos too, so the same person reads the same way whether or not they have one.
		return html`<uui-avatar
			name=${editor.name}
			title=${editor.name}
			img-src=${editor.avatarUrl ?? ''}
			style="--whoishere-color: ${editor.color}"></uui-avatar>`;
	}

	static override styles = [
		css`
			:host {
				display: flex;
				align-items: center;
				margin-inline-start: var(--uui-size-space-4);
			}

			uui-button {
				--uui-button-padding-left-factor: 1;
				--uui-button-padding-right-factor: 2;
			}

			uui-button > * {
				pointer-events: none;
			}

			uui-avatar-group {
				font-size: 0.75rem;
			}

			uui-avatar {
				background-color: var(--whoishere-color);
				color: #fff;
				box-shadow: 0 0 0 2px var(--whoishere-color);
			}

			#summary {
				margin-inline-start: var(--uui-size-space-3);
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
				max-width: 24em;
			}

			ul {
				list-style: none;
				margin: 0;
				padding: var(--uui-size-space-3);
				display: grid;
				gap: var(--uui-size-space-3);
			}

			li {
				display: flex;
				align-items: center;
				gap: var(--uui-size-space-3);
				font-size: 0.875rem;
			}

			li uui-avatar {
				flex: none;
				font-size: 0.75rem;
			}

			.field {
				color: var(--uui-color-text-alt);
				font-size: var(--uui-type-small-size);
			}
		`,
	];
}

export { WhoIsHerePresenceIndicatorElement as element };

declare global {
	interface HTMLElementTagNameMap {
		'whoishere-presence-indicator': WhoIsHerePresenceIndicatorElement;
	}
}
