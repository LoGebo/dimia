import SwiftUI

struct MensajesPantalla: View {
    @Environment(Sesion.self) private var sesion
    @State private var lista: [Conversacion] = []
    @State private var error: String?
    @State private var busqueda = ""
    @State private var filtro: Filtro = .todos
    @State private var ruta: [Conversacion] = []

    enum Filtro: String, CaseIterable, Identifiable {
        case todos = "Todos", sinLeer = "Sin leer", pidenPersona = "Piden persona", whatsapp = "WhatsApp", llamadas = "Llamadas", redes = "Redes"
        var id: String { rawValue }
        func pasa(_ c: Conversacion) -> Bool {
            switch self {
            case .todos: true
            case .sinLeer: c.mensajes_sin_leer > 0
            case .pidenPersona: c.estado == "escalada"
            case .whatsapp: c.canal == "whatsapp"
            case .llamadas: c.canal == "llamada"
            case .redes: c.canal == "instagram" || c.canal == "messenger"
            }
        }
    }

    private var visibles: [Conversacion] {
        lista.filter(filtro.pasa).filter { busqueda.isEmpty || $0.nombre.localizedCaseInsensitiveContains(busqueda) || ($0.ultimo_mensaje ?? "").localizedCaseInsensitiveContains(busqueda) }
    }

