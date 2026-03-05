import ExpoModulesCore

public class SharedStorageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SharedStorage")

    Function("setItem") { (key: String, value: String, suiteName: String) in
      let defaults = UserDefaults(suiteName: suiteName)
      defaults?.set(value, forKey: key)
    }

    Function("getItem") { (key: String, suiteName: String) -> String? in
      let defaults = UserDefaults(suiteName: suiteName)
      return defaults?.string(forKey: key)
    }

    Function("removeItem") { (key: String, suiteName: String) in
      let defaults = UserDefaults(suiteName: suiteName)
      defaults?.removeObject(forKey: key)
    }
  }
}
