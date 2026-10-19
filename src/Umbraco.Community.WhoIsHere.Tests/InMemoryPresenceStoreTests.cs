using Microsoft.Extensions.Time.Testing;
using Umbraco.Community.WhoIsHere.Models;
using Umbraco.Community.WhoIsHere.Presence;

namespace Umbraco.Community.WhoIsHere.Tests;

public class InMemoryPresenceStoreTests
{
    private static readonly Guid Document = Guid.NewGuid();
    private static readonly Guid OtherDocument = Guid.NewGuid();
    private static readonly PresenceUser Jane = User("Jane");
    private static readonly PresenceUser Sam = User("Sam");

    private readonly FakeTimeProvider _time = new();
    private readonly InMemoryPresenceStore _store;

    public InMemoryPresenceStoreTests() => _store = new InMemoryPresenceStore(_time);

    [Fact]
    public async Task Join_adds_the_user_and_reports_a_change()
    {
        Assert.True(await _store.JoinAsync(Document, "c1", Jane));
        Assert.Equal([Jane], await _store.GetUsersAsync(Document));
    }

    [Fact]
    public async Task Users_are_listed_in_arrival_order()
    {
        await _store.JoinAsync(Document, "c1", Sam);
        await _store.JoinAsync(Document, "c2", Jane);

        Assert.Equal([Sam, Jane], await _store.GetUsersAsync(Document));
    }

    [Fact]
    public async Task Same_user_in_two_tabs_is_listed_once_and_the_second_tab_is_not_a_change()
    {
        await _store.JoinAsync(Document, "tab1", Jane);

        Assert.False(await _store.JoinAsync(Document, "tab2", Jane));
        Assert.Equal([Jane], await _store.GetUsersAsync(Document));
    }

    [Fact]
    public async Task Closing_one_of_two_tabs_keeps_the_user_present()
    {
        await _store.JoinAsync(Document, "tab1", Jane);
        await _store.JoinAsync(Document, "tab2", Jane);

        Assert.False(await _store.LeaveAsync(Document, "tab1"));
        Assert.Equal([Jane], await _store.GetUsersAsync(Document));

        Assert.True(await _store.LeaveAsync(Document, "tab2"));
        Assert.Empty(await _store.GetUsersAsync(Document));
    }

    [Fact]
    public async Task Rejoining_from_the_same_connection_is_not_a_change()
    {
        await _store.JoinAsync(Document, "c1", Jane);
        await _store.JoinAsync(Document, "c2", Sam);

        Assert.False(await _store.JoinAsync(Document, "c1", Jane));
        Assert.Equal([Jane, Sam], await _store.GetUsersAsync(Document));
    }

    [Fact]
    public async Task Changed_user_details_are_a_change_and_the_latest_details_are_shown()
    {
        await _store.JoinAsync(Document, "tab1", Jane);
        PresenceUser renamed = Jane with { Name = "Jane Doe" };

        Assert.True(await _store.JoinAsync(Document, "tab2", renamed));
        Assert.Equal([renamed], await _store.GetUsersAsync(Document));
    }

    [Fact]
    public async Task Leaving_an_unknown_presence_is_not_a_change()
    {
        Assert.False(await _store.LeaveAsync(Document, "nobody"));
    }

    [Fact]
    public async Task Switching_documents_moves_presence_without_leaving_a_stale_entry()
    {
        await _store.JoinAsync(Document, "c1", Jane);

        await _store.LeaveAsync(Document, "c1");
        await _store.JoinAsync(OtherDocument, "c1", Jane);

        Assert.Empty(await _store.GetUsersAsync(Document));
        Assert.Equal([Jane], await _store.GetUsersAsync(OtherDocument));
    }

    [Fact]
    public async Task Removing_a_connection_clears_all_its_documents_and_reports_only_those_that_changed()
    {
        await _store.JoinAsync(Document, "c1", Jane);
        await _store.JoinAsync(OtherDocument, "c1", Jane);
        // Jane's other tab keeps her on OtherDocument, so only Document changes.
        await _store.JoinAsync(OtherDocument, "c2", Jane);

        IReadOnlyCollection<Guid> changed = await _store.RemoveConnectionAsync("c1");

        Assert.Equal([Document], changed);
        Assert.Empty(await _store.GetUsersAsync(Document));
        Assert.Equal([Jane], await _store.GetUsersAsync(OtherDocument));
    }

    [Fact]
    public async Task Heartbeat_for_an_unknown_presence_returns_false()
    {
        Assert.False(await _store.HeartbeatAsync(Document, "c1"));
    }

