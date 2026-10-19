import type { WhoIsHereFieldContext } from './field.property-context.js';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

export const WHOISHERE_FIELD_CONTEXT = new UmbContextToken<WhoIsHereFieldContext>('WhoIsHere.PropertyContext.Field');
