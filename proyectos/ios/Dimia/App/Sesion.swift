import Foundation
import Observation

/// Quién entró y con qué negocio está trabajando. Una sola por app.
@Observable
final class Sesion {
    var yo: Yo?
    var negocio: Negocio?
    var cargando = true
    var error: String?
    var pestana = "hoy"   // la pestaña activa; Hoy manda a las demás
    var sinLeer = 0       // avisos sin leer (la campanita)
    var conversacionPorAbrir: UUID?
    var diaPorAbrir: String?          // «yyyy-MM-dd»; lo abre Agenda cuando llega de una notificación   // la abre Mensajes cuando llega de una notificación

    var entro: Bool { API.tokens != nil && yo != nil }

    init() {
        API.cargarTokens()
        Notificaciones.sesion = self
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
        // En una tarea propia: al guardarse el token la pantalla de acceso se desmonta y cancelaría esta.
        await Task { await cargar() }.value
    }

    func elegir(_ n: Negocio) {
        negocio = n
        UserDefaults.standard.set(n.tenant_id.uuidString, forKey: "negocio")
        Task { await contarAvisos() }
    }

    func contarAvisos() async {
        guard negocio != nil else { return }
        let lista: [Aviso] = (try? await API.obtener(ruta + "/avisos?limite=50")) ?? []
        sinLeer = lista.filter { $0.leido_en == nil }.count
    }

    func salir() {
        Task { await Notificaciones.olvidar() }
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
