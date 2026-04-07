/**
 * Agent Mode: AI-friendly command parsing and error handling
 * 
 * Design goals:
 * 1. Be maximally flexible when intent is clear but syntax has minor issues
 * 2. Provide detailed, actionable error messages with examples
 * 3. Guide agents toward correct command patterns
 */



export type IntentResult =
  | { type: "success"; normalized: string[]; note?: string }
  | { type: "ambiguous"; suggestions: string[]; error: string }
  | { type: "unknown"; error: string };

export type CommandExample = {
  command: string;
  description: string;
  context: string;
};

export type ErrorHelp = {
  message: string;
  likelyIntent: string;
  examples: CommandExample[];
  fixHint: string;
};

// Common flag typos and normalizations
const FLAG_ALIASES: Record<string, string> = {
  // Network/security
  "--net": "--network",
  "-n": "--network",
  "--online": "--network",
  "--ua": "--user-agent",
  "-ua": "--user-agent",
  
  // Output
  "--j": "--json",
  "-j": "--json",
  "--p": "--plain",
  "-p": "--plain",
  "--out": "--output",
  "-o": "--output",
  
  // Auth
  "--a": "--auth",
  "-a": "--auth",
  "--authenticated": "--auth",
  
  // Preview
  "--dry-run": "--print-request",
  "--preview": "--print-request",
  "--dryrun": "--print-request",
  
  // Interaction
  "--ci": "--non-interactive",
  "--no-prompt": "--non-interactive",
  "--batch": "--non-interactive",
  
  // Agent mode
  "--robot": "--agent",
  "--ai": "--agent",
  "--auto": "--agent",
};

// Common misplacements and how to fix them
interface IntentPattern {
  pattern: RegExp;
  command: string;
  transform: (matches: RegExpMatchArray) => string[];
  description: string;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // "wsearch get Q42" -> "wsearch entity get Q42"
  {
    pattern: /^\s*(?:wsearch\s+)?(get|fetch|show)\s+([QPL]\d+)/i,
    command: "entity get",
    transform: (m) => {
      const id = m[2];
      if (!id) return ["entity", "get", "Q42"];
      return ["entity", "get", id.toUpperCase()];
    },
    description: "Fetch entity by ID"
  },
  // "wsearch statements Q42" -> "wsearch entity statements Q42"
  {
    pattern: /^\s*(?:wsearch\s+)?(statements|props|properties)\s+([QPL]\d+)/i,
    command: "entity statements",
    transform: (m) => {
      const id = m[2];
      if (!id) return ["entity", "statements", "Q42"];
      return ["entity", "statements", id.toUpperCase()];
    },
    description: "Fetch entity statements"
  },
  // "wsearch search Paris" -> "wsearch action search --query Paris"
  {
    pattern: /^\s*(?:wsearch\s+)?search\s+(.+)$/i,
    command: "action search",
    transform: (m) => {
      const query = m[1];
      if (!query) return ["action", "search", "--query", ""];
      return ["action", "search", "--query", query.trim()];
    },
    description: "Search for entities"
  },
  // "wsearch sparql file.rq" -> "wsearch sparql query --file file.rq"
  {
    pattern: /^\s*(?:wsearch\s+)?sparql\s+(\S+\.rq|\S+\.sparql)$/i,
    command: "sparql query --file",
    transform: (m) => {
      const file = m[1];
      if (!file) return ["sparql", "query", "--file", ""];
      return ["sparql", "query", "--file", file];
    },
    description: "Run SPARQL from file"
  },
];

/**
 * Try to parse agent intent from raw command arguments
 */
export function parseAgentIntent(args: string[]): IntentResult {
  const joined = args.join(" ");
  
  // Check for explicit intent patterns first
  for (const { pattern, transform, command } of INTENT_PATTERNS) {
    const match = joined.match(pattern);
    if (match?.[0]) {
      const normalized = transform(match);
      return {
        type: "success",
        normalized,
        note: `Corrected "${command}" command syntax. Use \`wsearch entity get <id>\` format for clarity.`,
      };
    }
  }
  
  // Try normalizing subcommands
  const normalizedArgs = [...args];
  let note: string | undefined;
  
  // Normalize known flag typos
  for (let i = 0; i < normalizedArgs.length; i++) {
    const arg = normalizedArgs[i];
    if (arg && (arg.startsWith("--") || arg.startsWith("-"))) {
      const normalized = FLAG_ALIASES[arg.toLowerCase()];
      if (normalized && normalized !== arg) {
        normalizedArgs[i] = normalized;
        note = `Normalized flag "${arg}" to "${normalized}". Use the standard form in the future.`;
      }
    }
  }
  
  // Return with note only if it's defined
  const result: IntentResult = { type: "success", normalized: normalizedArgs };
  if (note) {
    result.note = note;
  }
  return result;
}

/**
 * Get help for a specific error scenario
 */
