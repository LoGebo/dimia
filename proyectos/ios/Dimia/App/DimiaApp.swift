import SwiftUI

@main
struct DimiaApp: App {
    @UIApplicationDelegateAdaptor(Notificaciones.self) private var notificaciones
    @State private var sesion = Sesion()

    init() { Apariencia.aplicar() }

    var body: some Scene {
        WindowGroup {
            Group {
                if sesion.cargando && sesion.yo == nil && API.tokens != nil {
                    ProgressView().tint(.acento)
                } else if sesion.entro, sesion.yo?.negocios.isEmpty == true {
                    // Sin negocio no hay rutas que pedir: cada pestaña respondería 404.
                    VStack(alignment: .leading, spacing: 16) {
                        Vacio(titulo: "Su cuenta todavía no tiene un negocio.", detalle: "Primero dé de alta su negocio en dimia.mx y después vuelva a revisar.")
                        Button("Volver a revisar") { Task { await sesion.cargar() } }
                        Button("Cerrar sesión") { Task { await sesion.salir() } }
                    }
                    .padding(24).frame(maxHeight: .infinity).background(Color.fondo)
                } else if sesion.yo == nil, API.tokens != nil, sesion.error != nil {
                    // Sin red o con la API caída al abrir: los tokens siguen; no se manda al dueño a Acceso.
                    VStack(alignment: .leading, spacing: 16) {
                        Vacio(titulo: "No se pudo conectar.", detalle: "Revise su conexión a internet. Su sesión sigue abierta.")
                        Button("Reintentar") { Task { await sesion.cargar() } }
                        Button("Cerrar sesión") { Task { await sesion.salir() } }
                    }
                    .padding(24).frame(maxHeight: .infinity).background(Color.fondo)
                } else if sesion.entro {
                    Raiz()
                } else {
                    Acceso()
                }
            }
            .environment(sesion)
            .tint(.acento)
        }
    }
}
