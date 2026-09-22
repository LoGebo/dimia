import SwiftUI

/// Las cuatro pestañas. Agentes es la que se parece a Grok Bot; las demás son el día del negocio.
struct Raiz: View {
    @Environment(Sesion.self) private var sesion
    var body: some View {
        @Bindable var sesion = sesion
        TabView(selection: $sesion.pestana) {
            // Las pestañas las decide el giro del negocio (sus herramientas), igual que las secciones del panel.
            let n = sesion.negocio
            Tab("Hoy", systemImage: "sun.max", value: "hoy") { HoyPantalla() }
            if n?.agenda ?? true {
                Tab("Agenda", systemImage: "calendar", value: "agenda") { AgendaPantalla() }
            }
            if n?.pedidos ?? false {
                Tab("Pedidos", systemImage: "bag", value: "pedidos") { PedidosPantalla() }
            }
            Tab("Mensajes", systemImage: "bubble.left.and.bubble.right", value: "mensajes") { MensajesPantalla() }
            if (n?.recados ?? false) && !(n?.agenda ?? true) && !(n?.pedidos ?? false) {
                Tab("Recados", systemImage: "phone.arrow.down.left", value: "recados") { RecadosPantalla() }
            }
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
