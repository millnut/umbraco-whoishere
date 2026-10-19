namespace Umbraco.Community.WhoIsHere.Models;

/// <summary>
/// The field a user is working in, so other editors can see it highlighted.
/// </summary>
/// <param name="FieldId">
/// Identifies the field: the key of the document or block that owns the value, plus the property alias and variant.
/// Built the same way on every client, so it matches across browsers.
/// </param>
/// <param name="AncestorIds">
/// The fields containing this one, outermost first, such as the block list a block property sits in.
/// Lets those containers show that someone is working inside them.
/// </param>
/// <param name="Labels">Display labels from the outermost container to the field, e.g. "Content", "Hero", "Heading".</param>
public sealed record PresenceLocation(string FieldId, IReadOnlyList<string> AncestorIds, IReadOnlyList<string> Labels)
{
    // Records compare collections by reference; the store relies on value equality to spot real changes.
    public bool Equals(PresenceLocation? other) =>
        other is not null
        && FieldId == other.FieldId
        && AncestorIds.SequenceEqual(other.AncestorIds)
        && Labels.SequenceEqual(other.Labels);

    public override int GetHashCode() => HashCode.Combine(FieldId, AncestorIds.Count, Labels.Count);
}
