import SwiftUI

/// La lista de agentes, como los contactos de una app de mensajes. Tocar uno abre su hilo.
struct AgentesPantalla: View {
    @Environment(Sesion.self) private var sesion
    @State private var agentes: [Agente] = []
    @State private var error: String?
    @State private var busqueda = ""
    @State private var creando = false
    @State private var ruta: [Agente] = []
    @State private var cerebro: EstadoCerebro?

    var body: some View {
        NavigationStack(path: $ruta) {
            List {
                if let error { Section { FilaError(texto: error) { Task { await cargar() } } } }
                if let cerebro, cerebro.estado != "conectado" {
                    Section { Link(destination: URL(string: "https://panel.dimia.mx/agentes")!) {
                        HStack(spacing: 10) {
                            Cuadrado(color: .alerta)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Sus agentes todavía no piensan").font(.body.weight(.medium)).foregroundStyle(Color.tinta)
                                Text("Conecte su cuenta de ChatGPT o de Claude en el panel web. Toma un minuto.").font(.subheadline).foregroundStyle(Color.tinta2)
                            }
                            Spacer()
                        }
                    } }
                }
                let visibles = busqueda.isEmpty ? agentes : agentes.filter { "\($0.nombre) \($0.trabajo ?? "")".localizedCaseInsensitiveContains(busqueda) }
                Section { ForEach(visibles) { a in
                    NavigationLink(value: a) {
                        HStack(spacing: 12) {
                            AvatarAgente(nombre: a.nombre, avatar: a.avatar, tamano: 46, activo: a.activo)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(a.nombre).font(.body.weight(.semibold)).foregroundStyle(Color.tinta)
                                Text(a.trabajo ?? "Todavía no le dice para qué lo quiere").font(.subheadline).foregroundStyle(Color.tinta3).lineLimit(1)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                } }
            }
            .listaDimia()
            .searchable(text: $busqueda, prompt: "Buscar")
            .navigationTitle("Agentes")
            .navigationSubtitle(sesion.negocio?.nombre ?? "")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await crear() } } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Nuevo agente").disabled(creando)
                }
                BotonAjustes()
            }
            .navigationDestination(for: Agente.self) { a in
                HiloAgente(agente: a, cerebroConectado: cerebro?.estado == "conectado") { cambiado in
                    if let i = agentes.firstIndex(where: { $0.id == cambiado.id }) { agentes[i] = cambiado }
                } borrado: {
                    agentes.removeAll { $0.id == a.id }
                    ruta.removeAll()
                }
            }
            .refreshable { await cargar() }
            .task(id: sesion.negocio?.id) { await cargar() }
        }
    }

    private func cargar() async {
        do {
            agentes = try await API.obtener(sesion.ruta + "/agentes"); error = nil
            try? await API.enviar("POST", sesion.ruta + "/agentes-negocio/despertar")  // enciende la máquina mientras el dueño mira la lista
            cerebro = try? await API.obtener(sesion.ruta + "/agentes-negocio/cerebro")
        } catch { self.error = error.localizedDescription }
    }

    private func crear() async {
        creando = true
        defer { creando = false }
        do {
            let a: Agente = try await API.enviar("POST", sesion.ruta + "/agentes")
            agentes.append(a)
            ruta = [a]
        } catch { self.error = error.localizedDescription }
    }
}
