export interface DetectionDetails {
  flagsTriggered: string[];
  toolCallsAttempted: string[];
  memoryWritesAttempted: string[];
  fabricatedEntities: string[];
  suspiciousUrls: string[];
}

export interface AttackResult {
  agentResponse: string;
  attackSucceeded: boolean;
  defenseLog: string[];
  detectionDetails: DetectionDetails;
}

export interface AttackErrorResult {
  error: string;
  agentResponse: null;
  attackSucceeded: false;
  defenseLog: [];
  detectionDetails: DetectionDetails;
}

export interface SanitizeResult {
  cleaned: string;
  stripped: string[];
}

export interface OutputValidationResult {
  passed: boolean;
  flags: string[];
}

export type AttackType = 'email' | 'document' | 'search' | 'bing';

export interface TabResult {
  withoutDefense: AttackResult | null;
  withDefense: AttackResult | null;
}

export function emptyDetectionDetails(): DetectionDetails {
  return {
    flagsTriggered: [],
    toolCallsAttempted: [],
    memoryWritesAttempted: [],
    fabricatedEntities: [],
    suspiciousUrls: [],
  };
}

export function errorResult(message: string): AttackErrorResult {
  return {
    error: message,
    agentResponse: null,
    attackSucceeded: false,
    defenseLog: [],
    detectionDetails: emptyDetectionDetails(),
  };
}
