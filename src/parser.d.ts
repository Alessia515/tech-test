declare module 'node-sql-parser/build/postgresql.js' {
  const postgres: { Parser: new () => { astify(sql: string): unknown } };
  export default postgres;
}
