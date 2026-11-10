// Lets a script run app modules from src/ with plain Node (Node 22.6+ runs TypeScript directly): the
// app imports its own files without the .ts extension (Vite resolves them), so a relative import
// that does not resolve as written is tried again with .ts. Used as: node --import ./scripts/ts-resolve.mjs
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
