import type { WhoIsHereConnectionContext } from './connection.context.js';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

export const WHOISHERE_CONNECTION_CONTEXT = new UmbContextToken<WhoIsHereConnectionContext>('WhoIsHere.Context.Connection');
