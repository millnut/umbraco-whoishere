/** The field a user is working in. Mirrors PresenceLocation on the server. */
export interface WhoIsHereLocation {
	/** The owning document or block key, the property alias and the variant, joined. Equal across clients. */
	fieldId: string;
	/** The fields containing this one, outermost first, such as the block list around a block's property. */
	ancestorIds: Array<string>;
	/** Labels from the outermost container down to the field, e.g. ["Content", "Hero", "Heading"]. */
	labels: Array<string>;
}

/** A backoffice user present on a document, as sent by the server. */
export interface WhoIsHerePresenceUser {
	userKey: string;
	name: string;
	avatarUrl: string | null;
	color: string;
	location: WhoIsHereLocation | null;
}
