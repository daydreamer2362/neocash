type HostRule = {
  hostname: string;
  wildcard: boolean;
  protocol?: string;
  requirePortMatch: boolean;
  port: string;
};

type ParsedRule = {
  allowAll: boolean;
  exactOrigin?: string;
  hostRule?: HostRule;
};

export type OriginPolicy = {
  allowAll: boolean;
  configuredOrigins: string[];
  isAllowed: (origin: string) => boolean;
};

const normalizeString = (value: string): string =>
  String(value || '').trim().replace(/\/+$/, '').toLowerCase();

export const normalizeOrigin = (origin: string): string => {
  const normalized = normalizeString(origin);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`.toLowerCase();
  } catch {
    return normalized;
  }
};

const splitCsv = (value: string | undefined): string[] =>
  String(value || '')
    .split(',')
    .map((item) => normalizeString(item))
    .filter(Boolean);

const splitHostPort = (value: string): { hostname: string; hasPort: boolean; port: string } => {
  const input = normalizeString(value).split(/[/?#]/)[0];
  if (!input) return { hostname: '', hasPort: false, port: '' };

  if (input.startsWith('[')) {
    const end = input.indexOf(']');
    if (end < 0) return { hostname: input, hasPort: false, port: '' };
    const host = input.slice(1, end);
    const rest = input.slice(end + 1);
    if (rest.startsWith(':') && /^\d+$/.test(rest.slice(1))) {
      return { hostname: host, hasPort: true, port: rest.slice(1) };
    }
    return { hostname: host, hasPort: false, port: '' };
  }

  const pieces = input.split(':');
  if (pieces.length === 2 && /^\d+$/.test(pieces[1])) {
    return { hostname: pieces[0], hasPort: true, port: pieces[1] };
  }

  return { hostname: input, hasPort: false, port: '' };
};

const parseRule = (rawRule: string): ParsedRule | null => {
  const rule = normalizeString(rawRule);
  if (!rule) return null;
  if (rule === '*') return { allowAll: true };

  const hasProtocol = rule.includes('://');
  if (hasProtocol) {
    const [protocolToken, ...restParts] = rule.split('://');
    const protocol = `${protocolToken}:`;
    const rest = restParts.join('://');
    const { hostname: rawHostname, hasPort, port } = splitHostPort(rest);
    const wildcard = rawHostname.startsWith('*.');
    const hostname = wildcard ? rawHostname.slice(2) : rawHostname;
    if (!hostname) return null;

    if (!wildcard) {
      const exactOrigin = `${protocol}//${hostname}${hasPort ? `:${port}` : ''}`;
      return { allowAll: false, exactOrigin };
    }

    return {
      allowAll: false,
      hostRule: {
        hostname,
        wildcard: true,
        protocol,
        requirePortMatch: true,
        port: hasPort ? port : '',
      },
    };
  }

  const { hostname: rawHostname, hasPort, port } = splitHostPort(rule);
  const wildcard = rawHostname.startsWith('*.');
  const hostname = wildcard ? rawHostname.slice(2) : rawHostname;
  if (!hostname) return null;

  return {
    allowAll: false,
    hostRule: {
      hostname,
      wildcard,
      requirePortMatch: hasPort,
      port: hasPort ? port : '',
    },
  };
};

const matchHostRule = (origin: URL, rule: HostRule): boolean => {
  if (rule.protocol && origin.protocol !== rule.protocol) return false;
  if (rule.requirePortMatch && origin.port !== rule.port) return false;
  if (rule.wildcard) {
    return origin.hostname === rule.hostname || origin.hostname.endsWith(`.${rule.hostname}`);
  }
  return origin.hostname === rule.hostname;
};

export const createOriginPolicy = ({
  envValue,
  fallbackOrigins,
  extraOrigins = [],
}: {
  envValue: string | undefined;
  fallbackOrigins: string[];
  extraOrigins?: Array<string | undefined>;
}): OriginPolicy => {
  const configured = splitCsv(envValue);
  const effective = configured.length ? configured : fallbackOrigins.map(normalizeString).filter(Boolean);
  const extras = extraOrigins.map((item) => normalizeString(item || '')).filter(Boolean);
  const combined = Array.from(new Set([...effective, ...extras]));
  if (!combined.length) {
    return {
      allowAll: true,
      configuredOrigins: [],
      isAllowed: () => true,
    };
  }

  let allowAll = false;
  const exactOrigins = new Set<string>();
  const hostRules: HostRule[] = [];
  for (const entry of combined) {
    const parsed = parseRule(entry);
    if (!parsed) continue;
    if (parsed.allowAll) {
      allowAll = true;
      continue;
    }
    if (parsed.exactOrigin) exactOrigins.add(parsed.exactOrigin);
    if (parsed.hostRule) hostRules.push(parsed.hostRule);
  }

  return {
    allowAll,
    configuredOrigins: combined,
    isAllowed(origin: string) {
      if (allowAll) return true;
      const normalized = normalizeOrigin(origin);
      if (!normalized) return false;
      if (exactOrigins.has(normalized)) return true;

      try {
        const parsed = new URL(normalized);
        return hostRules.some((rule) => matchHostRule(parsed, rule));
      } catch {
        return false;
      }
    },
  };
};
