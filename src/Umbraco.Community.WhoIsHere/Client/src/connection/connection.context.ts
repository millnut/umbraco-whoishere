import type { WhoIsHereLocation, WhoIsHerePresenceUser } from '../types.js';
import { WHOISHERE_CONNECTION_CONTEXT } from './connection.context-token.js';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import {
	HttpTransportType,
	HubConnectionBuilder,
	HubConnectionState,
	type HubConnection,
	type IHttpConnectionOptions,
} from '@umbraco-cms/backoffice/external/signalr';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { UMB_SERVER_CONTEXT } from '@umbraco-cms/backoffice/server';

const HUB_PATH = '/umbraco/whoishere-hub';

// Only used if the server cannot be asked; matches the server default.
const DEFAULT_HEARTBEAT_SECONDS = 20;

// After automatic reconnect gives up, try again this often while any document is still open.
const RESTART_DELAY_MS = 15_000;

// Tabbing quickly through a form should send where the user stops, not every field they pass.
const LOCATION_DEBOUNCE_MS = 150;

/**
 * One hub connection per browser tab, shared by every open document workspace.
 *
 * Workspaces call join/leave; this context reference-counts them so the same document opened twice in a tab
 * (for example in a modal over the main editor) is one presence. It owns heartbeats and rejoins after reconnects
 * so individual workspaces do not have to.
 */
export class WhoIsHereConnectionContext extends UmbContextBase {
	#connection?: HubConnection;
	#starting?: Promise<boolean>;
	#restartTimer?: number;
	#heartbeatTimer?: number;
	#heartbeatSeconds = DEFAULT_HEARTBEAT_SECONDS;

	#authContext?: typeof UMB_AUTH_CONTEXT.TYPE;
	#serverContext?: typeof UMB_SERVER_CONTEXT.TYPE;

	// documentKey -> number of workspaces in this tab that have it open
	#joined = new Map<string, number>();
	// Documents the server refused (no access). Not retried from heartbeats, which would only be refused again.
	#refused = new Set<string>();
	#presence = new UmbObjectState<Record<string, Array<WhoIsHerePresenceUser>>>({});
	// The field this tab is in, per document. Kept so it can be sent again after a rejoin.
	#locations = new Map<string, WhoIsHereLocation | null>();
	#locationTimers = new Map<string, number>();

