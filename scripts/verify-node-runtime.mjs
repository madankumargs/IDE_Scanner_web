const nodeMajor = Number(process.versions.node.split(".", 1)[0]);
if (nodeMajor !== 22) {
  console.error(`GuardRails web builds require Node.js 22.x; detected ${process.versions.node}. Use .nvmrc or the repository's CI runtime.`);
  process.exit(1);
}
