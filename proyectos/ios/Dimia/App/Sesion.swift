import Foundation
import Observation

/// Quién entró y con qué negocio está trabajando. Una sola por app.
@Observable
final class Sesion {
    var yo: Yo?
    var negocio: Negocio?
    var cargando = true
    var error: String?

    var entro: Bool { API.tokens != nil && yo != nil }

    init() {
        API.cargarTokens()
        Task { await cargar() }
    }

    func cargar() async {
        cargando = true
        defer { cargando = false }
        guard API.tokens != nil else { yo = nil; return }
        do {
            let y: Yo = try await API.obtener("/v1/acceso/yo")
            yo = y
            let guardado = UserDefaults.standard.string(forKey: "negocio")
            negocio = y.negocios.first { $0.tenant_id.uuidString == guardado } ?? y.negocios.first
        } catch API.Fallo.sinSesion {
            yo = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func entrar(email: String, password: String) async throws {
        try await API.entrar(email: email.lowercased().trimmingCharacters(in: .whitespaces), password: password)
        await cargar()
    }

    func elegir(_ n: Negocio) {
        negocio = n
        UserDefaults.standard.set(n.tenant_id.uuidString, forKey: "negocio")
    }

    func salir() {
        API.tokens = nil
        yo = nil
        negocio = nil
    }

    func borrarCuenta() async throws {
        try await API.enviar("DELETE", "/v1/acceso/cuenta")
        salir()
    }

    /// Prefijo de las rutas del negocio actual.
    var ruta: String { "/v1/tenants/\(negocio?.tenant_id.uuidString.lowercased() ?? "")" }
}
