using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Actions;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Security.Authorization;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.WhoIsHere.Models;
using Umbraco.Community.WhoIsHere.Options;
using Umbraco.Community.WhoIsHere.Presence;
using Umbraco.Extensions;

namespace Umbraco.Community.WhoIsHere.Hubs;

/// <summary>
/// Tracks which backoffice users have which documents open and tells the other editors of each document.
/// </summary>
/// <remarks>
/// Uses the same policy as Umbraco's own hubs, so the backoffice's cookie-held access token authenticates it.
/// </remarks>
[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
public sealed class WhoIsHereHub : Hub<IWhoIsHereClient>
{
    public const string Route = "/umbraco/whoishere-hub";

    // Generous for real paths (a GUID plus an alias and culture per level) while stopping a client from making the
    // server relay arbitrarily large payloads to everyone on the document.
    private const int MaxIdLength = 512;
    private const int MaxLabelLength = 200;
    private const int MaxDepth = 16;

    private readonly IPresenceStore _store;
    private readonly PresenceBroadcaster _broadcaster;
    private readonly PresenceUserFactory _userFactory;
    private readonly IAuthorizationService _authorizationService;
    private readonly IEntityService _entityService;
    private readonly WhoIsHereOptions _options;

    public WhoIsHereHub(
        IPresenceStore store,
        PresenceBroadcaster broadcaster,
        PresenceUserFactory userFactory,
        IAuthorizationService authorizationService,
        IEntityService entityService,
        IOptions<WhoIsHereOptions> options)
    {
        _store = store;
        _broadcaster = broadcaster;
        _userFactory = userFactory;
        _authorizationService = authorizationService;
        _entityService = entityService;
        _options = options.Value;
    }

    public HubConfiguration GetConfiguration() => new(_options.HeartbeatSeconds);

    /// <summary>
    /// Registers the caller as present on a document.
    /// </summary>
    /// <returns>Everyone present on the document, including the caller.</returns>
    public async Task<IReadOnlyList<PresenceUser>> Join(Guid documentKey)
    {
        PresenceUser user = await AuthorizeAsync(documentKey);

        // Joined before recording presence, so the caller is already in the group for the broadcast below.
        await Groups.AddToGroupAsync(Context.ConnectionId, PresenceBroadcaster.GroupName(documentKey));

        if (await _store.JoinAsync(documentKey, Context.ConnectionId, user))
        {
            await _broadcaster.BroadcastAsync(documentKey);
        }

        return await _store.GetUsersAsync(documentKey);
    }

    public async Task Leave(Guid documentKey)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, PresenceBroadcaster.GroupName(documentKey));

        if (await _store.LeaveAsync(documentKey, Context.ConnectionId))
        {
            await _broadcaster.BroadcastAsync(documentKey);
        }
    }

    /// <summary>
    /// Records which field the caller is working in on a document they have joined, or clears it with null.
    /// </summary>
    /// <returns>False when the server no longer holds this presence, telling the client to join again.</returns>
    public async Task<bool> SetLocation(Guid documentKey, PresenceLocation? location)
    {
        if (location is not null && !IsValid(location))
        {
            throw new HubException("Invalid location.");
        }

        // No access check here: only a connection that passed Join's check has a presence to update.
        if (!await _store.SetLocationAsync(documentKey, Context.ConnectionId, location))
        {
            return await _store.HeartbeatAsync(documentKey, Context.ConnectionId);
        }

        await _broadcaster.BroadcastAsync(documentKey);
        return true;
    }

    /// <returns>False when the server no longer holds this presence, telling the client to join again.</returns>
    public Task<bool> Heartbeat(Guid documentKey) => _store.HeartbeatAsync(documentKey, Context.ConnectionId);

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        IReadOnlyCollection<Guid> changed = await _store.RemoveConnectionAsync(Context.ConnectionId);
        await _broadcaster.BroadcastAsync(changed);
        await base.OnDisconnectedAsync(exception);
    }

    private static bool IsValid(PresenceLocation location) =>
        // Deserialised from client JSON, so the non-nullable annotations are not guarantees.
        location.FieldId is { Length: > 0 and <= MaxIdLength }
        && location.AncestorIds is { Count: <= MaxDepth }
        && location.AncestorIds.All(id => id is { Length: > 0 and <= MaxIdLength })
        && location.Labels is { Count: > 0 and <= MaxDepth }
        && location.Labels.All(label => label is { Length: <= MaxLabelLength });

    private async Task<PresenceUser> AuthorizeAsync(Guid documentKey)
    {
        // Umbraco's content permission check passes for keys it cannot find, so confirm the document exists
        // first. Otherwise a caller could join groups for arbitrary keys.
        if (_entityService.Get(documentKey, UmbracoObjectTypes.Document) is null)
        {
            throw new HubException("Document not found.");
        }

        // Browse is the permission Umbraco requires to open a document, so anyone who can see it can see who
        // else is on it.
        AuthorizationResult result = await _authorizationService.AuthorizeResourceAsync(
            Context.User!,
            ContentPermissionResource.WithKeys(ActionBrowse.ActionLetter, documentKey),
            AuthorizationPolicies.ContentPermissionByResource);

        if (!result.Succeeded)
        {
            throw new HubException("You do not have access to this document.");
        }

        Guid userKey = Context.User?.Identity?.GetUserKey()
            ?? throw new HubException("The connection has no backoffice user.");

        return await _userFactory.CreateAsync(userKey)
            ?? throw new HubException("The backoffice user was not found.");
    }
}
