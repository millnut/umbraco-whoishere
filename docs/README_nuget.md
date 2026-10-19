# WhoIsHere

[![Downloads](https://img.shields.io/nuget/dt/Umbraco.Community.WhoIsHere?color=cc9900)](https://www.nuget.org/packages/Umbraco.Community.WhoIsHere/)
[![NuGet](https://img.shields.io/nuget/vpre/Umbraco.Community.WhoIsHere?color=0273B3)](https://www.nuget.org/packages/Umbraco.Community.WhoIsHere)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Shows, live on the document edit screen, which other backoffice users have the same document open, and which field each of them is in. It is a soft lock: it warns but never blocks editing or saving.

- Avatars of the other editors in the workspace footer, each in their own colour, with a list of where they are.
- A chip under the label of the field someone is in, including fields inside blocks.
- A notice when someone else saves the document you have open, with a Reload button.

Requires Umbraco 18.

## Installation

```bash
dotnet add package Umbraco.Community.WhoIsHere
```

No other steps are needed.

## Configuration

Everything is optional. Defaults:

```json
{
  "WhoIsHere": {
    "Enabled": true,
    "HeartbeatSeconds": 20,
    "TimeoutSeconds": 60
  }
}
```

| Setting | Meaning |
|---|---|
| `Enabled` | `false` skips registration entirely. The hub is not mapped, and the client quietly shows nothing. |
| `HeartbeatSeconds` | How often each open document tells the server it is still there. The client reads this value from the server, so you only set it in one place. |
| `TimeoutSeconds` | How long a presence can go without a heartbeat before it is dropped. This only matters for clients that vanish without disconnecting, such as a frozen tab or a sleeping laptop. Closing a tab normally clears the presence within a second. |

The sweeper runs every `TimeoutSeconds / 4`, so a dead client lingers for up to 25% longer than the timeout. With the defaults that is 60–75 seconds.

## Known limitations

- Single server only by default; see Load balancing below.
- Presence is per document, not per culture or variant.
- If two people save at almost the same moment, the save notice may name the wrong person or not appear.
- Someone who loses access to a document while it is open keeps seeing who else is there until they leave it.
- Field highlighting adds its chip to Umbraco's property markup directly, as there is no extension point for it. A future Umbraco change to that markup could break the highlighting, but presence and the footer would keep working.
- Block names in modals are read from the modal title, so occasionally the block's type name is shown instead.
- Field highlighting follows keyboard focus, so fields that never take focus don't show a chip.
- Only documents are supported, not media or members.

## Load balancing

Presence is held in memory on each server, so a load-balanced backoffice needs a SignalR backplane (such as Redis or Azure SignalR Service) and a shared `IPresenceStore`. Register your store before WhoIsHere's composer runs and it will be used instead.
