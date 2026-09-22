import SwiftUI

/// La agenda: mes en la serif de la marca, tira de la semana (se desliza para cambiar de semana)
/// y el día sobre una línea de tiempo.
struct AgendaPantalla: View {
    @Environment(Sesion.self) private var sesion
    @State private var dia = Date()
    @State private var semana: [Cita] = []      // toda la semana visible; el día se filtra de aquí
    @State private var error: String?
    @State private var cargando = false

    private var zona: String { sesion.negocio?.zona_horaria ?? "America/Mexico_City" }
    private var calendario: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: zona) ?? .current; c.locale = Locale(identifier: "es_MX"); c.firstWeekday = 2; return c }

    private func iso(_ d: Date) -> String { let f = DateFormatter(); f.calendar = calendario; f.timeZone = calendario.timeZone; f.dateFormat = "yyyy-MM-dd"; return f.string(from: d) }
    private var inicioSemana: Date { calendario.dateInterval(of: .weekOfYear, for: dia)?.start ?? dia }
    private var delDia: [Cita] { semana.filter { calendario.isDate($0.inicio, inSameDayAs: dia) } }
    private var conCitas: Set<String> { Set(semana.filter { $0.estado != "cancelada" }.map { iso($0.inicio) }) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    TiraSemana(dia: $dia, calendario: calendario, conCitas: conCitas)
                        .padding(.horizontal, 12)
                        .gesture(DragGesture(minimumDistance: 30).onEnded { g in
                            if abs(g.translation.width) > abs(g.translation.height) { mover(g.translation.width < 0 ? 7 : -7) }
                        })

                    if let error { FilaError(texto: error) { Task { await cargar() } }.padding(.horizontal, 16) }

                    let visibles = delDia.filter { $0.estado != "cancelada" }
                    HStack(alignment: .firstTextBaseline) {
                        Text(Formato.fecha(dia, zona: zona, larga: true).capitalizedFirst).font(.title3.weight(.semibold)).foregroundStyle(Color.tinta)
                        Spacer()
                        Text(visibles.isEmpty ? "Sin citas" : visibles.count == 1 ? "Una cita" : "\(visibles.count) citas").font(.subheadline).foregroundStyle(Color.tinta3)
                    }
                    .padding(.horizontal, 20)

                    if visibles.isEmpty && !cargando && error == nil {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(calendario.isDateInToday(dia) ? "Hoy no hay citas." : "Este día está libre.").font(.body).foregroundStyle(Color.tinta)
                            Text("Las que agende el agente por teléfono o WhatsApp aparecen aquí solas.").font(.subheadline).foregroundStyle(Color.tinta3)
                        }
                        .padding(20).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.panel, in: .rect(cornerRadius: 16))
                        .padding(.horizontal, 16)
                    } else {
                        LineaTiempo(citas: delDia, zona: zona, hoy: calendario.isDateInToday(dia))
                            .padding(.horizontal, 16)
                    }
                }
                .padding(.top, 4).padding(.bottom, 24)
            }
            .background(Color.fondo)
            .navigationTitle(mes)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Hoy") { withAnimation(.snappy) { dia = Date() } }.disabled(calendario.isDateInToday(dia))
                }
                BotonAjustes()
            }
            .refreshable { await cargar() }
            .task(id: "\(sesion.negocio?.id.uuidString ?? "")-\(iso(inicioSemana))") { await cargar() }
        }
    }

    private var mes: String {
        let f = DateFormatter(); f.locale = Locale(identifier: "es_MX"); f.timeZone = calendario.timeZone; f.dateFormat = "MMMM yyyy"
        return f.string(from: dia).capitalizedFirst
    }

    private func mover(_ n: Int) { withAnimation(.snappy) { dia = calendario.date(byAdding: .day, value: n, to: dia) ?? dia } }

    private func cargar() async {
        cargando = true
        defer { cargando = false }
        let fin = calendario.date(byAdding: .day, value: 6, to: inicioSemana) ?? inicioSemana
        do { semana = try await API.obtener(sesion.ruta + "/agenda?dia=\(iso(inicioSemana))&hasta=\(iso(fin))"); error = nil }
        catch { self.error = error.localizedDescription }
    }
}
