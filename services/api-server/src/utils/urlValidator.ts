export const validateUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

export const sanitizeUrl = (url: string): string => {
  return url.trim();
};

// Blocklist for known malicious domains
const BLOCKED_DOMAINS = [
  'malware.example.com',
  'phishing.example.com',
];

export const isBlocked = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return BLOCKED_DOMAINS.some(domain => parsed.hostname === domain);
  } catch {
    return true;
  }
};
