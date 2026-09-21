import Foundation
import Security

/// Los tokens viven en el llavero, no en UserDefaults.
nonisolated enum Llavero {
    private static let servicio = "mx.dimia.app"

    static func guardar(_ valor: String, clave: String) {
        let datos = Data(valor.utf8)
        let consulta: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: servicio, kSecAttrAccount as String: clave]
        SecItemDelete(consulta as CFDictionary)
        var alta = consulta
        alta[kSecValueData as String] = datos
        alta[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(alta as CFDictionary, nil)
    }

    static func leer(_ clave: String) -> String? {
        let consulta: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: servicio, kSecAttrAccount as String: clave, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var resultado: AnyObject?
        guard SecItemCopyMatching(consulta as CFDictionary, &resultado) == errSecSuccess, let datos = resultado as? Data else { return nil }
        return String(decoding: datos, as: UTF8.self)
    }

    static func borrar(_ clave: String) {
        let consulta: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: servicio, kSecAttrAccount as String: clave]
        SecItemDelete(consulta as CFDictionary)
    }
}
