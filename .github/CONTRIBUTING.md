# Contributing Guidelines

Contributions to this package are most welcome!

There is a test site in the solution to make working with this repository easier.
It is configured to do an unattended install with SQLite, check `appsettings.Development.json` for the login details.

To see presence you need two different backoffice users in two separate browser sessions (for example one normal window and one private window). Create a second user in the test site's backoffice first.

## Building

```bash
# Client, from src/Umbraco.Community.WhoIsHere/Client
npm install
npm run build        # or: npm run watch

# Server and tests, from the repository root
dotnet build src/Umbraco.Community.WhoIsHere.slnx
dotnet test --project src/Umbraco.Community.WhoIsHere.Tests
```
