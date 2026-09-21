import SwiftUI

struct HoyPantalla: View {
    @Environment(Sesion.self) private var sesion
    @State private var hoy: Hoy?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let error { FilaError(texto: error) { Task { await cargar() } } }
                    if let hoy {
                        avisos(hoy)
                        cifras(hoy)
                        proximas(hoy)
                        entradas(hoy)
                    } else if error == nil {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                    }
                }
                .padding(16)
            }
            .background(Color.fondo)
            .navigationTitle("Hoy")
            .navigationSubtitle(sesion.negocio?.nombre ?? "")
            .toolbar { BotonAjustes() }
            .refreshable { await cargar() }
            .task(id: sesion.negocio?.id) { await cargar() }
        }
    }

    private func cargar() async {
        do { hoy = try await API.obtener(sesion.ruta + "/hoy"); error = nil }
        catch { self.error = error.localizedDescription }
    }

    @ViewBuilder private func avisos(_ h: Hoy) -> some View {
        let a = h.avisos
        let lista: [(String, String, Color)] = [
            a.retrasadas > 0 ? ("\(a.retrasadas == 1 ? "Una persona lleva" : "\(a.retrasadas) personas llevan") más de 15 minutos de retraso", "\(a.retrasadas)", .critico) : nil,
            a.escaladas > 0 ? ("\(a.escaladas == 1 ? "Una conversación pidió" : "\(a.escaladas) conversaciones pidieron") una persona", "\(a.escaladas)", .alerta) : nil,
            a.recados > 0 ? ("\(a.recados == 1 ? "Un recado espera" : "\(a.recados) recados esperan") que le marque", "\(a.recados)", .alerta) : nil,
            a.por_cobrar_atendidas > 0 ? ("\(a.por_cobrar_atendidas == 1 ? "Una cita atendida hoy" : "\(a.por_cobrar_atendidas) citas atendidas hoy") sin cobro registrado", "\(a.por_cobrar_atendidas)", .alerta) : nil,
            a.cobros_pendientes > 0 ? ("Por cobrar en \(a.cobros_pendientes == 1 ? "un pago pendiente" : "\(a.cobros_pendientes) pagos pendientes")", Formato.moneda(a.cobros_monto), .alerta) : nil,
        ].compactMap { $0 }
        if !lista.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Rotulo(texto: "Necesita atención")
                Tarjeta {
                    ForEach(Array(lista.enumerated()), id: \.offset) { i, fila in
                        HStack(spacing: 12) {
                            Cuadrado(color: fila.2)
                            Text(fila.0).font(.subheadline).foregroundStyle(Color.tinta).lineLimit(2)
                            Spacer(minLength: 8)
                            Text(fila.1).font(.cifra(.subheadline)).foregroundStyle(Color.tinta)
                        }
                        .padding(.horizontal, 14).frame(minHeight: 44)
                        if i < lista.count - 1 { Divider().overlay(Color.linea) }
                    }
                }
            }
        }
    }

    private func cifras(_ h: Hoy) -> some View {
        let agenda = sesion.negocio?.agenda ?? true
        let atendidas = h.citas.filter { $0.estado == "completada" || $0.llegada != nil }.count
        return VStack(alignment: .leading, spacing: 8) {
            Rotulo(texto: "Indicadores")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                if agenda { kpi("Citas de hoy", "\(h.citas.filter { $0.estado != "cancelada" }.count)", "\(atendidas) atendidas") }
                kpi("Cobrado hoy", Formato.moneda(h.cobros.cobrado), "\(h.cobros.operaciones) \(h.cobros.operaciones == 1 ? "cobro" : "cobros")")
                kpi("Sin leer", "\(h.avisos.mensajes_sin_leer)", h.avisos.escaladas > 0 ? "\(h.avisos.escaladas) piden persona" : "al día")
                kpi("Por cobrar", Formato.moneda(h.cobros.pendiente), "\(h.avisos.cobros_pendientes) pendientes")
            }
        }
    }

    private func kpi(_ etiqueta: String, _ valor: String, _ unidad: String) -> some View {
        Tarjeta {
            VStack(alignment: .leading, spacing: 4) {
                Text(etiqueta).font(.caption).foregroundStyle(Color.tinta3)
                Text(valor).font(.cifra(.title2, peso: .bold)).foregroundStyle(Color.tinta)
                Text(unidad).font(.caption).foregroundStyle(Color.tinta2)
            }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder private func proximas(_ h: Hoy) -> some View {
        if sesion.negocio?.agenda ?? true {
            let porLlegar = h.citas.filter { $0.estado == "confirmada" && $0.llegada == nil }.prefix(7)
            VStack(alignment: .leading, spacing: 8) {
                Rotulo(texto: "Lo que viene")
                Tarjeta {
                    if porLlegar.isEmpty {
                        Vacio(titulo: h.citas.isEmpty ? "Día libre" : "Todas atendidas", detalle: h.citas.isEmpty ? "El agente agenda por teléfono; aquí aparecen solas." : nil)
                    } else {
                        ForEach(Array(porLlegar.enumerated()), id: \.element.id) { i, c in
                            FilaCita(cita: c, zona: h.zona_horaria)
                            if i < porLlegar.count - 1 { Divider().overlay(Color.linea) }
                        }
                    }
                }
            }
        }
    }

    private func entradas(_ h: Hoy) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Rotulo(texto: "Lo último que entró")
            Tarjeta {
                if h.conversaciones.isEmpty {
                    Vacio(titulo: "Todavía nadie escribe")
                } else {
                    ForEach(Array(h.conversaciones.enumerated()), id: \.element.id) { i, c in
                        NavigationLink(value: c) { FilaConversacion(c: c) }.buttonStyle(.plain)
                        if i < h.conversaciones.count - 1 { Divider().overlay(Color.linea) }
                    }
                }
            }
        }
        .navigationDestination(for: Conversacion.self) { HiloConversacion(conversacion: $0) }
    }
}

struct FilaCita: View {
    var cita: Cita
    var zona: String
    var body: some View {
        let faltan = Int(cita.inicio.timeIntervalSince(.now) / 60)
        HStack(spacing: 12) {
            Text(Formato.hora(cita.inicio, zona: zona)).font(.cifra(.subheadline)).foregroundStyle(Color.tinta).frame(width: 46, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(cita.cliente_nombre).font(.subheadline.weight(.semibold)).foregroundStyle(Color.tinta).lineLimit(1)
                Text("\(cita.servicio) · \(cita.recurso)").font(.caption).foregroundStyle(Color.tinta3).lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                if let c = cita.confirmacion { Estampa(texto: c, tono: c == "Confirmó" ? .bueno : .alerta) }
                if cita.estado == "confirmada" && cita.llegada == nil {
                    Estampa(texto: faltan < 0 ? "+\(Formato.minutos(-faltan))" : "en \(Formato.minutos(max(0, faltan)))", tono: faltan < -15 ? .critico : faltan < 0 ? .alerta : .tinta3)
                } else if cita.llegada != nil || cita.estado == "completada" {
                    Estampa(texto: cita.estado == "completada" ? "Atendida" : "Llegó", tono: .bueno)
                } else if cita.estado == "cancelada" {
                    Estampa(texto: "Cancelada", tono: .tinta3)
                }
            }
        }
        .padding(.horizontal, 14).frame(minHeight: 56)
    }
}

struct Estampa: View {
    var texto: String
    var tono: Color
    var body: some View {
        HStack(spacing: 5) { Cuadrado(color: tono, lado: 5); Text(texto).font(.caption2.weight(.semibold).monospacedDigit()).foregroundStyle(tono) }
    }
}
