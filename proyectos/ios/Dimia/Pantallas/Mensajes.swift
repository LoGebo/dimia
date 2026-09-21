import SwiftUI

struct MensajesPantalla: View {
    @Environment(Sesion.self) private var sesion
    @State private var lista: [Conversacion] = []
    @State private var error: String?
    @State private var busqueda = ""

    var body: some View {
        NavigationStack {
            List {
                if let error { FilaError(texto: error) { Task { await cargar() } }.listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
                let visibles = busqueda.isEmpty ? lista : lista.filter { $0.nombre.localizedCaseInsensitiveContains(busqueda) || ($0.ultimo_mensaje ?? "").localizedCaseInsensitiveContains(busqueda) }
                if visibles.isEmpty && error == nil { Vacio(titulo: "Todavía nadie escribe", detalle: "Aquí aparece lo que entra por WhatsApp, teléfono y redes.").listRowBackground(Color.clear) }
                ForEach(visibles) { c in
                    NavigationLink(value: c) { FilaConversacion(c: c) }
                        .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 12))
                        .listRowBackground(Color.panel)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Color.fondo)
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
        HStack(alignment: .top, spacing: 12) {
            Cuadrado(color: c.estado == "escalada" ? .alerta : c.mensajes_sin_leer > 0 ? .acento : .clear, lado: 7).padding(.top, 7)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(c.nombre).font(.subheadline.weight(c.mensajes_sin_leer > 0 ? .bold : .semibold)).foregroundStyle(Color.tinta).lineLimit(1)
                    Spacer()
                    Text(Formato.relativo(c.ultimo_mensaje_en)).font(.caption).foregroundStyle(Color.tinta3)
                }
                Text(c.ultimo_mensaje ?? c.resumen ?? "").font(.footnote).foregroundStyle(c.mensajes_sin_leer > 0 ? Color.tinta : Color.tinta2).lineLimit(2)
                HStack(spacing: 6) {
                    Text(c.canalNombre).font(.caption2).foregroundStyle(Color.tinta3)
                    if c.estado == "escalada" { Text("· pidió una persona").font(.caption2.weight(.semibold)).foregroundStyle(Color.alerta) }
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
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
        .navigationSubtitle(conversacion.canalNombre + (conversacion.contacto.hasPrefix("+") ? " · " + Formato.telefono(conversacion.contacto) : ""))
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
                    Text((m.autor == "equipo" ? "Equipo · " : m.autor == "agente" ? "Agente · " : "") + Formato.hora(m.creado, zona: zona)).font(.caption2).foregroundStyle(Color.tinta3)
                }
            }
            .frame(maxWidth: sistema ? .infinity : nil, alignment: sistema ? .center : cliente ? .leading : .trailing)
            if cliente && !sistema { Spacer(minLength: 48) }
        }
    }
}
