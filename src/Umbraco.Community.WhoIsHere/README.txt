== Requirements ==
* Node LTS Version 22+
* Use a tool such as NVM (Node Version Manager) for your OS to help manage multiple versions of Node

== Steps ==
* Open a terminal inside the `\Client` folder
* Run `npm install` to install all the dependencies
* Run `npm run build` to build the project
* The build output is copied to `wwwroot\App_Plugins\WhoIsHere\whoishere.js`

== File Watching ==
* Run the Umbraco.Community.WhoIsHere.TestSite project, which references this Razor Class Library
* From the `\Client` folder run the command `npm run watch` this will monitor the changes to the *.ts files and rebuild the project

== Other Resources ==
* Umbraco Docs - https://docs.umbraco.com/umbraco-cms/customizing/overview
