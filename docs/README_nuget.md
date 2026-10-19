# WhoIsHere

[![Downloads](https://img.shields.io/nuget/dt/Umbraco.Community.WhoIsHere?color=cc9900)](https://www.nuget.org/packages/Umbraco.Community.WhoIsHere/)
[![NuGet](https://img.shields.io/nuget/vpre/Umbraco.Community.WhoIsHere?color=0273B3)](https://www.nuget.org/packages/Umbraco.Community.WhoIsHere)
[![GitHub license](https://img.shields.io/github/license/millnut/umbraco-whoishere?color=8AB803)](https://github.com/millnut/umbraco-whoishere/blob/main/LICENSE)

Shows, live on the document edit screen, which other backoffice users have the same document open, and which field each of them is in. It is a soft lock: it warns but never blocks editing or saving.

- Avatars of the other editors in the workspace footer, each in their own colour, with a list of where they are.
- A chip under the label of the field someone is in, including fields inside blocks.
- A notice when someone else saves the document you have open, with a Reload button.

Requires Umbraco 18.

## Installation

```bash
dotnet add package Umbraco.Community.WhoIsHere
```

No other steps are needed. Optional settings go in the `WhoIsHere` section of `appsettings.json`; see the [documentation on GitHub](https://github.com/millnut/umbraco-whoishere) for those, load balancing notes and known limitations.
