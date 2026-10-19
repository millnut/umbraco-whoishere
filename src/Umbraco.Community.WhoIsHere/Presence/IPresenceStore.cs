using Umbraco.Community.WhoIsHere.Models;

namespace Umbraco.Community.WhoIsHere.Presence;

/// <summary>
/// Tracks which connections have which documents open.
/// </summary>
/// <remarks>
/// Presence is held per connection rather than per user, so a user with two tabs stays present until both
/// have gone. <see cref="GetUsersAsync"/> collapses those connections back into one entry per user.
/// The methods are async so an out-of-process implementation (such as Redis) can sit behind the same interface.
/// A user's location comes from whichever of their connections moved most recently.
/// Methods that change state report whether the document's distinct set of users changed, so callers only
/// broadcast when other editors would see a difference.
/// </remarks>
public interface IPresenceStore
{
    Task<bool> JoinAsync(Guid documentKey, string connectionId, PresenceUser user);

    Task<bool> LeaveAsync(Guid documentKey, string connectionId);

    /// <summary>
    /// Refreshes the last-seen time of a presence.
    /// </summary>
    /// <returns>False when the presence is unknown, for example because it timed out, so the client should join again.</returns>
    Task<bool> HeartbeatAsync(Guid documentKey, string connectionId);

    /// <summary>
    /// Records which field a connection is working in, or clears it with null. Also counts as a heartbeat.
    /// </summary>
    /// <returns>Whether the document's users changed; false too when the presence is unknown.</returns>
    Task<bool> SetLocationAsync(Guid documentKey, string connectionId, PresenceLocation? location);

    /// <summary>
    /// Removes every presence held by a connection.
    /// </summary>
    /// <returns>The documents whose users changed.</returns>
    Task<IReadOnlyCollection<Guid>> RemoveConnectionAsync(string connectionId);

    /// <summary>
    /// Removes presences that have not been seen since <paramref name="cutoff"/>.
    /// </summary>
    /// <returns>The documents whose users changed.</returns>
    Task<IReadOnlyCollection<Guid>> RemoveExpiredAsync(DateTimeOffset cutoff);

    /// <summary>
    /// Gets the distinct users present on a document, in the order they arrived.
    /// </summary>
    Task<IReadOnlyList<PresenceUser>> GetUsersAsync(Guid documentKey);
}
