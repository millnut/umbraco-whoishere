namespace Umbraco.Community.WhoIsHere.Options;

/// <summary>
/// Settings bound from the <c>WhoIsHere</c> section of configuration.
/// </summary>
public sealed class WhoIsHereOptions
{
    public const string SectionName = "WhoIsHere";

    /// <summary>
    /// When false the hub is not mapped, so clients fail to connect and show nothing.
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// How often an open document workspace tells the server it is still there.
    /// </summary>
    public int HeartbeatSeconds { get; set; } = 20;

    /// <summary>
    /// How long without a heartbeat before a presence is dropped. Covers clients that vanish without
    /// disconnecting cleanly, such as a killed browser or a sleeping laptop.
    /// </summary>
    public int TimeoutSeconds { get; set; } = 60;
}
