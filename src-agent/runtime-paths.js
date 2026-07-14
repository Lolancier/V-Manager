import path from "node:path";

export function getAgentPaths(baseDir) {
  const dataDir = path.join(baseDir, "agent-data");
  const memoryDir = path.join(dataDir, "memory");
  const ragDir = path.join(dataDir, "rag");
  const registryDir = path.join(dataDir, "registry");

  return {
    dataDir,
    configPath: path.join(dataDir, "config.json"),
    memoryDir,
    memoryPath: path.join(memoryDir, "conversation.jsonl"),
    knowledgeDir: path.join(dataDir, "knowledge"),
    ragDir,
    ragConfigPath: path.join(ragDir, "config.json"),
    ragIndexPath: path.join(ragDir, "index.json"),
    registryDir,
    appRegistryPath: path.join(registryDir, "apps.json")
  };
}
