import SwiftUI

/// El día contado, no un tablero: la portada dice cómo va y qué sigue; debajo, lo que necesita
/// atención, el día en su línea de tiempo, lo que dicen sus agentes y lo último que entró.
struct HoyPantalla: View {
    @Environment(Sesion.self) private var sesion
    @State private var hoy: Hoy?
    @State private var agentes: [Agente] = []
    @State private var ultimos: [UUID: UltimoMensaje] = [:]
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    if let error { FilaError(texto: error) { Task { await cargar() } } }
                    if let hoy {
                        portada(hoy)
                        avisos(hoy)
                        dia(hoy)
                        if !agentes.isEmpty { misAgentes }
                        entradas(hoy)
                    } else if error == nil {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
            .background(Color.fondo)
            .navigationTitle(sesion.negocio?.nombre ?? "Hoy")
            .toolbar { BotonAjustes() }
            .refreshable { await cargar() }
            .task(id: sesion.negocio?.id) { await cargar() }
            .navigationDestination(for: Conversacion.self) { HiloConversacion(conversacion: $0) }
        }
    }

    private func cargar() async {
        do {
            let h: Hoy = try await API.obtener(sesion.ruta + "/hoy")
            withAnimation(.snappy) { hoy = h }; error = nil
        } catch { self.error = error.localizedDescription }
        agentes = (try? await API.obtener(sesion.ruta + "/agentes")) ?? []
        if let lista: [UltimoMensaje] = try? await API.obtener(sesion.ruta + "/agentes/ultimos") {
            ultimos = Dictionary(uniqueKeysWithValues: lista.map { ($0.agente_id, $0) })
        }
    }

    // MARK: portada

    /// Saludo, fecha, una frase con cómo va el día y la siguiente cita: lo que se lee en tres segundos.
    private func portada(_ h: Hoy) -> some View {
        let hora = Calendar.current.component(.hour, from: .now)
        let saludo = hora < 12 ? "Buenos días." : hora < 19 ? "Buenas tardes." : "Buenas noches."
        let siguiente = h.citas.first { $0.estado == "confirmada" && $0.llegada == nil && $0.fin > .now }
        return Tinta {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(saludo).font(.editorial(34))
                    Text(Formato.fecha(.now, zona: h.zona_horaria, larga: true).capitalizedFirst).font(.subheadline).opacity(0.72)
                }
                Text(frase(h)).font(.body).lineSpacing(3).opacity(0.92)
                if sesion.negocio?.agenda ?? true {
                    Divider().overlay(Color(UIColor(hex: 0xeef1f7)).opacity(0.18))
                    if let s = siguiente {
                        Button { sesion.pestana = "agenda" } label: {
                            HStack(spacing: 12) {
                                Text(Formato.hora(s.inicio, zona: h.zona_horaria)).font(.editorial(26)).monospacedDigit()
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(s.cliente_nombre).font(.subheadline.weight(.semibold))
                                    Text(s.servicio).font(.footnote).opacity(0.72)
                                }
                                Spacer()
                                Text(s.inicio > .now ? "en \(Formato.minutos(Int(s.inicio.timeIntervalSince(.now) / 60)))" : "ahora").font(.footnote.monospacedDigit()).opacity(0.72)
                            }
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text(h.citas.isEmpty ? "Sin citas para hoy." : "Ya no hay citas por llegar.").font(.subheadline).opacity(0.72)
                    }
                }
            }
            .padding(22)
        }
    }

    /// Una frase, en español de México, con lo que importa: citas, sin leer, cobrado.
    private func frase(_ h: Hoy) -> String {
        let agenda = sesion.negocio?.agenda ?? true
        let citas = h.citas.filter { $0.estado != "cancelada" }.count
        var partes: [String] = []
        if agenda { partes.append(citas == 0 ? "no tiene citas" : citas == 1 ? "tiene una cita" : "tiene \(citas) citas") }
        let sinLeer = h.avisos.mensajes_sin_leer
        partes.append(sinLeer == 0 ? "nada sin leer" : sinLeer == 1 ? "un mensaje sin leer" : "\(sinLeer) mensajes sin leer")
        if h.cobros.cobrado.valor > 0 { partes.append("lleva \(Formato.moneda(h.cobros.cobrado)) cobrados") }
        let cuerpo = partes.count > 1 ? partes.dropLast().joined(separator: ", ") + " y " + partes.last! : partes[0]
        return "Hoy " + cuerpo + "."
    }

    // MARK: secciones

    private func titulo(_ t: String, accion: String? = nil, ir: (() -> Void)? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(t).font(.title3.weight(.semibold)).foregroundStyle(Color.tinta)
            Spacer()
            if let accion, let ir { Button(accion, action: ir).font(.subheadline.weight(.medium)) }
        }
        .padding(.horizontal, 4)
    }

    @ViewBuilder private func avisos(_ h: Hoy) -> some View {
        let a = h.avisos
        let lista: [(String, String, Color, String?)] = [
            a.retrasadas > 0 ? (a.retrasadas == 1 ? "Una persona lleva más de 15 minutos de retraso" : "\(a.retrasadas) personas llevan más de 15 minutos de retraso", "\(a.retrasadas)", .critico, "agenda") : nil,
            a.escaladas > 0 ? (a.escaladas == 1 ? "Una conversación pidió una persona" : "\(a.escaladas) conversaciones pidieron una persona", "\(a.escaladas)", .alerta, "mensajes") : nil,
            a.recados > 0 ? (a.recados == 1 ? "Un recado espera que le marque" : "\(a.recados) recados esperan que le marque", "\(a.recados)", .alerta, nil) : nil,
            a.por_cobrar_atendidas > 0 ? (a.por_cobrar_atendidas == 1 ? "Una cita atendida hoy sin cobro registrado" : "\(a.por_cobrar_atendidas) citas atendidas hoy sin cobro registrado", "\(a.por_cobrar_atendidas)", .alerta, "agenda") : nil,
            a.cobros_pendientes > 0 ? (a.cobros_pendientes == 1 ? "Un pago pendiente por cobrar" : "\(a.cobros_pendientes) pagos pendientes por cobrar", Formato.moneda(a.cobros_monto), .alerta, nil) : nil,
        ].compactMap { $0 }
        if !lista.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                titulo("Necesita atención")
                VStack(spacing: 0) {
                    ForEach(Array(lista.enumerated()), id: \.offset) { i, fila in
                        Button { if let p = fila.3 { sesion.pestana = p } } label: {
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Cuadrado(color: fila.2).padding(.top, 5)
                                Text(fila.0).font(.body).foregroundStyle(Color.tinta).multilineTextAlignment(.leading)
                                Spacer(minLength: 8)
                                Text(fila.1).font(.cifra(.body)).foregroundStyle(Color.tinta2)
                                if fila.3 != nil { Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(Color.tinta3) }
                            }
                            .padding(.horizontal, 16).padding(.vertical, 13)
                        }
                        .buttonStyle(.plain)
                        .disabled(fila.3 == nil)
                        if i < lista.count - 1 { Divider().padding(.leading, 35) }
                    }
                }
                .background(Color.panel, in: .rect(cornerRadius: 16))
            }
        }
    }

    @ViewBuilder private func dia(_ h: Hoy) -> some View {
        if sesion.negocio?.agenda ?? true, !h.citas.filter({ $0.estado != "cancelada" }).isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                titulo("Su día", accion: "Agenda") { sesion.pestana = "agenda" }
                LineaTiempo(citas: h.citas, zona: h.zona_horaria, hoy: true, maximo: 5)
            }
        }
    }

    private var misAgentes: some View {
        VStack(alignment: .leading, spacing: 10) {
            titulo("Sus agentes", accion: "Todos") { sesion.pestana = "agentes" }
            VStack(spacing: 0) {
                ForEach(Array(agentes.prefix(4).enumerated()), id: \.element.id) { i, a in
                    Button { sesion.pestana = "agentes" } label: {
                        HStack(spacing: 12) {
                            AvatarAgente(nombre: a.nombre, avatar: a.avatar, tamano: 40)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(a.nombre).font(.body.weight(.semibold)).foregroundStyle(Color.tinta)
                                    Spacer()
                                    if let u = ultimos[a.id] { Text(Formato.cuando(u.creado)).font(.footnote).foregroundStyle(Color.tinta3) }
                                }
                                Text(ultimos[a.id].map { ($0.de == "yo" ? "Usted: " : "") + $0.texto.replacingOccurrences(of: "\n", with: " ") } ?? a.trabajo ?? "Sin trabajo todavía")
                                    .font(.subheadline).foregroundStyle(Color.tinta2).lineLimit(1)
                            }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                    }
                    .buttonStyle(.plain)
                    if i < min(agentes.count, 4) - 1 { Divider().padding(.leading, 66) }
                }
            }
            .background(Color.panel, in: .rect(cornerRadius: 16))
        }
    }

    private func entradas(_ h: Hoy) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            titulo("Lo último que entró", accion: "Mensajes") { sesion.pestana = "mensajes" }
            VStack(spacing: 0) {
                if h.conversaciones.isEmpty {
                    Vacio(titulo: "Todavía nadie escribe.", detalle: "Lo que llegue por WhatsApp, teléfono y redes aparece aquí.").padding(.horizontal, 16).padding(.vertical, 8)
                }
                ForEach(Array(h.conversaciones.enumerated()), id: \.element.id) { i, c in
                    NavigationLink(value: c) { FilaConversacion(c: c).padding(.horizontal, 14).padding(.vertical, 6) }.buttonStyle(.plain)
                    if i < h.conversaciones.count - 1 { Divider().padding(.leading, 76) }
                }
            }
            .background(Color.panel, in: .rect(cornerRadius: 16))
        }
    }
}
