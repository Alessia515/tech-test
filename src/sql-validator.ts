import postgres from 'node-sql-parser/build/postgresql.js';
import { TRIPS_SCHEMA } from '../shared/schema.ts';

export const SQL_MAX_LENGTH = 8_000;
export const RESULT_LIMIT = 500;
export const TRIP_COLUMNS: string[] = TRIPS_SCHEMA.map(([name]) => name);
const parser = new postgres.Parser();
const columns = new Map(TRIP_COLUMNS.map(name => [name.toLowerCase(), name]));
const aggregates = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);
const functions = new Map([
  ['ROUND', [1, 2]], ['ABS', [1, 1]], ['COALESCE', [2, 8]], ['NULLIF', [2, 2]],
  ['DATE_TRUNC', [2, 2]], ['DATE_PART', [2, 2]], ['LOWER', [1, 1]], ['UPPER', [1, 1]],
  ['NOT', [1, 1]],
]);
const operators = new Set(['AND', 'OR', '=', '<>', '!=', '<', '<=', '>', '>=', '+', '-', '*', '/', '%', 'IS', 'IS NOT', 'IN', 'NOT IN', 'LIKE', 'NOT LIKE']);
const castTypes = new Set(['DATE', 'TIMESTAMP', 'VARCHAR', 'INTEGER', 'BIGINT', 'DOUBLE', 'FLOAT', 'BOOLEAN']);
const dateFields = new Set(['YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'DOW', 'ISODOW', 'WEEK', 'QUARTER']);

export class SqlValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'SqlValidationError'; }
}
function fail(message: string): never { throw new SqlValidationError(message); }
// The parser's result is untrusted. Only this module handles its loose AST shape.
type Ast = Record<string, any>;
function object(value: unknown): Ast {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Unsupported SQL structure.');
  return value as Ast;
}
function fields(node: Ast, allowed: string[]) {
  for (const key of Object.keys(node)) if (!allowed.includes(key)) fail(`Unsupported SQL option: ${key}.`);
}
function empty(value: unknown): boolean { return value == null || (Array.isArray(value) && value.length === 0); }
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) fail('Use simple identifiers of up to 63 characters.');
  return value;
}
function quoteId(value: string): string { return `"${identifier(value)}"`; }
function literal(value: unknown): string {
  if (typeof value !== 'string' || value.includes('\0')) fail('Unsupported string literal.');
  return `'${value.replaceAll("'", "''")}'`;
}
function nameValue(value: unknown): string {
  if (typeof value === 'string') return identifier(value);
  const node = object(value);
  fields(node, ['expr']);
  const expr = object(node.expr);
  fields(expr, ['type', 'value']);
  if (!['default', 'double_quote_string'].includes(expr.type)) fail('Unsupported identifier quoting.');
  return identifier(expr.value);
}

