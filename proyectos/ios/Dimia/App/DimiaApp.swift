import SwiftUI

@main
struct DimiaApp: App {
    @State private var sesion = Sesion()

    var body: some Scene {
        WindowGroup {
            Group {
                if sesion.cargando && sesion.yo == nil && API.tokens != nil {
                    ProgressView().tint(.acento)
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
