import SwiftUI

/// El día en una lista: primero lo que necesita atención, luego tres cifras, luego lo que viene y lo que entró.
struct HoyPantalla: View {
    @Environment(Sesion.self) private var sesion
    @State private var hoy: Hoy?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error { Section { FilaError(texto: error) { Task { await cargar() } } } }
                if let hoy {
                    avisos(hoy)
                    cifras(hoy)
                    proximas(hoy)
                    entradas(hoy)
                } else if error == nil {
                    Section { ProgressView().frame(maxWidth: .infinity) }.listRowBackground(Color.clear)
                }
            }
            .listaDimia()
            .navigationTitle("Hoy")
            .navigationSubtitle(sesion.negocio?.nombre ?? "")
            .toolbar { BotonAjustes() }
            .refreshable { await cargar() }
            .task(id: sesion.negocio?.id) { await cargar() }
            .navigationDestination(for: Conversacion.self) { HiloConversacion(conversacion: $0) }
        }
    }

    private func cargar() async {
        do { hoy = try await API.obtener(sesion.ruta + "/hoy"); error = nil }
        catch { self.error = error.localizedDescription }
    }

    @ViewBuilder private func avisos(_ h: Hoy) -> some View {
        let a = h.avisos
        let lista: [(String, String, Color)] = [
            a.retrasadas > 0 ? (a.retrasadas == 1 ? "Una persona lleva más de 15 minutos de retraso" : "\(a.retrasadas) personas llevan más de 15 minutos de retraso", "\(a.retrasadas)", .critico) : nil,
            a.escaladas > 0 ? (a.escaladas == 1 ? "Una conversación pidió una persona" : "\(a.escaladas) conversaciones pidieron una persona", "\(a.escaladas)", .alerta) : nil,
            a.recados > 0 ? (a.recados == 1 ? "Un recado espera que le marque" : "\(a.recados) recados esperan que le marque", "\(a.recados)", .alerta) : nil,
            a.por_cobrar_atendidas > 0 ? (a.por_cobrar_atendidas == 1 ? "Una cita atendida hoy sin cobro registrado" : "\(a.por_cobrar_atendidas) citas atendidas hoy sin cobro registrado", "\(a.por_cobrar_atendidas)", .alerta) : nil,
            a.cobros_pendientes > 0 ? (a.cobros_pendientes == 1 ? "Un pago pendiente por cobrar" : "\(a.cobros_pendientes) pagos pendientes por cobrar", Formato.moneda(a.cobros_monto), .alerta) : nil,
        ].compactMap { $0 }
        if !lista.isEmpty {
            Section("Necesita atención") {
                ForEach(Array(lista.enumerated()), id: \.offset) { _, fila in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Cuadrado(color: fila.2).padding(.top, 5)
                        Text(fila.0).font(.body).foregroundStyle(Color.tinta)
                        Spacer(minLength: 8)
                        Text(fila.1).font(.cifra(.body)).foregroundStyle(Color.tinta2)
                    }
                }
            }
        }
    }

    private func cifras(_ h: Hoy) -> some View {
        let agenda = sesion.negocio?.agenda ?? true
        let citas = h.citas.filter { $0.estado != "cancelada" }.count
        return Section {
            HStack(alignment: .top, spacing: 0) {
                if agenda { cifra("\(citas)", citas == 1 ? "cita hoy" : "citas hoy") }
                cifra(Formato.moneda(h.cobros.cobrado), "cobrado hoy")
                cifra("\(h.avisos.mensajes_sin_leer)", "sin leer")
            }
            .padding(.vertical, 6)
        }
    }

    private func cifra(_ valor: String, _ etiqueta: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(valor).font(.cifra(.title2, peso: .semibold)).foregroundStyle(Color.tinta)
            Text(etiqueta).font(.subheadline).foregroundStyle(Color.tinta3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private func proximas(_ h: Hoy) -> some View {
        if sesion.negocio?.agenda ?? true {
            let porLlegar = Array(h.citas.filter { $0.estado == "confirmada" && $0.llegada == nil }.prefix(7))
            Section("Lo que viene") {
                if porLlegar.isEmpty {
                    Vacio(titulo: h.citas.isEmpty ? "Hoy no hay citas." : "Ya atendió a todos.", detalle: h.citas.isEmpty ? "Las que agende el agente por teléfono aparecen aquí solas." : nil)
                } else {
                    ForEach(porLlegar) { FilaCita(cita: $0, zona: h.zona_horaria) }
                }
            }
        }
    }

    private func entradas(_ h: Hoy) -> some View {
        Section("Lo último que entró") {
            if h.conversaciones.isEmpty {
                Vacio(titulo: "Todavía nadie escribe.", detalle: "Lo que llegue por WhatsApp, teléfono y redes aparece aquí.")
            } else {
                ForEach(h.conversaciones) { c in NavigationLink(value: c) { FilaConversacion(c: c) } }
            }
        }
    }
}

struct FilaCita: View {
    var cita: Cita
    var zona: String
    var body: some View {
        let faltan = Int(cita.inicio.timeIntervalSince(.now) / 60)
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(Formato.hora(cita.inicio, zona: zona)).font(.cifra(.body, peso: .regular)).foregroundStyle(Color.tinta2).frame(width: 48, alignment: .leading)
            VStack(alignment: .leading, spacing: 3) {
                Text(cita.cliente_nombre).font(.body.weight(.medium)).foregroundStyle(Color.tinta).lineLimit(1)
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(cita.servicio + " con " + cita.recurso).font(.subheadline).foregroundStyle(Color.tinta3).lineLimit(1)
                    Spacer(minLength: 4)
                    if let c = cita.confirmacion { Estampa(texto: c, tono: c == "Confirmó" ? .bueno : .alerta).fixedSize() }
                    if cita.estado == "confirmada" && cita.llegada == nil {
                        Estampa(texto: faltan < 0 ? "lleva \(Formato.minutos(-faltan))" : "en \(Formato.minutos(max(0, faltan)))", tono: faltan < -15 ? .critico : faltan < 0 ? .alerta : .tinta3).fixedSize()
                    } else if cita.llegada != nil || cita.estado == "completada" {
                        Estampa(texto: cita.estado == "completada" ? "Atendida" : "Llegó", tono: .bueno).fixedSize()
                    } else if cita.estado == "cancelada" {
                        Estampa(texto: "Cancelada", tono: .tinta3).fixedSize()
                    }
                }
            }
        }
        .padding(.vertical, 2)
    }
}