/** Parse a restricted SELECT and compile approved nodes; never return raw SQL. */
export function validateSql(sql: unknown): { sql: string; executionSql: string } {
  if (typeof sql !== 'string' || !sql.trim()) fail('Enter a SELECT query.');
  if (sql.length > SQL_MAX_LENGTH) fail(`SQL must be at most ${SQL_MAX_LENGTH} characters.`);
  let parsed: unknown;
  try { parsed = parser.astify(sql); }
  catch { fail('SQL could not be parsed in the supported SELECT subset.'); }
  if (Array.isArray(parsed)) {
    if (parsed.length !== 1) fail('Only one SELECT statement is allowed.');
    parsed = parsed[0];
  }
  const ast = object(parsed);
  if (ast.type !== 'select') fail('Only SELECT queries are allowed.');
  fields(ast, ['type', 'with', 'options', 'distinct', 'columns', 'into', 'from', 'where', 'groupby', 'having', 'orderby', 'limit', 'window']);
  if (!empty(ast.with) || !empty(ast.window) || !empty(ast.options)) fail('CTEs, window functions, and SELECT options are not supported.');
  if (ast.into) { fields(ast.into, ['position']); if (ast.into.position != null) fail('SELECT INTO is not allowed.'); }
  if (!Array.isArray(ast.from) || ast.from.length !== 1) fail('Query exactly one table: trips. Joins and subqueries are not supported.');
  const from = object(ast.from[0]);
  fields(from, ['db', 'table', 'as']);
  if (from.db != null || typeof from.table !== 'string' || from.table.toLowerCase() !== 'trips') fail('Only the local trips table is allowed.');
  const tableAlias = from.as == null ? 'trips' : identifier(from.as);
  if (!Array.isArray(ast.columns) || !ast.columns.length || ast.columns.length > 30) fail('Select between 1 and 30 expressions.');
  const aliases = new Map<string, string>();
  for (const projection of ast.columns) {
    if (projection.as != null) {
      const alias = identifier(projection.as);
      if (aliases.has(alias.toLowerCase())) fail('Duplicate output aliases are not supported.');
      aliases.set(alias.toLowerCase(), alias);
    }
  }
  let nodes = 0;
  function expression(value: unknown, depth = 0, allowStar = false): string {
    if (++nodes > 500 || depth > 20) fail('Query is too complex; simplify its expressions.');
    const node = object(value);
    const next = (child: unknown) => expression(child, depth + 1);
    // Parenthesis metadata is harmless: every binary expression is emitted with parentheses.
    const check = (keys: string[]) => fields(node, [...keys, 'parentheses']);
    switch (node.type) {
      case 'column_ref': {
        check(['type', 'table', 'column', 'collate']);
        if (node.collate != null) fail('COLLATE is not supported.');
        if (node.table != null && String(node.table).toLowerCase() !== tableAlias.toLowerCase()) fail('Unknown table qualifier.');
        if (node.column === '*') { if (!allowStar) fail('Star is only supported in projections or COUNT(*).'); return '*'; }
        const name = nameValue(node.column);
        const known = columns.get(name.toLowerCase()) ?? (node.table == null ? aliases.get(name.toLowerCase()) : undefined);
        if (!known) fail(`Unknown column: ${name}.`);
        return (node.table == null ? '' : `${quoteId(tableAlias)}.`) + quoteId(known);
      }
      case 'number': {
        check(['type', 'value']);
        const value = String(node.value);
        if (!/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) fail('Unsupported numeric literal.');
        return value;
      }
      case 'single_quote_string':
        check(['type', 'value']);
        if (typeof node.value !== 'string' || node.value.includes('\\')) fail('Backslash string escapes are unsupported; use standard SQL quoting.');
        // This parser preserves SQL's doubled apostrophes in its AST value.
        return literal(node.value.replaceAll("''", "'"));
      case 'timestamp': case 'date': check(['type', 'value']); return `${node.type.toUpperCase()} ${literal(node.value)}`;
      case 'null': check(['type', 'value']); if (node.value !== null) fail('Invalid NULL.'); return 'NULL';
      case 'bool': case 'boolean': check(['type', 'value']); if (typeof node.value !== 'boolean') fail('Invalid boolean.'); return node.value ? 'TRUE' : 'FALSE';
      case 'star': check(['type', 'value']); if (!allowStar || node.value !== '*') fail('Unsupported star.'); return '*';
      case 'binary_expr': {
        check(['type', 'operator', 'left', 'right']);
        const op = String(node.operator).toUpperCase();
        if (!operators.has(op)) fail(`Unsupported operator: ${op}.`);
        return `(${next(node.left)} ${op} ${next(node.right)})`;
      }
      case 'unary_expr': {
        check(['type', 'operator', 'expr']);
        const op = String(node.operator).toUpperCase();
        if (!['NOT', '+', '-'].includes(op)) fail('Unsupported unary operator.');
        return `(${op} ${next(node.expr)})`;
      }
      case 'expr_list': {
        check(['type', 'value']);
        if (!Array.isArray(node.value) || !node.value.length || node.value.length > 50) fail('Expression list must have 1–50 items.');
        return `(${node.value.map(next).join(', ')})`;
      }
      case 'aggr_func': {
        check(['type', 'name', 'args', 'over']);
        const name = String(node.name).toUpperCase();
        if (!aggregates.has(name) || node.over != null) fail('Only COUNT, SUM, AVG, MIN, MAX without windows are supported.');
        const args = object(node.args);
        fields(args, ['expr', 'distinct', 'orderby', 'separator']);
        if (!empty(args.orderby) || args.separator != null || (args.distinct != null && args.distinct !== 'DISTINCT')) fail('Unsupported aggregate options.');
        return `${name}(${args.distinct ? 'DISTINCT ' : ''}${expression(args.expr, depth + 1, name === 'COUNT')})`;
      }
      case 'function': {
        check(['type', 'name', 'args']);
        const nameNode = object(node.name);
        fields(nameNode, ['name']);
        if (!Array.isArray(nameNode.name) || nameNode.name.length !== 1) fail('Qualified functions are not allowed.');
        const functionId = object(nameNode.name[0]);
        fields(functionId, ['type', 'value']);
        const name = identifier(functionId.value).toUpperCase();
        const bounds = functions.get(name);
        if (!bounds) fail(`Function ${name} is not allowed.`);
        const args = object(node.args); fields(args, ['type', 'value']);
        if (args.type !== 'expr_list' || !Array.isArray(args.value) || args.value.length < bounds[0] || args.value.length > bounds[1]) fail('Unsupported function argument count.');
        if (name === 'NOT') return `(NOT ${next(args.value[0])})`;
        return `${name}(${args.value.map(next).join(', ')})`;
      }
      case 'cast': {
        check(['type', 'keyword', 'expr', 'symbol', 'target', 'as', 'tail']);
        if (node.tail != null) fail('Unsupported cast suffix.');
        if (!Array.isArray(node.target) || node.target.length !== 1) fail('Unsupported cast.');
        const target = object(node.target[0]); fields(target, ['dataType', 'suffix']);
        const type = String(target.dataType).toUpperCase();
        if (!castTypes.has(type) || !empty(target.suffix)) fail('Unsupported cast type.');
        return `CAST(${next(node.expr)} AS ${type})`;
      }
      case 'extract': {
        check(['type', 'args']); const args = object(node.args);
        fields(args, ['field', 'cast_type', 'source']);
        const field = String(args.field).toUpperCase();
        if (!dateFields.has(field) || args.cast_type != null) fail('Unsupported EXTRACT field.');
        return `EXTRACT(${field} FROM ${next(args.source)})`;
      }
      default: fail(`Unsupported expression: ${String(node.type)}. Simplify the query.`);
    }
  }
  const projections = ast.columns.map((value: unknown) => {
    const node = object(value);
    let emitted: string;
    if (node.type === 'cast') emitted = expression(node);
    else {
      fields(node, ['type', 'expr', 'as']);
      if (node.type != null && node.type !== 'expr') fail('Unsupported projection.');
      emitted = expression(node.expr, 0, true);
    }
    return emitted + (node.as == null ? '' : ` AS ${quoteId(node.as)}`);
  });
  let distinct = '';
  if (ast.distinct != null) {
    fields(ast.distinct, ['type']);
    if (ast.distinct.type != null && ast.distinct.type !== 'DISTINCT') fail('DISTINCT ON is unsupported.');
    if (ast.distinct.type) distinct = 'DISTINCT ';
  }
  let output = `SELECT ${distinct}${projections.join(', ')} FROM "trips" AS ${quoteId(tableAlias)}`;
  if (ast.where != null) output += ` WHERE ${expression(ast.where)}`;
  if (ast.groupby != null) {
    fields(ast.groupby, ['columns']);
    if (!Array.isArray(ast.groupby.columns) || !ast.groupby.columns.length) fail('Unsupported grouping.');
    output += ` GROUP BY ${ast.groupby.columns.map((node: unknown) => expression(node)).join(', ')}`;
  }
  if (ast.having != null) output += ` HAVING ${expression(ast.having)}`;
  if (ast.orderby != null) {
    if (!Array.isArray(ast.orderby) || ast.orderby.length > 30) fail('Unsupported sorting.');
    output += ` ORDER BY ${ast.orderby.map((node: Ast) => {
      fields(node, ['expr', 'type', 'nulls']);
      if (node.type != null && !['ASC', 'DESC'].includes(node.type)) fail('Unsupported sort direction.');
      if (node.nulls != null) fail('Explicit NULLS ordering is unsupported.');
      return expression(node.expr) + (node.type ? ` ${node.type}` : '');
    }).join(', ')}`;
  }
  if (ast.limit != null) {
    fields(ast.limit, ['seperator', 'value']);
    const values = ast.limit.value;
    if (!Array.isArray(values) || values.length > 1 || !['', undefined].includes(ast.limit.seperator)) fail('OFFSET and compound LIMIT are unsupported.');
    if (values.length) {
      const limit = expression(values[0]);
      if (!/^\d+$/.test(limit) || Number(limit) > 100_000) fail('LIMIT must be an integer between 0 and 100000.');
      output += ` LIMIT ${limit}`;
    }
  }
  return { sql: output, executionSql: `SELECT * FROM (${output}) AS "__result" LIMIT ${RESULT_LIMIT + 1}` };
}