	constructor(host: UmbControllerHost) {
		super(host, WHOISHERE_CONNECTION_CONTEXT);

		this.consumeContext(UMB_AUTH_CONTEXT, (context) => {
			this.#authContext = context;
			this.observe(context?.isAuthorized, (isAuthorized) => {
				// Logging out must not leave this user listed on documents they had open.
				if (isAuthorized === false) this.#stop();
				// Logged back in (e.g. after a session timeout) with documents still open.
				if (isAuthorized && this.#joined.size > 0) this.#reconnect();
			});
		});
		this.consumeContext(UMB_SERVER_CONTEXT, (context) => {
			this.#serverContext = context;
		});

		// pagehide rather than beforeunload: it fires reliably on mobile and when the page enters the
		// back/forward cache. Stopping tells the server straight away instead of waiting for the timeout.
		window.addEventListener('pagehide', this.#onPageHide);
		window.addEventListener('pageshow', this.#onPageShow);
	}

	/** The users present on a document, including the current user. */
	presence(documentKey: string) {
		return this.#presence.asObservablePart((presence) => presence[documentKey] ?? []);
	}

	join(documentKey: string) {
		const count = this.#joined.get(documentKey) ?? 0;
		this.#joined.set(documentKey, count + 1);
		if (count === 0) {
			this.#invokeJoin(documentKey);
		}
	}

	leave(documentKey: string) {
		const count = this.#joined.get(documentKey);
		if (!count) return;

		if (count > 1) {
			this.#joined.set(documentKey, count - 1);
			return;
		}

		this.#joined.delete(documentKey);
		this.#refused.delete(documentKey);
		this.#locations.delete(documentKey);
		window.clearTimeout(this.#locationTimers.get(documentKey));
		this.#locationTimers.delete(documentKey);
		this.#setPresence(documentKey, undefined);
		if (this.#connection?.state === HubConnectionState.Connected) {
			this.#connection.invoke('Leave', documentKey).catch(this.#logError);
		}
		if (this.#joined.size === 0) {
			// Nothing open, so there is nothing to keep alive. The connection itself stays for the next join.
			this.#clearTimers();
		}
	}

	/** Tells the other editors which field this tab is in on a document, or that it is in none (null). */
	setLocation(documentKey: string, location: WhoIsHereLocation | null) {
		if (!this.#joined.has(documentKey)) return;
		this.#locations.set(documentKey, location);

		window.clearTimeout(this.#locationTimers.get(documentKey));
		this.#locationTimers.set(
			documentKey,
			window.setTimeout(() => {
				this.#locationTimers.delete(documentKey);
				this.#sendLocation(documentKey);
			}, LOCATION_DEBOUNCE_MS),
		);
	}

	async #sendLocation(documentKey: string) {
		if (this.#connection?.state !== HubConnectionState.Connected || this.#refused.has(documentKey)) return;
		// Only worth sending once the server has a presence to attach it to; joining sends it otherwise.
		if (!this.#locations.has(documentKey)) return;
		try {
			const known = await this.#connection.invoke<boolean>('SetLocation', documentKey, this.#locations.get(documentKey) ?? null);
			if (!known) this.#invokeJoin(documentKey);
		} catch (error) {
			this.#logError(error);
		}
	}

	async #invokeJoin(documentKey: string) {
		if (!(await this.#ensureConnected())) return;
		// The workspace may have closed while the connection was starting.
		if (!this.#joined.has(documentKey)) return;
		this.#heartbeatTimer ??= window.setInterval(() => this.#heartbeat(), this.#heartbeatSeconds * 1000);

		try {
			const users = await this.#connection!.invoke<Array<WhoIsHerePresenceUser>>('Join', documentKey);
			this.#refused.delete(documentKey);
			if (this.#joined.has(documentKey)) this.#setPresence(documentKey, users);
			// A new connection starts without a location, so restore the one this tab had.
			if (this.#locations.get(documentKey)) this.#sendLocation(documentKey);
		} catch (error) {
			// The server refuses documents the user cannot access; there is no presence to show then.
			if (this.#connection?.state === HubConnectionState.Connected) this.#refused.add(documentKey);
			this.#logError(error);
		}
	}

	#ensureConnected(): Promise<boolean> {
		if (this.#connection?.state === HubConnectionState.Connected) return Promise.resolve(true);
		this.#starting ??= this.#start().finally(() => (this.#starting = undefined));
		return this.#starting;
	}

	async #start(): Promise<boolean> {
		if (!this.#serverContext || !this.#authContext) return false;

		this.#connection ??= this.#createConnection();
		if (this.#connection.state === HubConnectionState.Disconnected) {
			try {
				await this.#connection.start();
			} catch (error) {
				// Also where a site with WhoIsHere disabled ends up: the hub is not mapped. Stay quiet and retry later
				// rather than failing the workspace.
				this.#logError(error);
				this.#scheduleRestart();
				return false;
			}
		}

		try {
			const config = await this.#connection.invoke<{ heartbeatSeconds: number }>('GetConfiguration');
			this.#heartbeatSeconds = config.heartbeatSeconds;
		} catch (error) {
			this.#logError(error);
		}

		return true;
	}

	#createConnection() {
		const authContext = this.#authContext!;
		const serverContext = this.#serverContext!;

		const options: IHttpConnectionOptions = {
			// The backoffice keeps the real token in an httpOnly cookie. This returns a placeholder that the server
			// swaps for the cookie's token, and refreshes the session first if it has expired.
			accessTokenFactory: () => authContext.getLatestToken(),
		};
		if (serverContext.getServerConnection()?.getSignalRSkipNegotiation()) {
			options.skipNegotiation = true;
			options.transport = HttpTransportType.WebSockets;
		}

		const connection = new HubConnectionBuilder()
			.withUrl(`${serverContext.getServerUrl()}${HUB_PATH}`, options)
			.withAutomaticReconnect()
			.build();

		connection.on('PresenceChanged', (documentKey: string, users: Array<WhoIsHerePresenceUser>) => {
			// A broadcast can arrive just after this tab left the document; ignore it.
			if (this.#joined.has(documentKey)) this.#setPresence(documentKey, users);
		});

		// The new connection has a new id, so the server knows none of this tab's presences.
		connection.onreconnected(() => this.#rejoinAll());
		connection.onclose(() => {
			this.#clearPresence();
			this.#scheduleRestart();
		});

		return connection;
	}

	#rejoinAll() {
		for (const documentKey of this.#joined.keys()) {
			this.#invokeJoin(documentKey);
		}
	}

	async #heartbeat() {
		if (this.#connection?.state !== HubConnectionState.Connected) return;
		for (const documentKey of this.#joined.keys()) {
			if (this.#refused.has(documentKey)) continue;
			try {
				const known = await this.#connection.invoke<boolean>('Heartbeat', documentKey);
				// The server timed us out (e.g. the laptop slept) or restarted, so join again.
				if (!known) this.#invokeJoin(documentKey);
			} catch (error) {
				this.#logError(error);
			}
		}
	}

	#scheduleRestart() {
		window.clearTimeout(this.#restartTimer);
		if (this.#joined.size === 0) return;
		this.#restartTimer = window.setTimeout(() => this.#reconnect(), RESTART_DELAY_MS);
	}

	#stop() {
		this.#clearTimers();
		this.#clearPresence();
		// Stopping fires onclose, which would schedule a restart; clear the timer that sets.
		this.#connection
			?.stop()
			.then(() => window.clearTimeout(this.#restartTimer))
			.catch(this.#logError);
	}

	#onPageHide = () => this.#stop();

	#onPageShow = (event: PageTransitionEvent) => {
		// Restored from the back/forward cache: the workspaces are still open but the connection was stopped.
		if (event.persisted && this.#joined.size > 0) this.#reconnect();
	};

	async #reconnect() {
		if (this.#joined.size > 0 && (await this.#ensureConnected())) this.#rejoinAll();
	}

	#setPresence(documentKey: string, users: Array<WhoIsHerePresenceUser> | undefined) {
		const presence = { ...this.#presence.getValue() };
		if (users) presence[documentKey] = users;
		else delete presence[documentKey];
		this.#presence.setValue(presence);
	}

	#clearPresence() {
		this.#presence.setValue({});
	}

	#clearTimers() {
		this.#locationTimers.forEach((timer) => window.clearTimeout(timer));
		this.#locationTimers.clear();
		window.clearInterval(this.#heartbeatTimer);
		window.clearTimeout(this.#restartTimer);
		this.#heartbeatTimer = undefined;
		this.#restartTimer = undefined;
	}

	#logError = (error: unknown) => console.debug('[WhoIsHere]', error);

	override destroy() {
		window.removeEventListener('pagehide', this.#onPageHide);
		window.removeEventListener('pageshow', this.#onPageShow);
		this.#stop();
		this.#presence.destroy();
		super.destroy();
	}
}

export { WhoIsHereConnectionContext as api };