export function getErrorHelp(
  errorCode: string,
  errorMessage: string,
  _attemptedCommand?: string
): ErrorHelp {
  // Pattern-based error recognition
  
  if (errorMessage.includes("Invalid entity id") || errorMessage.includes("Q*")) {
    return {
      message: errorMessage,
      likelyIntent: "Fetch a Wikidata entity",
      examples: [
        {
          command: "wsearch --network --user-agent \"MyApp/1.0\" entity get Q42",
          description: "Get entity by Q-id",
          context: "Q42 = Douglas Adams",
        },
        {
          command: "wsearch --network entity get P31",
          description: "Get property by P-id",
          context: "P31 = instance of",
        },
        {
          command: "wsearch --network entity get L123",
          description: "Get lexeme by L-id",
          context: "Lexeme for dictionary entries",
        },
      ],
      fixHint: "Entity IDs must be Q* (items), P* (properties), or L* (lexemes) followed by digits. Check your ID format.",
    };
  }
  
  if (errorMessage.includes("Path must start with") || errorMessage.includes("traversal")) {
    return {
      message: errorMessage,
      likelyIntent: "Make a raw API request",
      examples: [
        {
          command: "wsearch --network raw request GET /entities/items/Q42",
          description: "Get entity via REST",
          context: "Direct API access",
        },
        {
          command: "wsearch --network raw request GET /entities/properties/P31",
          description: "Get property via REST",
          context: "Property lookup",
        },
      ],
      fixHint: "Raw request paths must start with '/' and cannot contain '..' or encoded separators like %2F.",
    };
  }
  
  if (errorMessage.includes("Network access is disabled") || errorCode === "E_POLICY") {
    return {
      message: errorMessage,
      likelyIntent: "Query Wikidata API",
      examples: [
        {
          command: "wsearch --network --user-agent \"MyApp/1.0\" entity get Q42",
          description: "Basic entity query",
          context: "Always requires --network",
        },
        {
          command: "wsearch --network --user-agent \"MyApp/1.0\" sparql query --file query.rq",
          description: "SPARQL query",
          context: "Network required for all API calls",
        },
      ],
      fixHint: "All API calls require --network flag (opt-in for safety). Also set --user-agent for Wikimedia APIs.",
    };
  }
  
  if (errorMessage.includes("User-Agent is required")) {
    return {
      message: errorMessage,
      likelyIntent: "Query Wikidata API",
      examples: [
        {
          command: "wsearch --network --user-agent \"MyApp/1.0 (contact@example.com)\" entity get Q42",
          description: "Query with User-Agent",
          context: "Wikimedia API requirement",
        },
        {
          command: "export WIKI_USER_AGENT=\"MyApp/1.0\" \u0026\u0026 wsearch --network entity get Q42",
          description: "Set UA via environment",
          context: "Avoid repeating the flag",
        },
        {
          command: "wsearch config set user-agent \"MyApp/1.0\"",
          description: "Persist User-Agent",
          context: "Set once, use always",
        },
      ],
      fixHint: "Wikimedia APIs require a User-Agent. Use --user-agent flag, WIKI_USER_AGENT env var, or `wsearch config set user-agent`.",
    };
  }
  
  if (errorMessage.includes("No stored token") || errorCode === "E_AUTH") {
    return {
      message: errorMessage,
      likelyIntent: "Make authenticated API request",
      examples: [
        {
          command: "export WIKI_TOKEN=\"your_token\" \u0026\u0026 export WIKI_PASSPHRASE=\"your_passphrase\" \u0026\u0026 wsearch auth login",
          description: "Store encrypted token",
          context: "One-time setup",
        },
        {
          command: "wsearch --network --auth --user-agent \"MyApp/1.0\" entity get Q42",
          description: "Use stored token",
          context: "Adds Authorization header",
        },
        {
          command: "wsearch --network --user-agent \"MyApp/1.0\" entity get Q42",
          description: "Unauthenticated request",
          context: "Most queries work without auth",
        },
      ],
      fixHint: "Run `wsearch auth login` first to store a token, or omit --auth for unauthenticated requests.",
    };
  }
  
  if (errorMessage.includes("Query input required")) {
    return {
      message: errorMessage,
      likelyIntent: "Run a SPARQL query",
      examples: [
        {
          command: "wsearch --network sparql query --file query.rq",
          description: "Query from file",
          context: "Recommended for complex queries",
        },
        {
          command: "wsearch --network sparql query --query 'SELECT * WHERE { ?s ?p ?o } LIMIT 10'",
          description: "Inline query",
          context: "For simple queries",
        },
        {
          command: "cat query.rq | wsearch --network sparql query",
          description: "Query via stdin",
          context: "Pipeline-friendly",
        },
      ],
      fixHint: "Provide SPARQL via --file, --query, or stdin. Use --file for complex queries stored in .rq files.",
    };
  }
  
  if (errorMessage.includes("Provide only one")) {
    return {
      message: errorMessage,
      likelyIntent: "Provide input from a single source",
      examples: [
        {
          command: "wsearch auth login --token-env WIKI_TOKEN",
          description: "Token from env",
          context: "CI/CD friendly",
        },
        {
          command: "cat token.txt | wsearch auth login --token-stdin",
          description: "Token from file via stdin",
          context: "Secure file reading",
        },
        {
          command: "wsearch auth login --token-file ./token.txt",
          description: "Token from file",
          context: "Direct file path",
        },
      ],
      fixHint: "Choose one input method: --token-file, --token-stdin, or --token-env. Same for passphrase.",
    };
  }
  
  if (errorMessage.includes("must be a valid http(s) URL")) {
    return {
      message: errorMessage,
      likelyIntent: "Configure custom API endpoint",
      examples: [
        {
          command: "wsearch config set api-url https://www.wikidata.org/w/rest.php/wikibase/v1",
          description: "Set REST API URL",
          context: "Default endpoint",
        },
        {
          command: "wsearch config set sparql-url https://query.wikidata.org/sparql",
          description: "Set SPARQL endpoint",
          context: "Default endpoint",
        },
      ],
      fixHint: "URLs must start with http:// or https:// and be valid URL format. Check for typos.",
    };
  }
  
  // Default/generic error help
  return {
    message: errorMessage,
    likelyIntent: "Execute a wsearch command",
    examples: [
      {
        command: "wsearch --help",
        description: "Show all commands",
        context: "General help",
      },
      {
        command: "wsearch entity get Q42 --help",
        description: "Show command-specific help",
        context: "Detailed flag reference",
      },
      {
        command: "wsearch doctor",
        description: "Check configuration",
        context: "Diagnose setup issues",
      },
    ],
    fixHint: "Check command syntax with --help. Use `wsearch doctor` to verify your setup.",
  };
}

