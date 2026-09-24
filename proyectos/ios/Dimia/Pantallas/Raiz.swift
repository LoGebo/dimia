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
        // Al cambiar de negocio las pestañas empiezan de cero: nada de la lista del negocio anterior.
        .id(sesion.negocio?.id)
        .tabBarMinimizeBehavior(.onScrollDown)
        .task(id: sesion.negocio?.id) {
            await Notificaciones.pedirPermiso()
            await Notificaciones.registrar()
            await sesion.contarAvisos()
        }
    }
}

/// La campanita y el botón de cuenta; van en todas las pestañas.
struct BotonAjustes: ToolbarContent {
    @Environment(Sesion.self) private var sesion
    @State private var abierto = false
    @State private var avisos = false
    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button { avisos = true } label: {
                if sesion.sinLeer > 0 {
                    Image(systemName: "bell.badge").symbolRenderingMode(.palette).foregroundStyle(Color.critico, Color.acento)
                } else {
                    Image(systemName: "bell")
                }
            }
            .accessibilityLabel(sesion.sinLeer > 0 ? "Avisos, \(sesion.sinLeer) sin leer" : "Avisos")
            .sheet(isPresented: $avisos) { AvisosPantalla() }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button { abierto = true } label: { Image(systemName: "person.crop.square") }
                .accessibilityLabel("Cuenta y negocio")
                .sheet(isPresented: $abierto) { AjustesPantalla() }
        }
    }
}
