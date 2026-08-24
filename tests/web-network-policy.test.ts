import { describe, expect, it, vi } from "vitest";
import {
  createPinnedLookup,
  isPublicAddress,
  parsePublicUrl,
  resolvePublicAddresses,
} from "../src/lib/web-research/network-policy.ts";

describe("Phase 4 URL and DNS policy", () => {
  it("normalizes public HTTP/HTTPS URLs while stripping fragments and default ports", () => {
    expect(parsePublicUrl("https://Example.COM:443/a?q=1#fragment").toString()).toBe(
      "https://example.com/a?q=1",
    );
    expect(parsePublicUrl("http://8.8.8.8:80/").toString()).toBe("http://8.8.8.8/");
    expect(parsePublicUrl("https://[2606:4700:4700::1111]/").hostname).toBe(
      "[2606:4700:4700::1111]",
    );
  });

  it("rejects malformed, credentialed, non-web, custom-port, overlong, and internal URLs", () => {
    const denied = [
      "not a url",
      "file:///etc/passwd",
      "https://user:secret@example.com/",
      "https://example.com:444/",
      "http://localhost/",
      "http://service.local/",
      "http://service.internal/",
      "http://service.lan/",
      "http://service.home/",
      "http://metadata.google.internal/",
      `https://example.com/${"a".repeat(2_100)}`,
    ];
    for (const value of denied) expect(() => parsePublicUrl(value), value).toThrow();
  });

  it("rejects every non-public IP class, including unusual URL spellings and mapped IPv6", () => {
    const denied = [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "192.168.1.1",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "fc00::1",
      "fe80::1",
      "ff00::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
    ];
    denied.forEach((address) => expect(isPublicAddress(address), address).toBe(false));
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);

    expect(() => parsePublicUrl("http://2130706433/")).toThrow();
    expect(() => parsePublicUrl("http://0x7f000001/")).toThrow();
    expect(() => parsePublicUrl("http://[::ffff:127.0.0.1]/")).toThrow();
  });

  it("accepts all-public DNS sets and denies mixed answers without choosing the safe subset", async () => {
    await expect(
      resolvePublicAddresses("example.com", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:4700:4700::1111", family: 6 },
      ]),
    ).resolves.toHaveLength(2);
    await expect(
      resolvePublicAddresses("example.com", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toMatchObject({ code: "dns_address_denied", availability: "denied" });
    await expect(resolvePublicAddresses("example.com", async () => [])).rejects.toMatchObject({
      code: "dns_no_answers",
    });
    await expect(
      resolvePublicAddresses("example.com", async () => {
        throw new Error("resolver details must not leak");
      }),
    ).rejects.toMatchObject({ code: "dns_failure", message: "The destination hostname could not be resolved." });
  });

  it("pins only previously validated public answers inside the socket lookup", () => {
    const pinned = new Map([
      ["example.com", [{ address: "93.184.216.34", family: 4 as const }]],
      ["mixed.example", [{ address: "127.0.0.1", family: 4 as const }]],
    ]);
    const lookup = createPinnedLookup(pinned);
    const safeCallback = vi.fn();
    lookup("example.com", { family: 4 }, safeCallback);
    expect(safeCallback).toHaveBeenCalledWith(null, "93.184.216.34", 4);

    const missingCallback = vi.fn();
    lookup("missing.example", {}, missingCallback);
    expect(missingCallback.mock.calls[0]?.[0]).toMatchObject({ code: "EHOSTUNREACH" });

    const mixedCallback = vi.fn();
    lookup("mixed.example", {}, mixedCallback);
    expect(mixedCallback.mock.calls[0]?.[0]).toMatchObject({ code: "EHOSTUNREACH" });
  });
});
