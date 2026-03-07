/**
 * Tests for plugins/withAsyncShareExtension.js
 *
 * Tests the Expo config plugin that:
 * - Adds App Group entitlements for iOS Share Extension
 * - Generates ShareViewController.swift with Supabase credentials
 */

const fs = require("fs");
const path = require("path");

// Mock @expo/config-plugins — capture the modifier callbacks
const entitlementsMods = [];
const xcodeMods = [];

jest.mock("@expo/config-plugins", () => ({
  withEntitlementsPlist: (config, mod) => {
    entitlementsMods.push(mod);
    return mod(config);
  },
  withXcodeProject: (config, mod) => {
    xcodeMods.push(mod);
    return mod(config);
  },
}));

jest.mock("fs");
jest.mock("path", () => {
  const actual = jest.requireActual("path");
  return { ...actual, join: actual.join };
});

beforeEach(() => {
  jest.clearAllMocks();
  entitlementsMods.length = 0;
  xcodeMods.length = 0;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
});

function loadPlugin() {
  // Clear require cache so each test gets fresh module
  delete require.cache[require.resolve("../../plugins/withAsyncShareExtension")];
  return require("../../plugins/withAsyncShareExtension");
}

describe("withAsyncShareExtension", () => {
  describe("entitlements", () => {
    it("adds App Group to entitlements when none exist", () => {
      fs.existsSync.mockReturnValue(false);
      const config = {
        modResults: {},
        modRequest: { projectRoot: "/project" },
      };

      const withAsyncShareExtension = loadPlugin();
      withAsyncShareExtension(config);

      expect(config.modResults["com.apple.security.application-groups"]).toEqual([
        "group.com.spot.app",
      ]);
    });

    it("does not duplicate App Group on re-prebuild", () => {
      fs.existsSync.mockReturnValue(false);
      const config = {
        modResults: {
          "com.apple.security.application-groups": ["group.com.spot.app"],
        },
        modRequest: { projectRoot: "/project" },
      };

      const withAsyncShareExtension = loadPlugin();
      withAsyncShareExtension(config);

      expect(config.modResults["com.apple.security.application-groups"]).toEqual([
        "group.com.spot.app",
      ]);
    });

    it("preserves existing App Groups when adding", () => {
      fs.existsSync.mockReturnValue(false);
      const config = {
        modResults: {
          "com.apple.security.application-groups": ["group.com.other.app"],
        },
        modRequest: { projectRoot: "/project" },
      };

      const withAsyncShareExtension = loadPlugin();
      withAsyncShareExtension(config);

      expect(config.modResults["com.apple.security.application-groups"]).toEqual([
        "group.com.other.app",
        "group.com.spot.app",
      ]);
    });
  });

  describe("ShareViewController generation", () => {
    it("generates Swift file with Supabase credentials", () => {
      process.env.SUPABASE_URL = "https://abc.supabase.co";
      process.env.SUPABASE_ANON_KEY = "anon-key-123";

      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation(() => {});

      const config = {
        modResults: {},
        modRequest: { projectRoot: "/project" },
      };

      const withAsyncShareExtension = loadPlugin();
      withAsyncShareExtension(config);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const [filePath, content] = fs.writeFileSync.mock.calls[0];
      expect(filePath).toContain("ShareViewController.swift");
      expect(content).toContain("https://abc.supabase.co");
      expect(content).toContain("anon-key-123");
      expect(content).toContain("group.com.spot.app");
    });

    it("skips generation when ShareExtension directory does not exist", () => {
      process.env.SUPABASE_URL = "https://abc.supabase.co";
      process.env.SUPABASE_ANON_KEY = "anon-key-123";

      fs.existsSync.mockReturnValue(false);

      const config = {
        modResults: {},
        modRequest: { projectRoot: "/project" },
      };

      const withAsyncShareExtension = loadPlugin();
      withAsyncShareExtension(config);

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it("escapes double quotes in credentials for valid Swift string literals", () => {
      process.env.SUPABASE_URL = 'https://example.com/path"with"quotes';
      process.env.SUPABASE_ANON_KEY = 'key"with"quotes';

      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation(() => {});

      const config = {
        modResults: {},
        modRequest: { projectRoot: "/project" },
      };

      const withAsyncShareExtension = loadPlugin();
      withAsyncShareExtension(config);

      const content = fs.writeFileSync.mock.calls[0][1];
      // Escaped quotes should appear as \" in the Swift source
      expect(content).toContain('\\"');
      // Raw unescaped quotes in the middle of a Swift string literal would be a syntax error.
      // Verify no unescaped quotes exist inside the credential values.
      const urlLine = content.split("\n").find((l) => l.includes("supabaseUrl ="));
      expect(urlLine).not.toMatch(/= "[^"]*[^\\]"[^"]*"/);
    });

    it("escapes backslashes in credentials for valid Swift string literals", () => {
      process.env.SUPABASE_URL = "https://example.com/path\\with\\backslash";
      process.env.SUPABASE_ANON_KEY = "key-normal";

      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation(() => {});

      const config = {
        modResults: {},
        modRequest: { projectRoot: "/project" },
      };

      const withAsyncShareExtension = loadPlugin();
      withAsyncShareExtension(config);

      const content = fs.writeFileSync.mock.calls[0][1];
      // Backslashes should be doubled in the Swift output
      expect(content).toContain("\\\\");
    });

    it("throws when env vars are missing", () => {
      // No env vars set — should throw instead of generating a broken extension
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation(() => {});

      const config = {
        modResults: {},
        modRequest: { projectRoot: "/project" },
      };

      const withAsyncShareExtension = loadPlugin();
      expect(() => withAsyncShareExtension(config)).toThrow(
        "SUPABASE_URL and SUPABASE_ANON_KEY must be set"
      );

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it("generated Swift reads auth token from the correct App Group", () => {
      process.env.SUPABASE_URL = "https://abc.supabase.co";
      process.env.SUPABASE_ANON_KEY = "key";

      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation(() => {});

      const config = {
        modResults: {},
        modRequest: { projectRoot: "/project" },
      };

      const withAsyncShareExtension = loadPlugin();
      withAsyncShareExtension(config);

      const content = fs.writeFileSync.mock.calls[0][1];
      // The Swift code must use the same App Group identifier and token key
      // as AuthContext.tsx (SHARED_TOKEN_KEY = "spot_shared_access_token",
      // APP_GROUP = "group.com.spot.app")
      expect(content).toContain('"group.com.spot.app"');
      expect(content).toContain('"spot_shared_access_token"');
    });

    it("throws when SUPABASE_URL or SUPABASE_ANON_KEY are missing", () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation(() => {});

      const config = {
        modResults: {},
        modRequest: { projectRoot: "/project" },
      };

      const withAsyncShareExtension = loadPlugin();
      expect(() => withAsyncShareExtension(config)).toThrow(
        "SUPABASE_URL and SUPABASE_ANON_KEY must be set"
      );
    });
  });

  describe("no Android mods", () => {
    it("does not reference withDangerousMod or withAndroidManifest", () => {
      const pluginSource = fs.readFileSync
        ? require("fs").readFileSync
        : null;

      // Read actual plugin source (not the mock)
      const actualFs = jest.requireActual("fs");
      const source = actualFs.readFileSync(
        require.resolve("../../plugins/withAsyncShareExtension"),
        "utf-8"
      );

      expect(source).not.toContain("withDangerousMod");
      expect(source).not.toContain("withAndroidManifest");
      expect(source).not.toContain("ShareReceiverActivity");
      expect(source).not.toContain("AndroidManifest");
    });
  });
});