    var body: some View {
        NavigationStack(path: $ruta) {
            List {
                if let error { FilaError(texto: error) { Task { await cargar() } }.listRowBackground(Color.fondo).listRowSeparator(.hidden) }
                if visibles.isEmpty && error == nil {
                    Vacio(titulo: filtro == .todos ? "Todavía nadie escribe." : "Nada con este filtro.", detalle: filtro == .todos ? "Lo que llegue por WhatsApp, teléfono y redes aparece aquí." : nil)
                        .listRowBackground(Color.fondo).listRowSeparator(.hidden).padding(.horizontal, 4)
                }
                ForEach(visibles) { c in
                    NavigationLink(value: c) { FilaConversacion(c: c) }
                        .listRowBackground(Color.fondo)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 4, leading: 20, bottom: 4, trailing: 20))
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Color.fondo)
            .safeAreaInset(edge: .top, spacing: 0) {
                // Filtros como en Mensajes de iOS: fichas de vidrio, una activa.
                ScrollView(.horizontal, showsIndicators: false) {
                    GlassEffectContainer(spacing: 8) {
                        HStack(spacing: 8) {
                            ForEach(Filtro.allCases) { f in
                                let n = f == .todos ? 0 : lista.filter(f.pasa).count
                                Button { withAnimation(.snappy) { filtro = f } } label: {
                                    HStack(spacing: 6) {
                                        Text(f.rawValue).font(.subheadline.weight(.medium))
                                        if n > 0 { Text("\(n)").font(.caption.monospacedDigit()).opacity(0.7) }
                                    }
                                    .padding(.horizontal, 14).padding(.vertical, 8)
                                    .foregroundStyle(filtro == f ? Color.sobreFirme : Color.tinta)
                                }
                                .glassEffect(filtro == f ? .regular.tint(Color.firme).interactive() : .regular.interactive(), in: .capsule)
                            }
                        }
                        .padding(.horizontal, 16).padding(.vertical, 8)
                    }
                }
            }
            .searchable(text: $busqueda, prompt: "Buscar")
            .navigationTitle("Mensajes")
            .toolbar { BotonAjustes() }
            .navigationDestination(for: Conversacion.self) { HiloConversacion(conversacion: $0) }
            .refreshable { await cargar() }
            .task(id: sesion.negocio?.id) { await cargar() }
            .task(id: sesion.conversacionPorAbrir) {
                guard let id = sesion.conversacionPorAbrir else { return }
                // Una conversación nueva no está en la lista que ya se tenía: se recarga.
                if !lista.contains(where: { $0.id == id }) { await cargar() }
                if let c = lista.first(where: { $0.id == id }) { ruta = [c] }
                sesion.conversacionPorAbrir = nil
            }
        }
    }

    private func cargar() async {
        do { lista = try await API.obtener(sesion.ruta + "/conversaciones"); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct FilaConversacion: View {
    var c: Conversacion
    private var glifo: String {
        ["whatsapp": "message.fill", "llamada": "phone.fill", "instagram": "camera.fill", "messenger": "bubble.left.fill", "sms": "text.bubble.fill"][c.canal] ?? "bubble.left.fill"
    }
    var body: some View {
        let nuevo = c.mensajes_sin_leer > 0
        HStack(alignment: .top, spacing: 14) {
            ZStack(alignment: .bottomTrailing) {
                Image(systemName: glifo).font(.title3).foregroundStyle(Color.tinta2)
                    .frame(width: 48, height: 48).background(Color.panel2, in: .circle)
                if nuevo || c.estado == "escalada" {
                    Cuadrado(color: c.estado == "escalada" ? .alerta : .acento, lado: 12).overlay(Rectangle().stroke(Color.fondo, lineWidth: 2))
                }
            }
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(c.nombre).font(.body.weight(.semibold)).foregroundStyle(Color.tinta).lineLimit(1)
                    Spacer()
                    Text(Formato.cuando(c.ultimo_mensaje_en)).font(.subheadline).foregroundStyle(nuevo ? Color.acento : Color.tinta3)
                }
                Text(c.ultimo_mensaje ?? c.resumen ?? "").font(.subheadline).foregroundStyle(nuevo ? Color.tinta : Color.tinta2).lineLimit(2)
                if c.estado == "escalada" {
                    Text("Pidió una persona").font(.footnote.weight(.medium)).foregroundStyle(Color.alerta)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct HiloConversacion: View {
    @Environment(Sesion.self) private var sesion
    var conversacion: Conversacion
    @State private var mensajes: [Mensaje] = []
    @State private var error: String?

    private var zona: String { sesion.negocio?.zona_horaria ?? "America/Mexico_City" }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                if let error { FilaError(texto: error) { Task { await cargar() } } }
                ForEach(Array(mensajes.enumerated()), id: \.element.id) { i, m in
                    if i == 0 || !Calendar.current.isDate(m.creado, inSameDayAs: mensajes[i - 1].creado) {
                        Text(Formato.fecha(m.creado, zona: zona, larga: true)).font(.caption).foregroundStyle(Color.tinta3).padding(.vertical, 6)
                    }
                    Burbuja(m: m, zona: zona)
                }
            }
            .padding(12)
        }
        .defaultScrollAnchor(.bottom)
        .background(Color.fondo)
        .toolbar(.hidden, for: .tabBar)
        .navigationTitle(conversacion.nombre)
        .navigationSubtitle(conversacion.contacto.hasPrefix("+") ? Formato.telefono(conversacion.contacto) : conversacion.canalNombre)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if conversacion.contacto.hasPrefix("+"), let url = URL(string: "tel:\(conversacion.contacto)") {
                ToolbarItem(placement: .topBarTrailing) { Link(destination: url) { Image(systemName: "phone") }.accessibilityLabel("Llamar") }
            }
        }
        .task { await cargar() }
    }

    private func cargar() async {
        do {
            mensajes = try await API.obtener(sesion.ruta + "/conversaciones/\(conversacion.id.uuidString.lowercased())/mensajes")
            error = nil
            try? await API.enviar("POST", sesion.ruta + "/conversaciones/\(conversacion.id.uuidString.lowercased())/leida")  // abrirla es haberla leído
        } catch { self.error = error.localizedDescription }
    }
}

struct Burbuja: View {
    var m: Mensaje
    var zona: String
    var body: some View {
        let cliente = m.autor == "cliente"
        let sistema = m.autor == "sistema"
        HStack {
            if !cliente && !sistema { Spacer(minLength: 48) }
            VStack(alignment: cliente ? .leading : .trailing, spacing: 3) {
                Text(m.texto)
                    .font(sistema ? .caption : .body)
                    .foregroundStyle(sistema ? Color.tinta3 : m.autor == "agente" ? Color.sobreAcento : Color.tinta)
                    .padding(.horizontal, sistema ? 0 : 12).padding(.vertical, sistema ? 0 : 8)
                    .background(sistema ? Color.clear : m.autor == "agente" ? Color.acento : m.autor == "equipo" ? Color.bueno.opacity(0.18) : Color.panel2)
                    .clipShape(.rect(cornerRadius: 16))
                if !sistema {
                    Text((m.autor == "equipo" ? "Usted, " : m.autor == "agente" ? "El agente, " : "") + Formato.hora(m.creado, zona: zona)).font(.caption).foregroundStyle(Color.tinta3)
                }
            }
            .frame(maxWidth: sistema ? .infinity : nil, alignment: sistema ? .center : cliente ? .leading : .trailing)
            if cliente && !sistema { Spacer(minLength: 48) }
        }
    }
}
