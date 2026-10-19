namespace Umbraco.Community.WhoIsHere.Models;

/// <summary>
/// A backoffice user who has a document open, as broadcast to the other editors of that document.
/// </summary>
/// <param name="UserKey">The user's key.</param>
/// <param name="Name">The user's display name.</param>
/// <param name="AvatarUrl">A small avatar image, or null when the user has none.</param>
/// <param name="Color">The user's colour as a hex value, the same on every client.</param>
/// <param name="Location">The field the user is working in, or null when they are not in one.</param>
public sealed record PresenceUser(Guid UserKey, string Name, string? AvatarUrl, string Color, PresenceLocation? Location = null);
