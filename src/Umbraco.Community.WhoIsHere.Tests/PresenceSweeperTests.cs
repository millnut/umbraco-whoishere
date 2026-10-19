using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.WhoIsHere.Hubs;
using Umbraco.Community.WhoIsHere.Models;
using Umbraco.Community.WhoIsHere.Options;
using Umbraco.Community.WhoIsHere.Presence;

namespace Umbraco.Community.WhoIsHere.Tests;

public class PresenceSweeperTests
{
    private static readonly Guid Document = Guid.NewGuid();

    private readonly FakeTimeProvider _time = new();
    private readonly InMemoryPresenceStore _store;
    private readonly RecordingHubContext _hub = new();
    private readonly PresenceSweeper _sweeper;

    public PresenceSweeperTests()
    {
        _store = new InMemoryPresenceStore(_time);
        var options = new StaticOptionsMonitor(new WhoIsHereOptions { TimeoutSeconds = 60 });
        _sweeper = new PresenceSweeper(
            _store,
            new PresenceBroadcaster(_hub, _store),
            _time,
            options,
            NullLogger<PresenceSweeper>.Instance);
    }

    [Fact]
    public async Task Sweep_drops_silent_users_and_broadcasts_the_new_list_to_the_document_group()
    {
        PresenceUser jane = User("Jane");
        PresenceUser sam = User("Sam");
        await _store.JoinAsync(Document, "jane", jane);
        _time.Advance(TimeSpan.FromSeconds(30));
        await _store.JoinAsync(Document, "sam", sam);
        _time.Advance(TimeSpan.FromSeconds(31));

        await _sweeper.SweepAsync();

        (string group, Guid document, IReadOnlyList<PresenceUser> users) = Assert.Single(_hub.Sent);
        Assert.Equal(PresenceBroadcaster.GroupName(Document), group);
        Assert.Equal(Document, document);
        Assert.Equal([sam], users);
    }

    [Fact]
    public async Task Sweep_with_nothing_expired_broadcasts_nothing()
    {
        await _store.JoinAsync(Document, "jane", User("Jane"));

        await _sweeper.SweepAsync();

        Assert.Empty(_hub.Sent);
    }

    private static PresenceUser User(string name)
    {
        Guid key = Guid.NewGuid();
        return new PresenceUser(key, name, null, PresenceColor.For(key));
    }

    private sealed class StaticOptionsMonitor(WhoIsHereOptions value) : IOptionsMonitor<WhoIsHereOptions>
    {
        public WhoIsHereOptions CurrentValue => value;

        public WhoIsHereOptions Get(string? name) => value;

        public IDisposable? OnChange(Action<WhoIsHereOptions, string?> listener) => null;
    }

    private sealed class RecordingHubContext : IHubContext<WhoIsHereHub, IWhoIsHereClient>
    {
        public RecordingHubContext() => Clients = new RecordingClients(this);

        public List<(string Group, Guid Document, IReadOnlyList<PresenceUser> Users)> Sent { get; } = [];

        public IHubClients<IWhoIsHereClient> Clients { get; }

        public IGroupManager Groups => throw new NotSupportedException();

        // Only group sends are expected; anything else is a bug the test should surface.
        private sealed class RecordingClients(RecordingHubContext context) : IHubClients<IWhoIsHereClient>
        {
            public IWhoIsHereClient Group(string groupName) => new GroupClient(context, groupName);

            public IWhoIsHereClient All => throw new NotSupportedException();

            public IWhoIsHereClient AllExcept(IReadOnlyList<string> excludedConnectionIds) => throw new NotSupportedException();

            public IWhoIsHereClient Client(string connectionId) => throw new NotSupportedException();

            public IWhoIsHereClient Clients(IReadOnlyList<string> connectionIds) => throw new NotSupportedException();

            public IWhoIsHereClient GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => throw new NotSupportedException();

            public IWhoIsHereClient Groups(IReadOnlyList<string> groupNames) => throw new NotSupportedException();

            public IWhoIsHereClient User(string userId) => throw new NotSupportedException();

            public IWhoIsHereClient Users(IReadOnlyList<string> userIds) => throw new NotSupportedException();
        }

        private sealed class GroupClient(RecordingHubContext context, string group) : IWhoIsHereClient
        {
            public Task PresenceChanged(Guid documentKey, IReadOnlyList<PresenceUser> users)
            {
                context.Sent.Add((group, documentKey, users));
                return Task.CompletedTask;
            }
        }
    }
}