/**
 * Format error help for agent consumption
 */
export function formatAgentError(help: ErrorHelp, agentMode: boolean): string {
  const lines: string[] = [];
  
  lines.push(`Error: ${help.message}`);
  lines.push("");
  lines.push(`Likely intent: ${help.likelyIntent}`);
  lines.push("");
  lines.push("Correct examples:");
  
  for (const ex of help.examples) {
    lines.push(`  $ ${ex.command}`);
    lines.push(`    # ${ex.description} (${ex.context})`);
  }
  
  lines.push("");
  lines.push(`Fix: ${help.fixHint}`);
  
  if (agentMode) {
    lines.push("");
    lines.push("Agent note: When scripting, use --non-interactive and --json for reliable output parsing.");
  }
  
  return lines.join("\n");
}

/**
 * Check if an argument looks like an entity ID that needs normalization
 */
export function normalizeEntityId(input: string): string | null {
  const trimmed = input.trim();
  // Allow lowercase q/p/l
  const match = trimmed.match(/^([qpl])([\d]+)$/i);
  if (match?.[1] && match?.[2]) {
    return match[1].toUpperCase() + match[2];
  }
  return null;
}

/**
 * Try to fix common flag ordering issues
 */
export function fixFlagOrder(args: string[]): string[] {
  const result: string[] = [];
  const flags: string[] = [];
  const positional: string[] = [];
  
  for (const arg of args) {
    if (arg.startsWith("--") || (arg.startsWith("-") && arg.length > 1 && !arg.startsWith("- "))) {
      // It's a flag (but not a negative number)
      if (/^-\d+$/.test(arg)) {
        positional.push(arg);
      } else {
        flags.push(arg);
      }
    } else {
      positional.push(arg);
    }
  }
  
  // Global flags first, then positional
  return [...flags, ...positional];
}

/**
 * Suggest corrections for unknown commands
 */
export function suggestCommand(attempted: string): string[] {
  const suggestions: string[] = [];
  const lower = attempted.toLowerCase();
  
  // Fuzzy match to known commands
  const knownCommands = ["entity", "auth", "config", "sparql", "action", "raw", "doctor", "help"];
  for (const cmd of knownCommands) {
    if (cmd.startsWith(lower) || lower.startsWith(cmd)) {
      suggestions.push(cmd);
    }
    // Levenshtein distance of 1
    if (levenshtein(lower, cmd) <= 2) {
      suggestions.push(cmd);
    }
  }
  
  return [...new Set(suggestions)].slice(0, 3);
}

// Simple Levenshtein distance for fuzzy matching
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const charB = b.charAt(i - 1);
      const charA = a.charAt(j - 1);
      if (charB === charA) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        const deletion = matrix[i]![j - 1]! + 1;
        const insertion = matrix[i - 1]![j]! + 1;
        const substitution = matrix[i - 1]![j - 1]! + 1;
        matrix[i]![j] = Math.min(deletion, Math.min(insertion, substitution));
      }
    }
  }

  return matrix[b.length]?.[a.length] ?? 0;
}
