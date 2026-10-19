using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Umbraco.Community.WhoIsHere.Options;

namespace Umbraco.Community.WhoIsHere.Presence;

/// <summary>
/// Drops presences whose client stopped sending heartbeats without disconnecting, such as a killed browser.
/// </summary>
public sealed class PresenceSweeper : BackgroundService
{
    private readonly IPresenceStore _store;
    private readonly PresenceBroadcaster _broadcaster;
    private readonly TimeProvider _timeProvider;
    private readonly IOptionsMonitor<WhoIsHereOptions> _options;
    private readonly ILogger<PresenceSweeper> _logger;

    public PresenceSweeper(
        IPresenceStore store,
        PresenceBroadcaster broadcaster,
        TimeProvider timeProvider,
        IOptionsMonitor<WhoIsHereOptions> options,
        ILogger<PresenceSweeper> logger)
    {
        _store = store;
        _broadcaster = broadcaster;
        _timeProvider = timeProvider;
        _options = options;
        _logger = logger;
    }

    /// <summary>
    /// Removes expired presences and tells the affected documents' editors.
    /// </summary>
    public async Task SweepAsync()
    {
        DateTimeOffset cutoff = _timeProvider.GetUtcNow() - TimeSpan.FromSeconds(_options.CurrentValue.TimeoutSeconds);
        IReadOnlyCollection<Guid> changed = await _store.RemoveExpiredAsync(cutoff);
        await _broadcaster.BroadcastAsync(changed);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(SweepInterval(), _timeProvider, stoppingToken);
                await SweepAsync();
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                // A failed sweep only delays cleanup until the next one, so keep the loop alive.
                _logger.LogError(exception, "Failed to sweep expired WhoIsHere presences");
            }
        }
    }

    // A quarter of the timeout means a dead client lingers at most 25% longer than configured.
    private TimeSpan SweepInterval() => TimeSpan.FromSeconds(Math.Max(1, _options.CurrentValue.TimeoutSeconds / 4.0));
}
