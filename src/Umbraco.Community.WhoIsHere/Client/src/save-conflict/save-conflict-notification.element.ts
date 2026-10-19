import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { UmbNotificationDefaultData, UmbNotificationHandler } from '@umbraco-cms/backoffice/notification';

// Extends the default data because the notification API requires it; `message` holds a plain-text version.
export interface WhoIsHereSaveConflictNotificationData extends UmbNotificationDefaultData {
	headline: string;
	/** The saver's name, for the avatar's initials */
	name: string;
	avatarUrl?: string;
	/** The saver's presence colour, when they are (or were) on the document. */
	color?: string;
	onReload: () => void;
}

/**
 * The "someone else saved this" notice. Its own element rather than the default layout: that layout renders the
 * message with `white-space: pre-line`, which turns any template formatting into blank lines.
 */
@customElement('whoishere-save-conflict-notification')
export class WhoIsHereSaveConflictNotificationElement extends UmbLitElement {
	@property({ attribute: false })
	data?: WhoIsHereSaveConflictNotificationData;

	@property({ attribute: false })
	notificationHandler?: UmbNotificationHandler;

	override render() {
		if (!this.data) return;
		const { name, headline, message, avatarUrl, color } = this.data;
		return html`<uui-toast-notification-layout>
			<div slot="headline" id="headline">
				<uui-avatar
					name=${name}
					img-src=${avatarUrl ?? ''}
					class=${color ? 'coloured' : ''}
					style=${color ? `--whoishere-color: ${color}` : ''}
					aria-hidden="true"></uui-avatar>
				<span>${headline}</span>
			</div>
			<p id="message">${message}</p>
			<uui-button
				slot="actions"
				look="primary"
				compact
				label=${this.localize.term('whoIsHere_reload')}
				@click=${this.#reload}></uui-button>
		</uui-toast-notification-layout>`;
	}

	#reload() {
		this.notificationHandler?.close();
		this.data?.onReload();
	}

	static override styles = [
		css`
			#headline {
				display: flex;
				align-items: center;
				gap: var(--uui-size-space-3);
			}

			/* Sits on the toast's dark 'default' background, so the content is styled light. */
			uui-avatar {
				flex: none;
				font-size: 0.7rem;
				box-shadow: 0 0 0 2px #fff;
			}

			/* The presence colour is dark enough for white initials; without one, UUI's default styling applies. */
			uui-avatar.coloured {
				background-color: var(--whoishere-color);
				color: #fff;
			}

			#message {
				margin: var(--uui-size-space-2) 0 0;
				opacity: 0.9;
			}

			uui-button {
				margin-top: var(--uui-size-space-4);
				--uui-button-background-color: var(--uui-color-surface);
				--uui-button-background-color-hover: var(--uui-color-surface-emphasis);
				--uui-button-contrast: var(--uui-color-default);
				--uui-button-contrast-hover: var(--uui-color-default-emphasis);
				--uui-button-padding-left-factor: 3;
				--uui-button-padding-right-factor: 3;
			}
		`,
	];
}

export default WhoIsHereSaveConflictNotificationElement;

declare global {
	interface HTMLElementTagNameMap {
		'whoishere-save-conflict-notification': WhoIsHereSaveConflictNotificationElement;
	}
}
