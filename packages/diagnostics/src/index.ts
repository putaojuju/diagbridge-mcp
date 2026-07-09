export function getMockSystemOverview() {
  return {
    mock: true,
    hostname: "FRIEND-PC-MOCK",
    os: "Windows 11 Pro",
    architecture: "x64",
    uptimeSeconds: 123456,
    isAdmin: false,
    visibleAgent: true,
    note: "Phase 1 mock data. No local command was executed.",
  };
}

export function runMockNetworkDiagnosis(targetHost = "example.com") {
  return {
    mock: true,
    targetHost,
    dnsResolution: "not-run-mock-success",
    gatewayReachable: "not-run-mock-success",
    internetReachable: "not-run-mock-success",
    packetCapture: false,
    note: "Phase 1 mock data. No ping, packet capture, or PowerShell command was executed.",
  };
}

export function collectMockDiagnosticReport(sections: string[] = ["system", "network"]) {
  return {
    mock: true,
    reportId: `mock-report-${Date.now()}`,
    sections,
    containsFiles: false,
    containsCredentials: false,
    note: "Phase 1 creates report metadata only.",
  };
}
