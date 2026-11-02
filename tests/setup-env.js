// Loaded before anything else (jest.setupFiles). Forces test env so the
// logger stays silent and other env-dependent behaviour is test-safe.
process.env.NODE_ENV = 'test';
