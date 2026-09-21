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
    @Namespace private var zoom
    @State private var ultimos: [UUID: UltimoMensaje] = [:]

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
                ForEach(visibles) { a in
                    NavigationLink(value: a) {
                        HStack(alignment: .center, spacing: 14) {
                            AvatarAgente(nombre: a.nombre, avatar: a.avatar, tamano: 54)
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(a.nombre).font(.body.weight(.semibold)).foregroundStyle(Color.tinta)
                                    Spacer()
                                    if let u = ultimos[a.id] { Text(Formato.cuando(u.creado)).font(.subheadline).foregroundStyle(Color.tinta3) }
                                }
                                Text(vistaPrevia(a)).font(.subheadline).foregroundStyle(Color.tinta2).lineLimit(2)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    .matchedTransitionSource(id: a.id, in: zoom)
                    .listRowBackground(Color.fondo)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 4, leading: 20, bottom: 4, trailing: 20))
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Color.fondo)
            .searchable(text: $busqueda, prompt: "Buscar")
            .navigationTitle("Agentes")
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
                .navigationTransition(.zoom(sourceID: a.id, in: zoom))
            }
            .refreshable { await cargar() }
            .task(id: sesion.negocio?.id) { await cargar() }
        }
    }

    /// Lo último que pasó con el agente, como la vista previa de una app de mensajes.
    private func vistaPrevia(_ a: Agente) -> String {
        if let u = ultimos[a.id] {
            let t = u.texto.replacingOccurrences(of: "\n", with: " ")
            return u.de == "yo" ? "Usted: " + t : t
        }
        return a.trabajo ?? "Todavía no le dice para qué lo quiere"
    }

    private func cargar() async {
        do {
            agentes = try await API.obtener(sesion.ruta + "/agentes"); error = nil
            if let lista: [UltimoMensaje] = try? await API.obtener(sesion.ruta + "/agentes/ultimos") {
                ultimos = Dictionary(uniqueKeysWithValues: lista.map { ($0.agente_id, $0) })
            }
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
