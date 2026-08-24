import { lookup as nodeLookup } from "node:dns/promises";
import type { LookupAddress, LookupOptions } from "node:dns";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import { WEB_RESEARCH_LIMITS, WebResearchError, normalizeWebUrl } from "./contracts.ts";

export type DnsAnswer = { address: string; family: 4 | 6 };
export type DnsResolver = (hostname: string) => Promise<DnsAnswer[]>;

const INTERNAL_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home"];
const INTERNAL_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.azure.internal",
  "instance-data.ec2.internal",
]);

function addressLiteral(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

export const systemDnsResolver: DnsResolver = async (hostname) => {
  const answers = await nodeLookup(hostname, { all: true, verbatim: true });
  return answers.map((answer) => ({
    address: answer.address,
    family: answer.family === 6 ? 6 : 4,
  }));
};

export function isPublicAddress(value: string): boolean {
  if (!ipaddr.isValid(value)) return false;
  let address = ipaddr.parse(value);
  if (address.kind() === "ipv6") {
    const ipv6 = address as ipaddr.IPv6;
    if (ipv6.isIPv4MappedAddress()) address = ipv6.toIPv4Address();
  }
  return address.range() === "unicast";
}

export function validateHostname(hostname: string): void {
  const lower = addressLiteral(hostname).toLowerCase().replace(/\.$/, "");
  if (!lower || INTERNAL_HOSTS.has(lower) || INTERNAL_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
    throw new WebResearchError("hostname_denied", "The destination hostname is not public.", "denied");
  }
  if (lower === "169.254.169.254" || lower === "100.100.100.200") {
    throw new WebResearchError("metadata_denied", "Cloud metadata destinations are not allowed.", "denied");
  }
}

export function parsePublicUrl(value: string): URL {
  if (!value.trim() || value.length > WEB_RESEARCH_LIMITS.urlCharacters) {
    throw new WebResearchError("invalid_url", "The URL is missing or exceeds the 2,048-character limit.", "denied");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new WebResearchError("invalid_url", "The URL is invalid.", "denied");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WebResearchError("scheme_denied", "Only HTTP and HTTPS URLs are allowed.", "denied");
  }
  if (parsed.username || parsed.password) {
    throw new WebResearchError("credentials_denied", "URLs containing credentials are not allowed.", "denied");
  }
  if (parsed.port) {
    const isDefault =
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443");
    if (!isDefault) {
      throw new WebResearchError("port_denied", "Only the default HTTP and HTTPS ports are allowed.", "denied");
    }
  }
  validateHostname(parsed.hostname);
  const literal = addressLiteral(parsed.hostname);
  if (ipaddr.isValid(literal) && !isPublicAddress(literal)) {
    throw new WebResearchError("address_denied", "The destination IP address is not public unicast.", "denied");
  }
  return new URL(normalizeWebUrl(parsed.toString()));
}

export async function resolvePublicAddresses(
  hostname: string,
  resolver: DnsResolver = systemDnsResolver,
): Promise<DnsAnswer[]> {
  const literal = addressLiteral(hostname);
  if (ipaddr.isValid(literal)) {
    if (!isPublicAddress(literal)) {
      throw new WebResearchError("address_denied", "The destination IP address is not public unicast.", "denied");
    }
    const parsed = ipaddr.parse(literal);
    return [{ address: parsed.toString(), family: parsed.kind() === "ipv6" ? 6 : 4 }];
  }
  let answers: DnsAnswer[];
  try {
    answers = await resolver(hostname);
  } catch {
    throw new WebResearchError("dns_failure", "The destination hostname could not be resolved.");
  }
  if (answers.length === 0) {
    throw new WebResearchError("dns_no_answers", "The destination hostname returned no addresses.");
  }
  if (answers.some((answer) => !isPublicAddress(answer.address))) {
    throw new WebResearchError("dns_address_denied", "DNS returned a non-public address.", "denied");
  }
  return answers;
}

export type PinnedAddressStore = Map<string, DnsAnswer[]>;

export function createPinnedLookup(pinned: PinnedAddressStore): LookupFunction {
  return function lookup(
    hostname: string,
    options: LookupOptions,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ): void {
    const answers = pinned.get(hostname.toLowerCase());
    if (!answers || answers.length === 0 || answers.some((answer) => !isPublicAddress(answer.address))) {
      const error = Object.assign(new Error("Destination was not pinned to public DNS answers."), {
        code: "EHOSTUNREACH",
      });
      callback(error, "");
      return;
    }
    if (options.all) {
      callback(null, answers);
      return;
    }
    const preferred = answers.find((answer) => !options.family || answer.family === options.family) ?? answers[0]!;
    callback(null, preferred.address, preferred.family);
  };
}
