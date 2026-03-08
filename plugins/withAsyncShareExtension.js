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
    // Make the extension overlay transparent so the host app stays visible
    view.isOpaque = false
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    // Remove the dimming/white background from the modal presentation
    if let root = view.window?.rootViewController {
      root.view.backgroundColor = .clear
    }
    view.superview?.backgroundColor = .clear
    view.window?.backgroundColor = .clear
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
        await showToastAndDismiss("No link detected", success: false)
        return
      }

      guard let token = readAuthToken() else {
        await showToastAndDismiss("Sign in to spot. to save", success: false)
        return
      }

      let sent = await sendToServer(url: url, token: token)
      await showToastAndDismiss(sent ? "Sent to spot." : "Couldn't save — try again", success: sent)
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
  private func showToastAndDismiss(_ message: String, success: Bool) {
    let spotEmerald = UIColor(red: 4/255, green: 120/255, blue: 87/255, alpha: 1)

    // Blur backdrop for the pill
    let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
    blur.layer.cornerRadius = 22
    blur.clipsToBounds = true
    blur.translatesAutoresizingMaskIntoConstraints = false

    // Tinted overlay inside the blur
    let tint = UIView()
    tint.backgroundColor = success
      ? spotEmerald.withAlphaComponent(0.12)
      : UIColor.systemRed.withAlphaComponent(0.12)
    tint.translatesAutoresizingMaskIntoConstraints = false
    blur.contentView.addSubview(tint)

    // SF Symbol icon
    let iconName = success ? "checkmark.circle.fill" : "xmark.circle.fill"
    let iconImage = UIImage(
      systemName: iconName,
      withConfiguration: UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
    )
    let icon = UIImageView(image: iconImage)
    icon.tintColor = success ? spotEmerald : .systemRed
    icon.translatesAutoresizingMaskIntoConstraints = false

    // Label
    let label = UILabel()
    label.text = message
    label.textColor = .label
    label.font = .systemFont(ofSize: 15, weight: .semibold)
    label.translatesAutoresizingMaskIntoConstraints = false

    // Horizontal stack for icon + label
    let stack = UIStackView(arrangedSubviews: [icon, label])
    stack.axis = .horizontal
    stack.spacing = 8
    stack.alignment = .center
    stack.translatesAutoresizingMaskIntoConstraints = false
    blur.contentView.addSubview(stack)

    // Shadow on the blur container
    let container = UIView()
    container.translatesAutoresizingMaskIntoConstraints = false
    container.layer.shadowColor = UIColor.black.cgColor
    container.layer.shadowOpacity = 0.12
    container.layer.shadowRadius = 12
    container.layer.shadowOffset = CGSize(width: 0, height: 4)
    container.addSubview(blur)

    view.addSubview(container)

    // Start offscreen (above safe area)
    let topConstraint = container.topAnchor.constraint(
      equalTo: view.safeAreaLayoutGuide.topAnchor, constant: -80
    )

    NSLayoutConstraint.activate([
      // Tint fills blur
      tint.topAnchor.constraint(equalTo: blur.topAnchor),
      tint.bottomAnchor.constraint(equalTo: blur.bottomAnchor),
      tint.leadingAnchor.constraint(equalTo: blur.leadingAnchor),
      tint.trailingAnchor.constraint(equalTo: blur.trailingAnchor),

      // Stack inside blur with padding
      stack.topAnchor.constraint(equalTo: blur.contentView.topAnchor, constant: 12),
      stack.bottomAnchor.constraint(equalTo: blur.contentView.bottomAnchor, constant: -12),
      stack.leadingAnchor.constraint(equalTo: blur.contentView.leadingAnchor, constant: 18),
      stack.trailingAnchor.constraint(equalTo: blur.contentView.trailingAnchor, constant: -18),

      // Blur fills container
      blur.topAnchor.constraint(equalTo: container.topAnchor),
      blur.bottomAnchor.constraint(equalTo: container.bottomAnchor),
      blur.leadingAnchor.constraint(equalTo: container.leadingAnchor),
      blur.trailingAnchor.constraint(equalTo: container.trailingAnchor),

      // Container centered horizontally, positioned at top
      container.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      topConstraint,

      // Icon size
      icon.widthAnchor.constraint(equalToConstant: 22),
      icon.heightAnchor.constraint(equalToConstant: 22),
    ])

    view.layoutIfNeeded()

    // Slide in with spring animation
    UIView.animate(
      withDuration: 0.5,
      delay: 0,
      usingSpringWithDamping: 0.75,
      initialSpringVelocity: 0.8,
      options: .curveEaseOut
    ) {
      topConstraint.constant = 8
      self.view.layoutIfNeeded()
    }

    // Haptic feedback
    let generator = UINotificationFeedbackGenerator()
    generator.notificationOccurred(success ? .success : .error)

    // Slide out and dismiss
    let displayDuration: TimeInterval = success ? 1.2 : 2.0
    DispatchQueue.main.asyncAfter(deadline: .now() + displayDuration) {
      UIView.animate(withDuration: 0.3, delay: 0, options: .curveEaseIn, animations: {
        topConstraint.constant = -80
        self.view.layoutIfNeeded()
      }) { _ in
        self.complete()
      }
    }
  }

  private func complete() {
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }
}
`;
}

module.exports = withAsyncShareExtension;
