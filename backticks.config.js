// This file only exists because Biome doesn't want to acknowledge that
// templating strings are just strings if there's no templating tag,
// and no substitution syntax. That's fucking idiotic, and code should
// use one string format for all strings: the JIT compiler knows
// damn well that strings are immutable and to store strings as,
// unsurprisingly, strings when there is no templating syntax.

export default [
  {
    ignores: [`node_modules/**`],
  },
  {
    files: [`**/*.js`],
    rules: {
      quotes: [`error`, `backtick`],
    },
  },
];
