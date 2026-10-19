using Umbraco.Community.WhoIsHere.Models;

namespace Umbraco.Community.WhoIsHere.Hubs;

/// <summary>
/// Messages the server sends to connected backoffice clients.
/// </summary>
public interface IWhoIsHereClient
{
    Task PresenceChanged(Guid documentKey, IReadOnlyList<PresenceUser> users);
}
