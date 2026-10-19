namespace Umbraco.Community.WhoIsHere.Hubs;

/// <summary>
/// Settings the client needs from the server, so they live in one place (appsettings).
/// </summary>
public sealed record HubConfiguration(int HeartbeatSeconds);
