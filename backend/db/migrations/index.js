/**
 * Migration registry — import all migrations here in version order.
 * To add a new migration:
 *   1. Create db/migrations/NNN_description.js
 *   2. Add it to the array below
 */
import * as m001 from './001_baseline.js'
import * as m002 from './002_add_client_loans.js'

export const migrations = [m001, m002]
