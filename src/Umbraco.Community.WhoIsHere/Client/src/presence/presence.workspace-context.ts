import { WHOISHERE_CONNECTION_CONTEXT } from '../connection/connection.context-token.js';
import type { WhoIsHereLocation, WhoIsHerePresenceUser } from '../types.js';
import { WHOISHERE_PRESENCE_WORKSPACE_CONTEXT } from './presence.workspace-context-token.js';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/document';
import { combineLatest } from '@umbraco-cms/backoffice/external/rxjs';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';

// Leaving a field for a moment (a toolbar, a picker dialog, a click on the page) should not flicker the highlight
// off and on for everyone else.
const LEAVE_FIELD_DELAY_MS = 2000;

/** Another editor's relation to one field: in it, or somewhere inside it (such as a block in a block list). */
export interface WhoIsHereFieldEditor {
	user: WhoIsHerePresenceUser;
	inside: boolean;
}

/**
 * Presence for one open document workspace: registers this tab on the document and exposes the other editors.
 */
export class WhoIsHerePresenceWorkspaceContext extends UmbContextBase {
	#editors = new UmbArrayState<WhoIsHerePresenceUser>([], (user) => user.userKey);

	/** Everyone else with this document open. The current user is left out, however many tabs they have. */
	readonly editors = this.#editors.asObservable();

	#connection?: typeof WHOISHERE_CONNECTION_CONTEXT.TYPE;
	// The connection the current document was joined through, so leaving reaches the same one.
	#joinedWith?: typeof WHOISHERE_CONNECTION_CONTEXT.TYPE;
	#documentKey?: string;
	#currentUserKey?: string;
	#location: WhoIsHereLocation | null = null;
	#leaveFieldTimer?: number;

	constructor(host: UmbControllerHost) {
		super(host, WHOISHERE_PRESENCE_WORKSPACE_CONTEXT);

		this.consumeContext(UMB_CURRENT_USER_CONTEXT, (context) => {
			this.observe(context?.unique, (unique) => {
				this.#currentUserKey = unique;
				this.#observePresence();
			});
		});

		this.consumeContext(WHOISHERE_CONNECTION_CONTEXT, (context) => {
			this.#connection = context;
			this.#setDocument(this.#documentKey);
		});

		this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, (context) => {
			if (!context) return;
			// The workspace is reused when navigating between documents, so follow the unique rather than reading it once.
			// A document being created does not exist on the server yet, so there is nothing to be present on.
			this.observe(
				combineLatest([context.unique, context.isNew]),
				([unique, isNew]) => this.#setDocument(unique && isNew === false ? unique : undefined),
				'_whoIsHereDocument',
			);
		});
	}

	getDocumentKey() {
		return this.#documentKey;
	}

	getEditors() {
		return this.#editors.getValue();
	}

	/** The other editors in a field, or inside it, in arrival order. */
	fieldEditors(fieldId: string) {
		return this.#editors.asObservablePart((editors) =>
			editors.flatMap((user): Array<WhoIsHereFieldEditor> => {
				if (user.location?.fieldId === fieldId) return [{ user, inside: false }];
				if (user.location?.ancestorIds.includes(fieldId)) return [{ user, inside: true }];
				return [];
			}),
		);
	}

	/** Called when focus lands in a field of this document, including fields of blocks opened in a modal. */
	enterField(location: WhoIsHereLocation) {
		window.clearTimeout(this.#leaveFieldTimer);
		if (this.#location?.fieldId === location.fieldId) return;
		this.#setLocation(location);
	}

	/** Called when focus leaves a field. The highlight lingers briefly in case focus comes straight back. */
	leaveField(fieldId: string) {
		if (this.#location?.fieldId !== fieldId) return;
		window.clearTimeout(this.#leaveFieldTimer);
		this.#leaveFieldTimer = window.setTimeout(() => {
			// Switching to another window or app moves focus too, but the user has not left the field. Check again
			// later: coming back into the field cancels this, coming back anywhere else clears it.
			if (!document.hasFocus()) return this.leaveField(fieldId);
			if (this.#location?.fieldId === fieldId) this.#setLocation(null);
		}, LEAVE_FIELD_DELAY_MS);
	}

	#setLocation(location: WhoIsHereLocation | null) {
		this.#location = location;
		if (this.#documentKey && this.#joinedWith) this.#joinedWith.setLocation(this.#documentKey, location);
	}

	#setDocument(documentKey: string | undefined) {
		if (!this.#connection) {
			this.#documentKey = documentKey;
			return;
		}
		if (documentKey === this.#documentKey && this.#joinedWith === this.#connection) return;

		this.#leave();
		this.#documentKey = documentKey;
		if (documentKey) {
			this.#connection.join(documentKey);
			this.#joinedWith = this.#connection;
		}
		this.#observePresence();
	}

	#leave() {
		if (this.#documentKey && this.#joinedWith) {
			this.#joinedWith.leave(this.#documentKey);
		}
		this.#joinedWith = undefined;
		this.#location = null;
		window.clearTimeout(this.#leaveFieldTimer);
		this.#editors.setValue([]);
	}

	#observePresence() {
		if (!this.#connection || !this.#documentKey) {
			this.removeUmbControllerByAlias('_whoIsHerePresence');
			return;
		}
		this.observe(
			this.#connection.presence(this.#documentKey),
			(users) => this.#editors.setValue(users.filter((user) => user.userKey !== this.#currentUserKey)),
			'_whoIsHerePresence',
		);
	}

	override destroy() {
		this.#leave();
		this.#editors.destroy();
		super.destroy();
	}
}

export { WhoIsHerePresenceWorkspaceContext as api };
