using Microsoft.AspNetCore.SignalR;
using Umbraco.Community.WhoIsHere.Hubs;

namespace Umbraco.Community.WhoIsHere.Presence;

/// <summary>
/// Sends a document's current presence list to everyone who has it open.
/// </summary>
/// <remarks>
/// Goes through <see cref="IHubContext{THub,T}"/> rather than a hub instance so the sweeper, which runs
/// outside any hub invocation, can broadcast too.
/// </remarks>
public sealed class PresenceBroadcaster
{
    private readonly IHubContext<WhoIsHereHub, IWhoIsHereClient> _hubContext;
    private readonly IPresenceStore _store;

    public PresenceBroadcaster(IHubContext<WhoIsHereHub, IWhoIsHereClient> hubContext, IPresenceStore store)
    {
        _hubContext = hubContext;
        _store = store;
    }

    public static string GroupName(Guid documentKey) => $"doc:{documentKey}";

    public async Task BroadcastAsync(Guid documentKey)
    {
        var users = await _store.GetUsersAsync(documentKey);
        await _hubContext.Clients.Group(GroupName(documentKey)).PresenceChanged(documentKey, users);
    }

    public async Task BroadcastAsync(IEnumerable<Guid> documentKeys)
    {
        foreach (Guid documentKey in documentKeys)
        {
            await BroadcastAsync(documentKey);
        }
    }
}
