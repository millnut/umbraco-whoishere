using Umbraco.Cms.Core.Cache;
using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.Media;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.WhoIsHere.Models;

namespace Umbraco.Community.WhoIsHere.Presence;

/// <summary>
/// Builds the <see cref="PresenceUser"/> other editors see for a backoffice user.
/// </summary>
public sealed class PresenceUserFactory
{
    // Avatars render at about 30px; the 60px crop keeps them sharp on high-density screens.
    private const int AvatarUrlIndex = 1;

    private readonly IUserService _userService;
    private readonly AppCaches _appCaches;
    private readonly MediaFileManager _mediaFileManager;
    private readonly IImageUrlGenerator _imageUrlGenerator;

    public PresenceUserFactory(
        IUserService userService,
        AppCaches appCaches,
        MediaFileManager mediaFileManager,
        IImageUrlGenerator imageUrlGenerator)
    {
        _userService = userService;
        _appCaches = appCaches;
        _mediaFileManager = mediaFileManager;
        _imageUrlGenerator = imageUrlGenerator;
    }

    public async Task<PresenceUser?> CreateAsync(Guid userKey)
    {
        IUser? user = await _userService.GetAsync(userKey);
        if (user is null)
        {
            return null;
        }

        var avatarUrls = user.GetUserAvatarUrls(_appCaches.RuntimeCache, _mediaFileManager, _imageUrlGenerator);
        var avatarUrl = avatarUrls.Length > AvatarUrlIndex ? avatarUrls[AvatarUrlIndex] : avatarUrls.FirstOrDefault();

        return new PresenceUser(user.Key, user.Name ?? user.Username, avatarUrl, PresenceColor.For(user.Key));
    }
}
