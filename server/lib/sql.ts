import { sql, getTableName, type Column } from 'drizzle-orm';

/**
 * A column reference that is always table-qualified ("table"."column").
 *
 * Drizzle drops the table name from column references inside the select fields of a
 * single-table query, so `${tracks.id}` inside a correlated subquery such as
 * `(select count(*) from topics where topics.track_id = ${tracks.id})` would render as
 * a bare "id" and silently bind to the inner table. Use `${ref(tracks.id)}` there.
 */
export function ref(column: Column) {
  // The database client uses casing: 'snake_case', so camelCase keys map to snake_case columns
  // unless the schema gave the column an explicit name.
  const name = column.keyAsName ? column.name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`) : column.name;
  return sql.raw(`"${getTableName(column.table)}"."${name}"`);
}
