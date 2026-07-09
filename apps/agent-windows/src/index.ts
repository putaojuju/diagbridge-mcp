export interface WindowsAgentStatus {
  agentId: string;
  platform: "windows";
  visibleToUser: boolean;
  hiddenModeAvailable: false;
  runsAsAdminByDefault: false;
  rawShellAvailable: false;
  credentialCollectionAvailable: false;
  capabilities: string[];
}

export function getMockWindowsAgentStatus(): WindowsAgentStatus {
  return {
    agentId: "mock-windows-agent",
    platform: "windows",
    visibleToUser: true,
    hiddenModeAvailable: false,
    runsAsAdminByDefault: false,
    rawShellAvailable: false,
    credentialCollectionAvailable: false,
    capabilities: [
      "mock-system-overview",
      "mock-network-diagnosis",
      "mock-allowed-roots",
      "mock-diagnostic-report",
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(getMockWindowsAgentStatus(), null, 2));
  console.log("Phase 1 Windows Agent does not execute commands or read local files.");
}
