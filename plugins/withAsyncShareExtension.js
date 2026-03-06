const { withXcodeProject, withEntitlementsPlist } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const APP_GROUP = "group.com.spot.app";

const withAsyncShareExtension = (config) => {
  config = withEntitlementsPlist(config, (config) => {
    const groups = config.modResults["com.apple.security.application-groups"] || [];
    if (!groups.includes(APP_GROUP)) {
      groups.push(APP_GROUP);
    }
    config.modResults["com.apple.security.application-groups"] = groups;
    return config;
  });

  config = withXcodeProject(config, (config) => {
    const extensionDir = path.join(config.modRequest.projectRoot, "ios", "ShareExtension");

    if (!fs.existsSync(extensionDir)) {
      console.warn("[withAsyncShareExtension] ShareExtension directory not found — expo-share-intent must be in plugins to create the Xcode target");
      return config;
    }

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("[withAsyncShareExtension] SUPABASE_URL and SUPABASE_ANON_KEY must be set — the Share Extension will not work without them");
    }

    fs.writeFileSync(
      path.join(extensionDir, "ShareViewController.swift"),
      generateShareViewController(supabaseUrl, supabaseAnonKey)
    );

    return config;
  });

  return config;
};

function generateShareViewController(supabaseUrl, supabaseAnonKey) {
  const escapedUrl = supabaseUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedKey = supabaseAnonKey.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  return `import UIKit
import Security

class ShareViewController: UIViewController {
  private let appGroupIdentifier = "${APP_GROUP}"
  private let tokenKey = "spot_shared_access_token"
  private let supabaseUrl = "${escapedUrl}"
  private let supabaseAnonKey = "${escapedKey}"

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    handleShare()
  }

  private func handleShare() {
    guard let extensionContext = self.extensionContext,
          let content = extensionContext.inputItems.first as? NSExtensionItem,
          let attachments = content.attachments else {
      complete()
      return
    }

    Task {
      guard let url = await extractURL(from: attachments) else {
        await showBannerAndDismiss("No link found", success: false)
        return
      }

      guard let token = readAuthToken() else {
        await showBannerAndDismiss("Open spot. and sign in first", success: false)
        return
      }

      let sent = await sendToServer(url: url, token: token)
      await showBannerAndDismiss(sent ? "Sent to spot!" : "Failed to send", success: sent)
    }
  }

  private func extractURL(from attachments: [NSItemProvider]) async -> String? {
    for attachment in attachments {
      if attachment.hasItemConformingToTypeIdentifier("com.apple.property-list") {
        if let dict = try? await attachment.loadItem(
             forTypeIdentifier: "com.apple.property-list", options: nil) as? NSDictionary,
           let results = dict[NSExtensionJavaScriptPreprocessingResultsKey] as? NSDictionary,
           let baseURI = results["baseURI"] as? String {
          return baseURI
        }
      }

      if attachment.hasItemConformingToTypeIdentifier("public.url") {
        if let url = try? await attachment.loadItem(forTypeIdentifier: "public.url") as? URL {
          return url.absoluteString
        }
      }

      if attachment.hasItemConformingToTypeIdentifier("public.plain-text") {
        if let text = try? await attachment.loadItem(
             forTypeIdentifier: "public.plain-text") as? String,
           let url = extractURLFromText(text) {
          return url
        }
      }
    }
    return nil
  }

  private func extractURLFromText(_ text: String) -> String? {
    let pattern = "https?://[^\\\\s]+"
    guard let regex = try? NSRegularExpression(pattern: pattern),
          let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
          let range = Range(match.range, in: text) else {
      return nil
    }
    return String(text[range])
  }

  private func sendToServer(url: String, token: String) async -> Bool {
    let endpoint = "\\(supabaseUrl)/functions/v1/async-extract-place"
    guard let requestUrl = URL(string: endpoint) else { return false }

    var request = URLRequest(url: requestUrl)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \\(token)", forHTTPHeaderField: "Authorization")
    request.setValue(supabaseAnonKey, forHTTPHeaderField: "apikey")
    request.timeoutInterval = 10

    guard let bodyData = try? JSONSerialization.data(withJSONObject: ["url": url]) else { return false }
    request.httpBody = bodyData

    do {
      let (_, response) = try await URLSession.shared.data(for: request)
      let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
      return statusCode >= 200 && statusCode < 300
    } catch {
      return false
    }
  }

  private func readAuthToken() -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: tokenKey,
      kSecAttrAccessGroup as String: appGroupIdentifier,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  @MainActor
  private func showBannerAndDismiss(_ message: String, success: Bool) {
    let banner = UIView()
    banner.backgroundColor = success
      ? UIColor(red: 4/255, green: 120/255, blue: 87/255, alpha: 1)
      : UIColor.systemRed
    banner.layer.cornerRadius = 14
    banner.layer.shadowColor = UIColor.black.cgColor
    banner.layer.shadowOpacity = 0.15
    banner.layer.shadowRadius = 8
    banner.layer.shadowOffset = CGSize(width: 0, height: 2)
    banner.translatesAutoresizingMaskIntoConstraints = false
    banner.alpha = 0

    let label = UILabel()
    label.text = message
    label.textColor = .white
    label.font = .systemFont(ofSize: 15, weight: .semibold)
    label.textAlignment = .center
    label.translatesAutoresizingMaskIntoConstraints = false

    banner.addSubview(label)
    view.addSubview(banner)

    NSLayoutConstraint.activate([
      label.centerXAnchor.constraint(equalTo: banner.centerXAnchor),
      label.centerYAnchor.constraint(equalTo: banner.centerYAnchor),
      label.leadingAnchor.constraint(equalTo: banner.leadingAnchor, constant: 20),
      label.trailingAnchor.constraint(equalTo: banner.trailingAnchor, constant: -20),
      banner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      banner.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
      banner.heightAnchor.constraint(equalToConstant: 48),
    ])

    UIView.animate(withDuration: 0.2) { banner.alpha = 1 }

    DispatchQueue.main.asyncAfter(deadline: .now() + (success ? 1.0 : 2.0)) {
      self.complete()
    }
  }

  private func complete() {
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }
}
`;
}

module.exports = withAsyncShareExtension;
