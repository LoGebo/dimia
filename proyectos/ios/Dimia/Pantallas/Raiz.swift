import SwiftUI

/// Las cuatro pestañas. Agentes es la que se parece a Grok Bot; las demás son el día del negocio.
struct Raiz: View {
    @Environment(Sesion.self) private var sesion
    @State private var pestana = "agentes"

    var body: some View {
        TabView(selection: $pestana) {
            Tab("Hoy", systemImage: "sun.max", value: "hoy") { HoyPantalla() }
            if sesion.negocio?.agenda ?? true {
                Tab("Agenda", systemImage: "calendar", value: "agenda") { AgendaPantalla() }
            }
            Tab("Mensajes", systemImage: "bubble.left.and.bubble.right", value: "mensajes") { MensajesPantalla() }
            Tab("Agentes", systemImage: "person.2", value: "agentes") { AgentesPantalla() }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
    }
}

/// Botón de la esquina con el negocio y los ajustes; va en todas las pestañas.
struct BotonAjustes: ToolbarContent {
    @State private var abierto = false
    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button { abierto = true } label: { Image(systemName: "person.crop.square") }
                .accessibilityLabel("Cuenta y negocio")
                .sheet(isPresented: $abierto) { AjustesPantalla() }
        }
    }
}
