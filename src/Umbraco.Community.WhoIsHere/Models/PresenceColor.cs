using System.Globalization;

namespace Umbraco.Community.WhoIsHere.Models;

/// <summary>
/// Derives a stable colour for a user from their key.
/// </summary>
/// <remarks>
/// Computed on the server and sent with the presence list, so every client agrees on a user's colour
/// without having to share an implementation.
/// </remarks>
public static class PresenceColor
{
    // Dark enough that white initials meet WCAG AA contrast (4.5:1) on every hue, which a test checks.
    private const double Saturation = 0.65;
    private const double Lightness = 0.28;

    public static string For(Guid userKey)
    {
        // Guid.GetHashCode is not guaranteed stable across runtimes; the raw bytes are.
        Span<byte> bytes = stackalloc byte[16];
        userKey.TryWriteBytes(bytes);
        return FromHue(BitConverter.ToUInt32(bytes) % 360);
    }

    internal static string FromHue(double hue)
    {
        var chroma = (1 - Math.Abs((2 * Lightness) - 1)) * Saturation;
        var x = chroma * (1 - Math.Abs((hue / 60 % 2) - 1));
        var m = Lightness - (chroma / 2);

        (double r, double g, double b) = hue switch
        {
            < 60 => (chroma, x, 0d),
            < 120 => (x, chroma, 0d),
            < 180 => (0d, chroma, x),
            < 240 => (0d, x, chroma),
            < 300 => (x, 0d, chroma),
            _ => (chroma, 0d, x),
        };

        return string.Create(CultureInfo.InvariantCulture, $"#{ToByte(r + m):x2}{ToByte(g + m):x2}{ToByte(b + m):x2}");
    }

    private static byte ToByte(double channel) => (byte)Math.Round(channel * 255);
}
