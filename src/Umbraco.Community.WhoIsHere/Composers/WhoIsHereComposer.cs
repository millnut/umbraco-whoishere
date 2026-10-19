using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.Configuration.Models;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Web.Common.ApplicationBuilder;
using Umbraco.Community.WhoIsHere.Hubs;
using Umbraco.Community.WhoIsHere.Options;
using Umbraco.Community.WhoIsHere.Presence;

namespace Umbraco.Community.WhoIsHere.Composers;

public sealed class WhoIsHereComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        IConfigurationSection section = builder.Config.GetSection(WhoIsHereOptions.SectionName);
        builder.Services.AddOptions<WhoIsHereOptions>().Bind(section);

        // Read once here rather than through IOptions because it decides what gets registered at all.
        if (!(section.Get<WhoIsHereOptions>() ?? new WhoIsHereOptions()).Enabled)
        {
            return;
        }

        builder.Services.TryAddSingleton(TimeProvider.System);

        // TryAdd so a site can register its own store (for example a shared one for load balancing) first.
        builder.Services.TryAddSingleton<IPresenceStore, InMemoryPresenceStore>();
        builder.Services.AddSingleton<PresenceBroadcaster>();
        builder.Services.AddSingleton<PresenceUserFactory>();
        builder.Services.AddHostedService<PresenceSweeper>();

        // Umbraco already adds SignalR for its own hubs; repeating it is harmless and makes no assumption.
        builder.Services.AddSignalR();

        builder.Services.Configure<UmbracoPipelineOptions>(options => options.AddFilter(
            new UmbracoPipelineFilter("WhoIsHere") { PostMapEndpoints = MapHub }));
    }

    private static void MapHub(IEndpointRouteBuilder endpoints)
    {
        // Matches Umbraco's own hubs: the hub's services need a fully installed site.
        if (endpoints.ServiceProvider.GetRequiredService<IRuntimeState>().Level != RuntimeLevel.Run)
        {
            return;
        }

        SignalRSettings signalRSettings = endpoints.ServiceProvider.GetRequiredService<IOptions<SignalRSettings>>().Value;
        endpoints.MapHub<WhoIsHereHub>(WhoIsHereHub.Route, options =>
        {
            // Some hosts (e.g. Azure SignalR without sticky sessions) need WebSockets only; the client mirrors
            // this setting from the backoffice server connection.
            if (signalRSettings.ClientShouldSkipNegotiation)
            {
                options.Transports = HttpTransportType.WebSockets;
            }
        });
    }
}
