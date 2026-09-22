import SwiftUI
import UserNotifications

nonisolated struct Aviso: Codable, Sendable, Identifiable, Hashable {
    var id: Int
    var tipo: String
    var titulo: String
    var cuerpo: String
    var enlace: String?
    var entidad: String?
    var entidad_id: UUID?
    var leido_en: Date?
    var creado: Date
}

/// Push de iOS: pide permiso, registra el token en dimia-api y, al tocar una notificación,
/// abre la pestaña que corresponde al `enlace` del aviso (rutas del panel).
final class Notificaciones: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static weak var sesion: Sesion?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(token, forKey: "apns_token")
        Task { await Notificaciones.registrar() }
    }

    /// Con la app abierta, el aviso se muestra igual (banner y sonido).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let enlace = info["enlace"] as? String
        let tenant = info["tenant_id"] as? String
        await MainActor.run { Notificaciones.abrir(enlace: enlace, tenant: tenant) }
    }

    /// Pide permiso una vez que hay sesión; iOS solo muestra el diálogo la primera vez.
    static func pedirPermiso() async {
        let ok = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if ok { UIApplication.shared.registerForRemoteNotifications() }
    }

    static func registrar() async {
        guard let token = UserDefaults.standard.string(forKey: "apns_token"), let n = sesion?.negocio else { return }
        #if DEBUG
        let entorno = "sandbox"
        #else
        let entorno = "produccion"
        #endif
        try? await API.enviar("POST", "/v1/dispositivos", ["token": token, "entorno": entorno, "tenant_id": n.tenant_id.uuidString.lowercased()])
    }

    static func olvidar() async {
        guard let token = UserDefaults.standard.string(forKey: "apns_token") else { return }
        try? await API.enviar("DELETE", "/v1/dispositivos/\(token)")
    }

    /// Ruta del panel → pestaña de la app.
    static func abrir(enlace: String?, tenant: String?) {
        guard let sesion else { return }
        if let tenant, let n = sesion.yo?.negocios.first(where: { $0.tenant_id.uuidString.lowercased() == tenant.lowercased() }), n.id != sesion.negocio?.id {
            sesion.elegir(n)
        }
        let n = sesion.negocio
        let d = destino(enlace: enlace, agenda: n?.agenda ?? true, pedidos: n?.pedidos ?? false)
        sesion.pestana = d.pestana
        if let c = d.conversacion { sesion.conversacionPorAbrir = c }
        if d.pestana == "agenda", let dia = URLComponents(string: enlace ?? "")?.queryItems?.first(where: { $0.name == "dia" })?.value {
            sesion.diaPorAbrir = dia
        }
    }

    /// La pestaña (y la conversación, si aplica) para una ruta del panel, según las pestañas que tiene el giro.
    nonisolated static func destino(enlace: String?, agenda: Bool, pedidos: Bool) -> (pestana: String, conversacion: UUID?) {
        let ruta = enlace ?? ""
        if ruta.hasPrefix("/agenda") { return (agenda ? "agenda" : "hoy", nil) }
        if ruta.hasPrefix("/pedidos") { return (pedidos ? "pedidos" : "hoy", nil) }
        if ruta.hasPrefix("/recados") { return (agenda || pedidos ? "hoy" : "recados", nil) }
        if ruta.hasPrefix("/bandeja") {
            let c = URLComponents(string: ruta)?.queryItems?.first(where: { $0.name == "c" })?.value
            return ("mensajes", c.flatMap(UUID.init(uuidString:)))
        }
        if ruta.hasPrefix("/mensajes") { return ("mensajes", nil) }
        return ("hoy", nil)
    }
}

/// La campanita: lo que pasó en el negocio, lo más nuevo arriba; al abrirla queda todo leído.
struct AvisosPantalla: View {
    @Environment(Sesion.self) private var sesion
    @Environment(\.dismiss) private var cerrar
    @State private var avisos: [Aviso] = []
    @State private var error: String?
    @State private var cargando = true

    var body: some View {
        NavigationStack {
            List {
                if let error { FilaError(texto: error) { Task { await cargar() } } }
                if avisos.isEmpty && !cargando && error == nil {
                    Vacio(titulo: "Sin avisos.", detalle: "Aquí aparecen las citas nuevas, los recados y lo que necesite su atención.")
                }
                ForEach(avisos) { a in
                    Button { cerrar(); Notificaciones.abrir(enlace: a.enlace, tenant: nil) } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Cuadrado(color: tono(a.tipo)).padding(.top, 6)
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(a.titulo).font(.body.weight(a.leido_en == nil ? .semibold : .regular)).foregroundStyle(Color.tinta)
                                    Spacer()
                                    Text(Formato.cuando(a.creado)).font(.footnote).foregroundStyle(Color.tinta3)
                                }
                                if !a.cuerpo.isEmpty { Text(a.cuerpo).font(.subheadline).foregroundStyle(Color.tinta2) }
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .buttonStyle(.plain)
                }
            }
            .listaDimia()
            .navigationTitle("Avisos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Listo") { cerrar() } } }
            .refreshable { await cargar() }
            .task { await cargar() }
        }
    }

    private func tono(_ tipo: String) -> Color {
        switch tipo {
        case "cita.cancelada", "cita.no_asistio", "whatsapp.fallido": .critico
        case "conversacion.escalada", "recado.creado": .alerta
        case "pago.registrado", "cita.confirmada_cliente": .bueno
        default: .acento
        }
    }

    private func cargar() async {
        defer { cargando = false }
        do {
            avisos = try await API.obtener(sesion.ruta + "/avisos")
            error = nil
            if let ultimo = avisos.first?.id, avisos.contains(where: { $0.leido_en == nil }) {
                try? await API.enviar("POST", sesion.ruta + "/avisos/leidos", ["hasta_id": ultimo])
                sesion.sinLeer = 0
            }
        } catch { self.error = error.localizedDescription }
    }
}
