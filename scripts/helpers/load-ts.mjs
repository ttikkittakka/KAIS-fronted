import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

const cache = new Map();
// Match the app's extensionless TS imports without adding a test dependency.
export function loadTs(file) {
  const path = file instanceof URL ? fileURLToPath(file) : file;
  if (cache.has(path)) return cache.get(path).exports;
  const loaded = { exports: {} };
  cache.set(path, loaded);
  const nativeRequire = createRequire(path);
  const require = name => name.startsWith('.') ? loadTs(resolve(dirname(path), name + '.ts')) : nativeRequire(name);
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInThisContext(`(function(require, module, exports) { ${compiled}\n})`, { filename: path })(require, loaded, loaded.exports);
  return loaded.exports;
}
