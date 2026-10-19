import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import { UMB_DOCUMENT_WORKSPACE_CONTEXT, UmbDocumentAuditLogRepository } from '@umbraco-cms/backoffice/document';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT } from '@umbraco-cms/backoffice/management-api';
import { UMB_NOTIFICATION_CONTEXT, type UmbNotificationHandler } from '@umbraco-cms/backoffice/notification';
import { UmbUserItemRepository } from '@umbraco-cms/backoffice/user';
import { UmbDirection } from '@umbraco-cms/backoffice/utils';
import { WHOISHERE_PRESENCE_WORKSPACE_CONTEXT } from '../presence/presence.workspace-context-token.js';
import type { WhoIsHereSaveConflictNotificationData } from './save-conflict-notification.element.js';
import './save-conflict-notification.element.js';

// Values of Umbraco's Constants.ServerEvents on the server
const DOCUMENT_EVENT_SOURCE = 'Umbraco:CMS:Document';
const UPDATED_EVENT_TYPE = 'Updated';

/**
 * Warns when someone else saves the open document, without blocking anything.
 *
 * Umbraco's own server events say a document changed but not who changed it, so the audit log supplies
 * the who and when. That is also how the user's own saves are recognised and skipped.
 */
export class WhoIsHereSaveConflictWorkspaceContext extends UmbContextBase {
	#localize = new UmbLocalizationController(this);
	#auditLogRepository = new UmbDocumentAuditLogRepository(this);
	#userItemRepository = new UmbUserItemRepository(this);

	#workspaceContext?: typeof UMB_DOCUMENT_WORKSPACE_CONTEXT.TYPE;
	#notificationContext?: typeof UMB_NOTIFICATION_CONTEXT.TYPE;
	#presenceContext?: typeof WHOISHERE_PRESENCE_WORKSPACE_CONTEXT.TYPE;
	#notification?: UmbNotificationHandler;
	#documentKey?: string | null;
	#currentUserKey?: string;

	constructor(host: UmbControllerHost) {
		// No context alias: nothing consumes this, it only reacts to events.
		super(host, 'WhoIsHere.WorkspaceContext.SaveConflict');

		this.consumeContext(UMB_NOTIFICATION_CONTEXT, (context) => (this.#notificationContext = context));
		this.consumeContext(WHOISHERE_PRESENCE_WORKSPACE_CONTEXT, (context) => (this.#presenceContext = context));
		this.consumeContext(UMB_CURRENT_USER_CONTEXT, (context) => {
			this.observe(context?.unique, (unique) => (this.#currentUserKey = unique));
		});
		this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, (context) => {
			this.#workspaceContext = context;
			this.observe(context?.unique, (unique) => {
				// A notice about the previous document would be misleading once another one is open.
				if (unique !== this.#documentKey) this.#closeNotification();
				this.#documentKey = unique;
			});
		});
		this.consumeContext(UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT, (context) => {
			this.observe(
				context?.byEventSourcesAndEventTypes([DOCUMENT_EVENT_SOURCE], [UPDATED_EVENT_TYPE]),
				(event) => {
					if (event && event.key === this.#documentKey) this.#onDocumentUpdated(event.key);
				},
			);
		});
	}

	async #onDocumentUpdated(documentKey: string) {
		const { data } = await this.#auditLogRepository.requestAuditLog({
			unique: documentKey,
			orderDirection: UmbDirection.DESCENDING,
			take: 1,
		});
		const latest = data?.items[0];

		// Without an audit entry we cannot tell this user's save from someone else's, so stay quiet rather than
		// warn about something they did themselves.
		if (!latest || !this.#currentUserKey || latest.user.unique === this.#currentUserKey) return;
		// The user may have moved to another document while the audit log loaded.
		if (documentKey !== this.#documentKey) return;

		// Someone still on the document has a presence colour; reuse it so the notice matches their avatar elsewhere.
		const editor = this.#presenceContext?.getEditors().find((user) => user.userKey === latest.user.unique);
		const { data: users } = editor ? { data: undefined } : await this.#userItemRepository.requestItems([latest.user.unique]);

		const name = editor?.name ?? users?.[0]?.name ?? this.#localize.term('whoIsHere_someoneElse');
		const time = this.#localize.date(latest.timestamp, { timeStyle: 'short' });
		this.#showNotification({
			name,
			avatarUrl: editor?.avatarUrl ?? users?.[0]?.avatarUrls[0],
			color: editor?.color,
			headline: this.#localize.term('whoIsHere_savedByHeadline', name),
			message: this.#localize.term('whoIsHere_savedByMessage', time),
			onReload: this.#reload,
		});
	}

	#showNotification(data: WhoIsHereSaveConflictNotificationData) {
		this.#closeNotification();

		// stay rather than peek: a notice that disappears while the editor is looking elsewhere is easy to miss.
		// Umbraco's standard info colour rather than warning yellow: nothing is blocked or wrong yet, it is
		// information to act on.
		this.#notification = this.#notificationContext?.stay('default', {
			elementName: 'whoishere-save-conflict-notification',
			data,
		});
	}

	#reload = async () => {
		this.#notification = undefined;
		await this.#workspaceContext?.reload();
	};

	#closeNotification() {
		this.#notification?.close();
		this.#notification = undefined;
	}

	override destroy() {
		this.#closeNotification();
		super.destroy();
	}
}

export { WhoIsHereSaveConflictWorkspaceContext as api };
