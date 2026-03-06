import ExpoModulesCore
import Security

public class SharedStorageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SharedStorage")

    Function("setItem") { (key: String, value: String, accessGroup: String) in
      Self.deleteFromKeychain(key: key, accessGroup: accessGroup)

      guard let data = value.data(using: .utf8) else { return }
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: key,
        kSecAttrAccessGroup as String: accessGroup,
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
      ]
      SecItemAdd(query as CFDictionary, nil)
    }

    Function("getItem") { (key: String, accessGroup: String) -> String? in
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: key,
        kSecAttrAccessGroup as String: accessGroup,
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
      ]
      var result: AnyObject?
      let status = SecItemCopyMatching(query as CFDictionary, &result)
      guard status == errSecSuccess, let data = result as? Data else { return nil }
      return String(data: data, encoding: .utf8)
    }

    Function("removeItem") { (key: String, accessGroup: String) in
      Self.deleteFromKeychain(key: key, accessGroup: accessGroup)
    }
  }

  private static func deleteFromKeychain(key: String, accessGroup: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: key,
      kSecAttrAccessGroup as String: accessGroup,
    ]
    SecItemDelete(query as CFDictionary)
  }
}
