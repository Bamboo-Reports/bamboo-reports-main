// Stand-in for the "server-only" package under vitest. See resolve.alias in
// vitest.config.ts. The real package throws on import to enforce the
// server/client boundary at build time, which is not a concern in tests.
export {}
