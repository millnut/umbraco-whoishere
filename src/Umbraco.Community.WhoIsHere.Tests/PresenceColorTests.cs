using System.Globalization;
using Umbraco.Community.WhoIsHere.Models;

namespace Umbraco.Community.WhoIsHere.Tests;

public class PresenceColorTests
{
    [Fact]
    public void Same_key_always_gets_the_same_colour()
    {
        var key = Guid.Parse("1e5a5a3c-7d1f-4d0e-9c62-1f3b0a6e2b9d");

        Assert.Equal(PresenceColor.For(key), PresenceColor.For(key));
    }

    [Fact]
    public void Colour_is_a_hex_value()
    {
        Assert.Matches("^#[0-9a-f]{6}$", PresenceColor.For(Guid.NewGuid()));
    }

    [Fact]
    public void Different_users_usually_get_different_colours()
    {
        var colours = Enumerable.Range(0, 50).Select(_ => PresenceColor.For(Guid.NewGuid())).Distinct().Count();

        Assert.True(colours > 30, $"Only {colours} distinct colours for 50 users");
    }

    [Fact]
    public void White_initials_meet_wcag_aa_contrast_on_every_hue()
    {
        for (var hue = 0; hue < 360; hue++)
        {
            var colour = PresenceColor.FromHue(hue);
            var contrast = 1.05 / (RelativeLuminance(colour) + 0.05);

            Assert.True(contrast >= 4.5, $"Hue {hue} ({colour}) has contrast {contrast:F2} against white");
        }
    }

    private static double RelativeLuminance(string hex)
    {
        double Channel(int offset)
        {
            var value = int.Parse(hex.AsSpan(offset, 2), NumberStyles.HexNumber) / 255.0;
            return value <= 0.03928 ? value / 12.92 : Math.Pow((value + 0.055) / 1.055, 2.4);
        }

        return (0.2126 * Channel(1)) + (0.7152 * Channel(3)) + (0.0722 * Channel(5));
    }
}
