const fs = require("fs");
const path = require("path");
const babylon = require("babylon");
const traverse = require("babel-traverse").default;
const babel = require("babel-core");

let ID = 0;

function createAsset(filename) {
  const content = fs.readFileSync(filename, "utf-8");

  const ast = babylon.parse(content, { sourceType: "module" });

  const deps = [];

  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      deps.push(node.source.value);
    },
  });

  const id = ID++;

  const { code } = babel.transformFromAst(ast, null, {
    presets: ["env"],
  });

  return {
    id,
    filename,
    deps,
    code,
  };
}

function createGraph(entry) {
  const mainAsset = createAsset(entry);

  const queue = [mainAsset];

  for (const asset of queue) {
    const dirname = path.dirname(asset.filename);

    asset.mapping = {};

    asset.deps.forEach((relativePath) => {
      const absolutePath = path.join(dirname, relativePath);
      const child = createAsset(absolutePath);

      asset.mapping[relativePath] = child.id;

      queue.push(child);
    });
  }

  return queue;
}

function bundle(graph) {
  let modules = "";

  graph.forEach((mod) => {
    modules += `${mod.id}: [
        function (require, module, exports) {
          ${mod.code}
        },
        ${JSON.stringify(mod.mapping)},
      ],`;
  });

  const result = `
    (function(modules) {

      function require(id) {
        const [fn, mapping] = modules[id];

        function localRequire(name) {
          return require(mapping[name]);
        }

        const module = { exports : {} };

        fn(localRequire, module, module.exports);

        return module.exports;
      }

      require(0);

    })({${modules}})
  `;

  return result;
}

const graph = createGraph("src/entry.js");

const result = bundle(graph);

console.log(result);