    [Fact]
    public async Task Expired_presences_are_removed_but_recent_heartbeats_keep_a_presence_alive()
    {
        await _store.JoinAsync(Document, "jane", Jane);
        await _store.JoinAsync(Document, "sam", Sam);

        _time.Advance(TimeSpan.FromSeconds(50));
        Assert.True(await _store.HeartbeatAsync(Document, "sam"));
        _time.Advance(TimeSpan.FromSeconds(20));

        IReadOnlyCollection<Guid> changed = await _store.RemoveExpiredAsync(_time.GetUtcNow() - TimeSpan.FromSeconds(60));

        Assert.Equal([Document], changed);
        Assert.Equal([Sam], await _store.GetUsersAsync(Document));
    }

    [Fact]
    public async Task Nothing_expired_reports_no_changes()
    {
        await _store.JoinAsync(Document, "c1", Jane);

        Assert.Empty(await _store.RemoveExpiredAsync(_time.GetUtcNow() - TimeSpan.FromSeconds(60)));
    }

    [Fact]
    public async Task Concurrent_joins_and_leaves_leave_a_consistent_state()
    {
        await Parallel.ForEachAsync(Enumerable.Range(0, 500), async (i, _) =>
        {
            var connection = $"c{i}";
            await _store.JoinAsync(Document, connection, i % 2 == 0 ? Jane : Sam);
            if (i % 3 == 0)
            {
                await _store.LeaveAsync(Document, connection);
            }
        });

        Assert.Equal(2, (await _store.GetUsersAsync(Document)).Count);
    }

    [Fact]
    public async Task Setting_a_location_is_a_change_and_is_shown_on_the_user()
    {
        await _store.JoinAsync(Document, "c1", Jane);
        PresenceLocation title = Location("title");

        Assert.True(await _store.SetLocationAsync(Document, "c1", title));
        Assert.Equal(title, Assert.Single(await _store.GetUsersAsync(Document)).Location);
    }

    [Fact]
    public async Task Setting_an_equal_location_again_is_not_a_change()
    {
        await _store.JoinAsync(Document, "c1", Jane);
        await _store.SetLocationAsync(Document, "c1", Location("title"));

        // A fresh instance with equal contents, as arrives from JSON
        Assert.False(await _store.SetLocationAsync(Document, "c1", Location("title")));
    }

    [Fact]
    public async Task Clearing_a_location_is_a_change()
    {
        await _store.JoinAsync(Document, "c1", Jane);
        await _store.SetLocationAsync(Document, "c1", Location("title"));

        Assert.True(await _store.SetLocationAsync(Document, "c1", null));
        Assert.Null(Assert.Single(await _store.GetUsersAsync(Document)).Location);
    }

    [Fact]
    public async Task Setting_a_location_without_a_presence_fails()
    {
        Assert.False(await _store.SetLocationAsync(Document, "c1", Location("title")));
        Assert.Empty(await _store.GetUsersAsync(Document));
    }

    [Fact]
    public async Task With_two_tabs_the_location_comes_from_the_tab_that_moved_last()
    {
        await _store.JoinAsync(Document, "tab1", Jane);
        await _store.JoinAsync(Document, "tab2", Jane);

        await _store.SetLocationAsync(Document, "tab2", Location("title"));
        await _store.SetLocationAsync(Document, "tab1", Location("body"));
        Assert.Equal("body", Assert.Single(await _store.GetUsersAsync(Document)).Location!.FieldId);

        await _store.SetLocationAsync(Document, "tab2", Location("title"));
        Assert.Equal("title", Assert.Single(await _store.GetUsersAsync(Document)).Location!.FieldId);

        // The tab the user is looking at left its field, so they are not in one, whatever the other tab says.
        await _store.SetLocationAsync(Document, "tab2", null);
        Assert.Null(Assert.Single(await _store.GetUsersAsync(Document)).Location);
    }

    [Fact]
    public async Task Rejoining_from_the_same_connection_keeps_its_location()
    {
        await _store.JoinAsync(Document, "c1", Jane);
        await _store.SetLocationAsync(Document, "c1", Location("title"));

        Assert.False(await _store.JoinAsync(Document, "c1", Jane));
        Assert.Equal("title", Assert.Single(await _store.GetUsersAsync(Document)).Location!.FieldId);
    }

    [Fact]
    public async Task Setting_a_location_keeps_the_presence_alive()
    {
        await _store.JoinAsync(Document, "c1", Jane);
        _time.Advance(TimeSpan.FromSeconds(50));
        await _store.SetLocationAsync(Document, "c1", Location("title"));
        _time.Advance(TimeSpan.FromSeconds(20));

        Assert.Empty(await _store.RemoveExpiredAsync(_time.GetUtcNow() - TimeSpan.FromSeconds(60)));
    }

    private static PresenceLocation Location(string fieldId) => new(fieldId, ["content"], ["Content", fieldId]);

    private static PresenceUser User(string name)
    {
        Guid key = Guid.NewGuid();
        return new PresenceUser(key, name, null, PresenceColor.For(key));
    }
}
