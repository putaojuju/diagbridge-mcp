import type { DiagnosticToolName, RiskLevel } from "@diagbridge/core";

export interface DiagnosticPlaybook {
  id: string;
  title: string;
  summary: string;
  maxRisk: RiskLevel;
  tools: DiagnosticToolName[];
}

export const PLAYBOOKS: DiagnosticPlaybook[] = [
  {
    id: "network-basic-readonly",
    title: "Basic network diagnosis",
    summary: "Collect a mock system overview and mock network diagnosis without repairs.",
    maxRisk: "green",
    tools: ["get_system_overview", "run_network_diagnosis"],
  },
  {
    id: "bounded-log-review",
    title: "Bounded log review",
    summary: "Search selected logs with redaction and explicit privacy notices.",
    maxRisk: "blue",
    tools: ["list_allowed_roots", "search_logs"],
  },
];
