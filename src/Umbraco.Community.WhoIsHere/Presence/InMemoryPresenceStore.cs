using Umbraco.Community.WhoIsHere.Models;

namespace Umbraco.Community.WhoIsHere.Presence;

/// <summary>
/// Holds presence in process memory. Suitable for a single server; see the README for load balancing.
/// </summary>
/// <remarks>
/// One lock guards everything. Every operation touches a handful of entries and contention is bounded by how
/// often editors open documents, so this is simpler than coordinating nested concurrent dictionaries, where
/// removing an emptied inner dictionary races with a concurrent join.
/// </remarks>
public sealed class InMemoryPresenceStore : IPresenceStore
{
    private readonly TimeProvider _timeProvider;
    private readonly Lock _lock = new();

    // documentKey -> connectionId -> entry. Dictionary enumeration order is unspecified, so arrival order
    // is kept explicitly via Sequence.
    private readonly Dictionary<Guid, Dictionary<string, Entry>> _documents = [];
    private long _sequence;

    public InMemoryPresenceStore(TimeProvider timeProvider) => _timeProvider = timeProvider;

    public Task<bool> JoinAsync(Guid documentKey, string connectionId, PresenceUser user)
    {
        lock (_lock)
        {
            if (!_documents.TryGetValue(documentKey, out Dictionary<string, Entry>? connections))
            {
                connections = [];
                _documents[documentKey] = connections;
            }

            IReadOnlyList<PresenceUser> before = UsersOf(connections);

            // A repeat join from the same connection (e.g. after a reconnect) keeps its place in the list and its field.
            connections[connectionId] = connections.TryGetValue(connectionId, out Entry? existing)
                ? existing with { User = user, LastSeen = _timeProvider.GetUtcNow() }
                : new Entry(user, _timeProvider.GetUtcNow(), ++_sequence, null, 0);

            return Task.FromResult(!before.SequenceEqual(UsersOf(connections)));
        }
    }

    public Task<bool> LeaveAsync(Guid documentKey, string connectionId)
    {
        lock (_lock)
        {
            return Task.FromResult(RemoveEntry(documentKey, connectionId));
        }
    }

    public Task<bool> HeartbeatAsync(Guid documentKey, string connectionId)
    {
        lock (_lock)
        {
            if (!_documents.TryGetValue(documentKey, out Dictionary<string, Entry>? connections)
                || !connections.TryGetValue(connectionId, out Entry? entry))
            {
                return Task.FromResult(false);
            }

            connections[connectionId] = entry with { LastSeen = _timeProvider.GetUtcNow() };
            return Task.FromResult(true);
        }
    }

    public Task<bool> SetLocationAsync(Guid documentKey, string connectionId, PresenceLocation? location)
    {
        lock (_lock)
        {
            if (!_documents.TryGetValue(documentKey, out Dictionary<string, Entry>? connections)
                || !connections.TryGetValue(connectionId, out Entry? entry))
            {
                return Task.FromResult(false);
            }

            IReadOnlyList<PresenceUser> before = UsersOf(connections);
            connections[connectionId] = entry with
            {
                LastSeen = _timeProvider.GetUtcNow(),
                Location = location,
                LocationSequence = ++_sequence,
            };

            return Task.FromResult(!before.SequenceEqual(UsersOf(connections)));
        }
    }

    public Task<IReadOnlyCollection<Guid>> RemoveConnectionAsync(string connectionId)
    {
        lock (_lock)
        {
            var changed = new List<Guid>();
            foreach (Guid documentKey in _documents.Keys.ToArray())
            {
                if (RemoveEntry(documentKey, connectionId))
                {
                    changed.Add(documentKey);
                }
            }

            return Task.FromResult<IReadOnlyCollection<Guid>>(changed);
        }
    }

    public Task<IReadOnlyCollection<Guid>> RemoveExpiredAsync(DateTimeOffset cutoff)
    {
        lock (_lock)
        {
            var changed = new List<Guid>();
            foreach ((Guid documentKey, Dictionary<string, Entry> connections) in _documents.ToArray())
            {
                var documentChanged = false;
                foreach ((string connectionId, Entry entry) in connections.ToArray())
                {
                    if (entry.LastSeen < cutoff)
                    {
                        documentChanged |= RemoveEntry(documentKey, connectionId);
                    }
                }

                if (documentChanged)
                {
                    changed.Add(documentKey);
                }
            }

            return Task.FromResult<IReadOnlyCollection<Guid>>(changed);
        }
    }

    public Task<IReadOnlyList<PresenceUser>> GetUsersAsync(Guid documentKey)
    {
        lock (_lock)
        {
            return Task.FromResult(
                _documents.TryGetValue(documentKey, out Dictionary<string, Entry>? connections) ? UsersOf(connections) : []);
        }
    }

    // A user with several tabs is listed once, at the position of their first tab. The details come from their
    // most recent tab so a changed name or avatar shows up, and the location from whichever tab moved last, since
    // that is the one they are looking at.
    private static IReadOnlyList<PresenceUser> UsersOf(Dictionary<string, Entry> connections) =>
        connections.Values
            .GroupBy(entry => entry.User.UserKey)
            .Select(group => (
                First: group.Min(entry => entry.Sequence),
                User: group.MaxBy(entry => entry.Sequence)!.User with
                {
                    Location = group.MaxBy(entry => entry.LocationSequence)!.Location,
                }))
            .OrderBy(user => user.First)
            .Select(user => user.User)
            .ToArray();

    // Caller must hold _lock. Returns whether the document's distinct users changed.
    private bool RemoveEntry(Guid documentKey, string connectionId)
    {
        if (!_documents.TryGetValue(documentKey, out Dictionary<string, Entry>? connections)
            || !connections.ContainsKey(connectionId))
        {
            return false;
        }

        IReadOnlyList<PresenceUser> before = UsersOf(connections);
        connections.Remove(connectionId);

        if (connections.Count == 0)
        {
            _documents.Remove(documentKey);
            return true;
        }

        // Unchanged when another of the same user's tabs still has the document open.
        return !before.SequenceEqual(UsersOf(connections));
    }

    private sealed record Entry(
        PresenceUser User,
        DateTimeOffset LastSeen,
        long Sequence,
        PresenceLocation? Location,
        long LocationSequence);
}
