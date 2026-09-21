import SwiftUI

struct MensajesPantalla: View {
    @Environment(Sesion.self) private var sesion
    @State private var lista: [Conversacion] = []
    @State private var error: String?
    @State private var busqueda = ""

    var body: some View {
        NavigationStack {
            List {
                if let error { Section { FilaError(texto: error) { Task { await cargar() } } } }
                let visibles = busqueda.isEmpty ? lista : lista.filter { $0.nombre.localizedCaseInsensitiveContains(busqueda) || ($0.ultimo_mensaje ?? "").localizedCaseInsensitiveContains(busqueda) }
                Section {
                    if visibles.isEmpty && error == nil { Vacio(titulo: "Todavía nadie escribe.", detalle: "Lo que llegue por WhatsApp, teléfono y redes aparece aquí.") }
                    ForEach(visibles) { c in NavigationLink(value: c) { FilaConversacion(c: c) } }
                }
            }
            .listaDimia()
            .searchable(text: $busqueda, prompt: "Buscar")
            .navigationTitle("Mensajes")
            .toolbar { BotonAjustes() }
            .navigationDestination(for: Conversacion.self) { HiloConversacion(conversacion: $0) }
            .refreshable { await cargar() }
            .task(id: sesion.negocio?.id) { await cargar() }
        }
    }

    private func cargar() async {
        do { lista = try await API.obtener(sesion.ruta + "/conversaciones"); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct FilaConversacion: View {
    var c: Conversacion
    var body: some View {
        let pendiente = c.estado == "escalada" || c.mensajes_sin_leer > 0
        HStack(alignment: .top, spacing: 10) {
            Cuadrado(color: c.estado == "escalada" ? .alerta : .acento).padding(.top, 7).opacity(pendiente ? 1 : 0)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(c.nombre).font(.body.weight(c.mensajes_sin_leer > 0 ? .semibold : .medium)).foregroundStyle(Color.tinta).lineLimit(1)
                    Spacer()
                    Text(Formato.relativo(c.ultimo_mensaje_en)).font(.subheadline).foregroundStyle(Color.tinta3)
                }
                Text(c.ultimo_mensaje ?? c.resumen ?? "").font(.subheadline).foregroundStyle(c.mensajes_sin_leer > 0 ? Color.tinta : Color.tinta2).lineLimit(2)
                Text(c.estado == "escalada" ? "Pidió una persona por \(c.canalNombre)" : c.canalNombre).font(.footnote).foregroundStyle(c.estado == "escalada" ? Color.alerta : Color.tinta3)
            }
        }
        .padding(.vertical, 2)
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
                    .foregroundStyle(sistema ? Color.tinta3 : m.autor == "agente" ? Color.white : Color.tinta)
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
