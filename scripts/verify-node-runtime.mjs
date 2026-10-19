const nodeMajor = Number(process.versions.node.split(".", 1)[0]);
if (nodeMajor !== 24) {
  console.error(`GuardRails web builds require Node.js 24.x; detected ${process.versions.node}. Use .nvmrc or the repository's CI runtime.`);
  process.exit(1);
}
